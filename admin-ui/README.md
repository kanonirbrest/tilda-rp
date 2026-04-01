# DEI Tickets — статическая админка

Сборка: `npm ci && npm run build` → каталог `dist/`.

- Локальный превью: `npm run preview`
- GitHub Pages: в корне репозитория см. [`.github/workflows/deploy-admin-pages.yml`](../.github/workflows/deploy-admin-pages.yml)

Если сайт открывается не с корня (например `https://user.github.io/repo-name/`), при сборке задайте `VITE_BASE_PATH=/repo-name/` — в CI это уже подставляется из имени репозитория.

На сервере Next.js нужны `ADMIN_API_SECRET` и `ADMIN_CORS_ORIGIN` (см. основной `README.md`).

## Обязательный `.env`

Скопируйте [`.env.example`](./.env.example) в **`.env`** в каталоге `admin-ui/` и задайте:

- **`VITE_API_BASE`** — например `https://dei-tickets.onrender.com` (без `/` в конце).
- **`VITE_ADMIN_TOKEN`** — тот же секрет, что **`ADMIN_API_SECRET`** на Render.

Без этих переменных админка не сможет вызывать API. **Риск:** токен попадает в собранный JS — на публичном GitHub Pages это компромисс по безопасности.

На GitHub: **Settings → Secrets and variables → Actions** — секрет `VITE_ADMIN_TOKEN`; **Variables** — `VITE_API_BASE` (workflow передаёт их в `npm run build`).
