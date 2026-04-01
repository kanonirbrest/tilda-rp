# DEI Tickets — статическая админка

Сборка: `npm ci && npm run build` → каталог `dist/`.

- Локальный превью: `npm run preview` (Next.js должен быть запущен отдельно, если `VITE_API_BASE` пустой — см. ниже)
- GitHub Pages: в корне репозитория см. [`.github/workflows/deploy-admin-pages.yml`](../.github/workflows/deploy-admin-pages.yml)

Если сайт открывается не с корня (например `https://user.github.io/repo-name/`), при сборке задайте `VITE_BASE_PATH=/repo-name/` — в CI это уже подставляется из имени репозитория.

На сервере Next.js нужны `ADMIN_API_SECRET` и `ADMIN_CORS_ORIGIN` (см. основной `README.md`).

## Обязательный `.env`

Скопируйте [`.env.example`](./.env.example) в **`.env`** в каталоге `admin-ui/` и задайте:

- **`VITE_ADMIN_TOKEN`** — тот же секрет, что **`ADMIN_API_SECRET`** на сервере.
- **`VITE_API_BASE`** — в **production** (GitHub Pages / статика): полный URL Next.js, например `https://dei-tickets.onrender.com` (без `/` в конце).
- Локально в **`npm run dev`**: можно **`VITE_API_BASE=`** оставить пустым — запросы идут на `/api`, Vite проксирует на Next. Задайте **`VITE_DEV_PROXY_TARGET`** — тот же хост:порт, что в строке `next dev` (часто `http://127.0.0.1:3000`).

**Риск:** токен попадает в собранный JS на проде.

### «502 Bad Gateway» или «Failed to fetch» локально

1. Сначала запустите **Next.js** в корне `dei-tickets`: `npm run dev` и посмотрите **порт** в терминале (3000, 3001, …).
2. В **`admin-ui/.env`** выставьте **`VITE_DEV_PROXY_TARGET=http://127.0.0.1:ПОРТ`** ровно этот порт.
3. Либо укажите **`VITE_API_BASE=http://127.0.0.1:ПОРТ`** и уберите зависимость от прокси.
4. Для **`npm run preview`**: тот же **`VITE_DEV_PROXY_TARGET`**, Next должен быть запущен; иначе прокси вернёт 502.

На GitHub: **Settings → Secrets and variables → Actions** — секрет `VITE_ADMIN_TOKEN`; **Variables** — `VITE_API_BASE` (workflow передаёт их в `npm run build`).
