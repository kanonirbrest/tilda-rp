# DEI Tickets — билеты, оплата, QR, персонал

Скелет сервиса: выбор слота → контакты → (bePaid или режим разработки) → PDF с QR → письмо → вебхук в CRM → сканирование и отметка «прошёл».

## Что уже сделано в коде

- PostgreSQL + Prisma: слоты, клиенты, заказы, билеты с `publicToken`, персонал, идемпотентность вебхуков bePaid.
- Публичные страницы: `/`, `/tickets`, `/checkout`, `/success`.
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

Откройте [http://localhost:3000](http://localhost:3000) → «Купить билет» → оформите заказ. На странице успеха появится ссылка на PDF.

Персонал: [http://localhost:3000/staff/login](http://localhost:3000/staff/login) → сканер или вставка содержимого QR → «Клиент прошёл».

## Подключение bePaid

1. Получите у bePaid `shop_id` и секрет, уточните **точный URL API** и формат тела запроса/ответа (они могут отличаться по продукту) — сверьте с [документацией bePaid](https://docs.bepaid.by/).
2. В `.env` укажите `BEPAID_SHOP_ID`, `BEPAID_SECRET_KEY`, при необходимости `BEPAID_API_URL`.
3. Установите **`DEV_SKIP_PAYMENT=false`** (или удалите переменную).
4. В личном кабинете bePaid укажите URL вебхука:  
   `https://<ваш-домен>/api/webhooks/bepaid`  
5. Проверьте, что в ответе создания платежа действительно приходят `uid` и `redirect_url` — при отличии полей поправьте `src/lib/bepaid.ts` и при необходимости парсер в `src/app/api/webhooks/bepaid/route.ts`.
6. Добавьте **проверку подписи** вебхука по документации bePaid (сейчас в коде её нет — только идемпотентность по `uid`).

## Почта (PDF на email)

Заполните `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.  
Если SMTP не задан, содержимое письма и ссылка на PDF **логируются в консоль** сервера.

## Tilda и сайт dei.by

1. На странице [https://dei.by/tickets](https://dei.by/tickets) кнопки «Купить» ведите на **ваш** хост, например:  
   `https://pay.dei.by/tickets`  
   или сразу на слот:  
   `https://pay.dei.by/checkout?slotId=<id_из_prisma_studio>`.
2. ID слотов удобно смотреть в `npm run db:studio` или завести отдельную страницу-редирект по «человеческим» кодам (можно добавить позже поле `slug` у слота).

## Вебхук в Tilda CRM / Make

1. Создайте приёмник (вебхук формы, Make-сценарий и т.д.) и вставьте URL в `TILDA_CRM_WEBHOOK_URL`.
2. При необходимости задайте `TILDA_CRM_WEBHOOK_SECRET` — тогда запрос уйдёт с заголовком `Authorization: Bearer <секрет>`.
3. Тело JSON описано в `src/lib/crm.ts` (`ticket_paid` и `ticket_used`). Подстройте маппинг полей под вашу воронку.

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

## Следующие шаги (по желанию)

- Проверка подписи вебхука bePaid.
- Поля `slug` у слота и красивые ссылки с Tilda.
- Админка для слотов и отчётов.
- Отдельный поддомен только для `/staff/*` и базовая защита (IP, VPN).
