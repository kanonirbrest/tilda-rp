# Сборка Next.js (standalone) + Prisma для продакшена
FROM node:20-bookworm-slim AS base
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# postinstall вызывает prisma generate — схемы ещё нет, generate выполняется в builder
RUN npm ci --ignore-scripts

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

# Chromium для PDF билетов (Playwright). Фиксированный каталог: у пользователя nextjs часто HOME=/nonexistent,
# из‑за этого дефолтный ~/.cache/ms-playwright в контейнере недоступен.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
RUN mkdir -p /opt/ms-playwright \
  && npx playwright install-deps chromium \
  && npx playwright install chromium

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Системные .so для Chromium должны быть установлены именно в этом образе (не переносятся из stage builder).
# Ручной список apt легко разъехаться с версией Playwright; здесь тот же шаг, что рекомендует Playwright
# для текущей версии под Debian. Версия берётся из package-lock приложения.
WORKDIR /__pwdeps
COPY --from=builder /app/package-lock.json ./package-lock.json
RUN set -eux; \
  PW_VER="$(node -p "require('./package-lock.json').packages['node_modules/playwright'].version")"; \
  printf '%s\n' "{\"private\":true,\"dependencies\":{\"playwright\":\"${PW_VER}\"}}" > package.json; \
  npm install --omit=dev; \
  npx playwright install-deps chromium; \
  cd / && rm -rf /__pwdeps /root/.npm

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Полный Prisma CLI только для migrate deploy (транзитивные deps не входят в Next standalone)
WORKDIR /migrate
RUN echo '{"private":true}' > package.json && npm install prisma@6.19.2 --omit=dev
COPY --from=builder /app/prisma ./prisma
RUN chown -R nextjs:nodejs /migrate

WORKDIR /app
COPY --from=builder /app/public ./public
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

COPY --from=builder /opt/ms-playwright /opt/ms-playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
RUN chown -R nextjs:nodejs /opt/ms-playwright

# Если в образе не хватает .so, сборка падает — не выкатываем «зелёный» деплой с битым Chromium.
RUN set -eux; \
  bin="$(find /opt/ms-playwright -name headless_shell -type f | head -n 1)"; \
  test -n "$bin"; \
  echo "ldd $bin"; \
  if ldd "$bin" 2>&1 | grep -q "not found"; then \
    echo "headless_shell: unresolved libs"; \
    ldd "$bin" || true; \
    exit 1; \
  fi

COPY --chmod=755 docker-entrypoint.sh ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ENTRYPOINT ["./docker-entrypoint.sh"]
