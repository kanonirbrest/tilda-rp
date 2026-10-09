/** Скидка на корзину концерта 13 октября: −10% от 3 билетов. На 26 октября не применяется. */
export const VIVALDI_VOLUME_DISCOUNT_MIN_TICKETS = 3;
export const VIVALDI_VOLUME_DISCOUNT_PERCENT = 10;

export function vivaldiVolumeDiscountCents(ticketCount: number, subtotalCents: number): number {
  if (ticketCount < VIVALDI_VOLUME_DISCOUNT_MIN_TICKETS || subtotalCents <= 0) return 0;
  return Math.floor((subtotalCents * VIVALDI_VOLUME_DISCOUNT_PERCENT) / 100);
}

export function vivaldiVolumeDiscountHint(ticketCount: number): string | null {
  if (ticketCount < VIVALDI_VOLUME_DISCOUNT_MIN_TICKETS) return null;
  return `Скидка ${VIVALDI_VOLUME_DISCOUNT_PERCENT}% за ${VIVALDI_VOLUME_DISCOUNT_MIN_TICKETS} и более билетов`;
}
