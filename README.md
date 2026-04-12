# DEI Tickets — билеты, оплата, QR, персонал

Сервис: приём заказа с Тильды (`/pay` или `POST /api/orders`) → (bePaid или режим разработки) → PDF с QR → письмо → вебхук в CRM → сканирование и отметка «прошёл».

## Что уже сделано в коде

- PostgreSQL + Prisma: слоты, клиенты, заказы, билеты с `publicToken`, персонал, идемпотентность вебхуков bePaid.
- Публичные страницы: главная `/`, страница успеха `/success`. Оплата с лендинга Тильды — **`/pay`** или **`POST /api/orders`**.
- API: слоты, создание заказа, статус заказа, PDF билета, вебхук bePaid, вход персонала, verify/check-in.
- Страницы персонала: `/staff/login`, `/staff/scan` (камера + ручной ввод), `/staff/quick?t=…` (проверка и кнопка «Клиент прошёл»).
- Заглушки: отправка в Tilda CRM по `TILDA_CRM_WEBHOOK_URL`, SMTP для письма.

## Быстрый старт (локально)

### 1. PostgreSQL

В корне проекта:

```bash
docker compose up -d
```

### 2. Переменные окружения

```bash
cp .env.example .env
```

Обязательно задайте в `.env`:

- `DATABASE_URL` — как в `.env.example` (совпадает с `docker-compose.yml`).
- `SESSION_SECRET` — длинная случайная строка (для cookie персонала).
- `DEV_SKIP_PAYMENT=true` — **для первых тестов без bePaid**: заказ сразу считается оплаченным, уходит письмо (или лог), PDF доступен.

При необходимости: `APP_BASE_URL=http://localhost:3000`, `SUPPORT_EMAIL=…`.

### 3. Схема БД и демо-данные

```bash
npm install
npm run db:push
npm run db:seed
```

Сид создаёт:

- пользователя персонала: логин **`admin`**, пароль **`admin123`** (смените в продакшене);
- два демо-слота.

### 4. Запуск

