# DEI Tickets — статическая админка

Сборка: `npm ci && npm run build` → каталог `dist/`.

- Локальный превью: `npm run preview`
- GitHub Pages: в корне репозитория см. [`.github/workflows/deploy-admin-pages.yml`](../.github/workflows/deploy-admin-pages.yml)

Если сайт открывается не с корня (например `https://user.github.io/repo-name/`), при сборке задайте `VITE_BASE_PATH=/repo-name/` — в CI это уже подставляется из имени репозитория.

На сервере Next.js нужны `ADMIN_API_SECRET` и `ADMIN_CORS_ORIGIN` (см. основной `README.md`).
