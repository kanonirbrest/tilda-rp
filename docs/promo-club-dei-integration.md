# Промокоды клуба DEI (NR-*) в dei-tickets

Полная инструкция по ролям бота и сайта: [promo-external-integration.txt](./promo-external-integration.txt).

## Разделение

| Источник | Где обрабатывается |
|----------|-------------------|
| `NR-XXXXXXXX` из Telegram-бота | `POST {PROMO_API_URL}/api/promo/redeem` (rp_bot) |
| Коды из админки (`/admin` → Промокоды) | PostgreSQL, модель `PromoCode` |

Код начинается с `NR-` → всегда API бота, **не** таблица `PromoCode`.

## Переменные окружения (dei-tickets)

| Переменная | Обязательно | Описание |
|------------|-------------|----------|
| `PROMO_API_URL` | да | URL rp_bot без `/` в конце |
| `PROMO_API_SECRET` | да | Bearer, **одинаковый** с rp_bot |
| `PROMO_DISCOUNT_PERCENT` | нет | Превью суммы (по умолчанию `10`) |
| `PROMO_CAMPAIGN_VALID_UNTIL` | нет | `01.07.2026`, конец дня по Минску |

## Поведение dei-tickets

1. **Превью** (`GET /api/public/order-quote?promoCode=…`, кнопка «Применить» на smr/Тильде) — оценка скидки **без** вызова redeem (код не гасится).
2. **Оплата** (`POST /api/orders`, `GET /pay`) — `redeem` на rp_bot; при успехе скидка по `discount_percent` из ответа API.
3. В заказе: `clubPromoCode`, `clubPromoTelegramUserId`, `discountCents`.

## Ошибки для пользователя

| `error` (API) | Сообщение на сайте |
|---------------|-------------------|
| `not_found` | Промокод не найден |
| `already_used` | Промокод уже использован |
| `campaign_expired` | Срок действия акции истёк |
| `invalid_format` | Неверный формат промокода |
| `unauthorized` / сеть / 5xx | Промокоды клуба временно недоступны |

## Чеклист перед продом

- [ ] `PROMO_API_SECRET` совпадает на Render (dei-tickets и rp_bot)
- [ ] Секрет только на бэкенде
- [ ] rp_bot в webhook-режиме, `WEBHOOK_URL` задан
- [ ] На сайте: `NR-*` → API, остальное → `PromoCode`
- [ ] Погашение NR-* при оплате, не при превью

## Проверка API

```bash
curl -X POST "https://welcome-bot.onrender.com/api/promo/redeem" \
  -H "Authorization: Bearer ВАШ_СЕКРЕТ" \
  -H "Content-Type: application/json" \
  -d '{"code":"NR-TEST1234"}'
```

Ожидаемо: `404 not_found` для несуществующего кода, `401` при неверном секрете.