```bash
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000). Тест оплаты: перейдите на **`/pay`** с параметрами слота и контактов (см. раздел про Тильду) или вызовите **`POST /api/orders`** из консоли/скрипта. На странице успеха появится ссылка на PDF.

Персонал: [http://localhost:3000/staff/login](http://localhost:3000/staff/login) → сканер или вставка содержимого QR → «Клиент прошёл».

Админка (слоты, лимиты, заказы): [http://localhost:3000/admin](http://localhost:3000/admin) — вход по секрету **`ADMIN_API_SECRET`** из `.env` (cookie на 7 дней, подпись через **`SESSION_SECRET`**).

## Подключение bePaid

1. Получите у bePaid `shop_id` и секрет, уточните **точный URL API** и формат тела запроса/ответа (они могут отличаться по продукту) — сверьте с [документацией bePaid](https://docs.bepaid.by/).
2. В `.env` укажите `BEPAID_SHOP_ID`, `BEPAID_SECRET_KEY`. **`BEPAID_API_URL`** задавайте только если менеджер bePaid дал другой endpoint; по умолчанию используется **Checkout API** `https://checkout.bepaid.by/ctp/api/checkouts` (старый `…/beyag/payments` на `gateway.bepaid.by` отвечает **404**).
3. **Тест полного цикла без реального списания:** `BEPAID_TEST=true` — в запрос Beyag добавляется `test: true` ([тестовый режим](https://docs.bepaid.by/ru/using_api/testing/)), на странице bePaid используйте [тестовые карты](https://docs.bepaid.by/ru/integration/card_api/testing/). На приёме настоящих платежей задайте **`false`** или не указывайте переменную. Это не то же самое, что `DEV_SKIP_PAYMENT` (тот режим bePaid вообще не вызывает).
4. Установите **`DEV_SKIP_PAYMENT=false`** (или удалите переменную).
5. В личном кабинете bePaid укажите URL вебхука:  
   `https://<ваш-домен>/api/webhooks/bepaid`  
6. Ответ Checkout: `checkout.token` и `checkout.redirect_url` — редирект покупателя на страницу оплаты bePaid. Вебхук сопоставляется с заказом по **токену**, `transaction.uid` или `order.tracking_id` (см. `src/app/api/webhooks/bepaid/route.ts`).
7. Добавьте **проверку подписи** вебхука по документации bePaid (сейчас в коде её нет — только идемпотентность по `uid`).

## Почта (PDF на email)

Заполните `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.  
Для **Gmail с облака** (например Render) чаще стабильнее порт **465** (implicit TLS), чем **587** — см. `render.yaml` / `.env.example`.  
Если SMTP не задан, содержимое письма и ссылка на PDF **логируются в консоль** сервера.

## Tilda и сайт dei.by

1. Сеансы и выбор билетов — на **странице Тильды**; в ссылки на бэкенд подставляйте **`slotId`** из админки **`/admin`** (или Prisma Studio) либо пару **`date`** + **`time`** в часовом поясе **`EXHIBITION_TIMEZONE`**.
2. **Сразу оплата** (после заполнения формы на Тильде): **`/pay`** проверяет слот в БД и делает редирект на bePaid (или на `/success` при `DEV_SKIP_PAYMENT=true`).  
   В ссылку нужно подставить поля формы и выбор сеанса, например:  
   `https://<хост>/pay?date=2026-04-15&time=14:00&adult=2&child=1&concession=0&name=ИМЯ&email=EMAIL&phone=ТЕЛЕФОН`  
   - `date` — `YYYY-MM-DD`, `time` — `HH:mm` (как у слота в БД, в `EXHIBITION_TIMEZONE`, по умолчанию `Europe/Minsk`)  
   - `adult`, `child`, `concession` — целые ≥ 0, сумма > 0  
   - `name`, `email`, `phone` — из формы Тильды (подставляются переменными формы в URL действия).  
   Имя и контакты в query видны в логах/прокси — используйте только **HTTPS**.  
2b. **Та же логика через `fetch` (JSON), без данных в URL** — `POST /api/orders` с заголовком `Content-Type: application/json`.  
   В продакшене задайте **`PUBLIC_ORDERS_CORS_ORIGIN`** — список origin страниц Тильды через запятую (как в браузере в заголовке `Origin`, без слэша в конце). В `development` CORS для API заказов разрешён с любого origin.  
   Тело: **`name`, `email`, `phone`**; слот — либо **`slotId`**, либо пара **`date`** (`YYYY-MM-DD`) и **`time`** (`HH:mm`); билеты — либо **`lines`** `[{ "tier": "ADULT"|"CHILD"|"CONCESSION", "quantity": n }]`, либо **`adult` / `child` / `concession`** (числа; при выборе по `date`+`time` без `lines` хотя бы одно количество &gt; 0).  
   Успех: JSON `{ "orderId", "redirectUrl" }` — открыть оплату: `window.location.href = redirectUrl` (URL уже абсолютный). Ошибки: JSON с полем `error` и при необходимости `hint`.  
3. У слота в БД можно задать **разные цены**: `priceAdultCents`, `priceChildCents`, `priceConcessionCents`; если не заданы, везде используется `priceCents`.  
4. **Лимит мест** — поле `capacity` (целое число): суммарно не больше стольких билетов (взрослые+детские+льготные) на сеанс. Учитываются заказы в статусах **PENDING** и **PAID** (незавершённая оплата временно держит места). `capacity = null` — без лимита. Просроченные **PENDING** (старше **`PENDING_ORDER_TTL_MINUTES`**, по умолчанию 30 минут) переводятся в **CANCELLED** без крона: при следующем **`/pay` / POST `/api/orders`** или при **GET `/api/admin/slots`**; поздний вебхук bePaid после такого истечения всё равно может довести заказ до **PAID** и отправить билет.  
5. Поле `slug` у слота для красивых ссылок — по желанию отдельной задачей.

## Мини-админка (слоты, лимиты, все покупки)

Встроена в приложение: страница **`/admin`**. Один набор переменных в `.env` сервера:

- **`ADMIN_API_SECRET`** — пароль при входе на `/admin` и по-прежнему заголовок **`Authorization: Bearer`** для внешних скриптов к `/api/admin/*`.
- **`SESSION_SECRET`** — уже нужен для персонала; им же подписывается httpOnly-cookie сессии админки после входа.

Опционально **`ADMIN_CORS_ORIGIN`** — если вызываете админ-API **с другого origin** (не с того же сайта, что Next).

Вкладки: **Слоты** — даты в `EXHIBITION_TIMEZONE`, `capacity`, оплачено / в ожидании (PENDING), создание и правка; **Все покупки** — заказы с клиентом и сеансом.

## Вебхук в Tilda CRM / Make

1. Создайте приёмник (вебхук формы, Make-сценарий и т.д.) и вставьте URL в `TILDA_CRM_WEBHOOK_URL`.
2. При необходимости задайте `TILDA_CRM_WEBHOOK_SECRET` — тогда запрос уйдёт с заголовком `Authorization: Bearer <секрет>`.
3. Тело JSON описано в `src/lib/crm.ts` (`ticket_paid` и `ticket_used`): есть `amountCents` (копейки) и `amountDisplay` (например `208.00 BYN`). Подстройте маппинг полей под вашу воронку.

## Продакшен

- Отдельный домен, HTTPS, `APP_BASE_URL` с `https`.
- Сильные пароли персонала, смена `admin` / `admin123`.
- `NODE_ENV=production`, `DEV_SKIP_PAYMENT=false` (или не задавать).
- Резервное копирование PostgreSQL.

### Docker (образ Next.js standalone + миграции Prisma при старте)

1. Скопируйте [`.env.production.example`](.env.production.example) в `.env.production`, задайте `POSTGRES_PASSWORD`, `SESSION_SECRET`, `APP_BASE_URL` (https), ключи bePaid и при необходимости SMTP.
2. Сборка образа: `docker build -t dei-tickets .` (из каталога `dei-tickets`).
3. Запуск вместе с PostgreSQL:  
   `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build`  
   Приложение слушает порт `APP_PORT` (по умолчанию 3000). Миграции выполняются в `docker-entrypoint.sh` (`prisma migrate deploy`), отключить: `SKIP_DB_MIGRATE=1`.
4. Первый вход персонала: после `npm run db:seed` локально или отдельным скриптом создайте пользователя в продакшен-БД (сид по умолчанию только для разработки).

Если БД уже есть снаружи, не поднимайте сервис `postgres` в compose и передайте контейнеру `DATABASE_URL` на ваш хост.

### Render

В репозитории есть [`render.yaml`](render.yaml): **Web Service (Docker)** + **Render PostgreSQL** (Frankfurt). По умолчанию в файле стоят планы **`free`** (удобно для тестов). Перед продакшеном в панели Render смените планы на платные.

**Ограничения free:** веб-сервис **засыпает** после простоя — первый запрос идёт с задержкой (cold start), вебхук bePaid в этот момент может не успеть или отработать с опозданием. Бесплатная PostgreSQL на Render имеет **лимиты срока/объёма** (актуальные условия — в [документации Render](https://render.com/docs)). Для реальных оплат надёжнее платные план веба и БД.

1. Залейте код в GitHub/GitLab (корень репозитория = каталог `dei-tickets`, где `Dockerfile` и `render.yaml`).
2. В [Render Dashboard](https://dashboard.render.com): **New** → **Blueprint** → выберите репозиторий → примените спецификацию.
3. При первом запуске заполните переменные с `sync: false` (ключи bePaid; `APP_BASE_URL` можно **не задавать** — подставится встроенный `RENDER_EXTERNAL_URL` с `https://…onrender.com`).
4. SMTP, `TILDA_CRM_*`, `SUPPORT_EMAIL` при необходимости добавьте в **Environment** сервиса вручную (см. [`.env.example`](.env.example)).
5. После деплоя в bePaid укажите вебхук: `https://<ваш-сервис>.onrender.com/api/webhooks/bepaid`.
6. Персонал в БД: один раз с локальной машины `npm run db:seed` с **External Database URL** из Render (или создайте пользователя вручную). Смените пароль с демо `admin` / `admin123`.

Если приложение лежит **в подпапке монорепозитория**, создайте Web Service вручную: **Docker**, **Root Directory** = подпапка с `Dockerfile`; PostgreSQL создайте отдельно и задайте `DATABASE_URL` из панели БД.

## Структура важных файлов

| Путь | Назначение |
|------|------------|
| `prisma/schema.prisma` | Модели БД |
| `src/app/api/orders/route.ts` | Создание заказа и старт оплаты |
| `src/lib/bepaid.ts` | Запрос к bePaid |
| `src/app/api/webhooks/bepaid/route.ts` | Вебхук оплаты |
| `src/lib/fulfill-order.ts` | Оплаченный заказ: PDF, почта, CRM |
| `src/app/api/tickets/[token]/pdf/route.ts` | Скачивание PDF |
| `src/app/staff/scan/scan-client.tsx` | Камера QR |
| `render.yaml` | Blueprint для Render (Docker + Postgres) |
| `src/app/api/admin/*` | Админ-API: Bearer `ADMIN_API_SECRET` или cookie после `/admin` |
| `src/app/admin/*` | Веб-админка `/admin` |

## Следующие шаги (по желанию)

- Проверка подписи вебхука bePaid.
- Поля `slug` у слота и красивые ссылки с Tilda.
- Отдельный поддомен только для `/staff/*` и базовая защита (IP, VPN).
