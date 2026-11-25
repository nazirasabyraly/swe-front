import type { QuoteItem } from '../../api/publicEvents';

/**
 * The ticket selection travels in the checkout URL (`?items=tt1:2,tt2:1@SEAT|SEAT&promo=CODE`), so it
 * survives the sign-in redirect and a page reload. It's only a request: the server re-validates it.
 */
export function encodeItems(items: QuoteItem[]): string {
  return items
    .map((i) => `${encodeURIComponent(i.ticketTypeId)}:${i.quantity}${i.seatIds?.length ? `@${i.seatIds.map(encodeURIComponent).join('|')}` : ''}`)
    .join(',');
}

export function parseItems(value: string | null): QuoteItem[] | null {
  if (!value) return null;
  const items: QuoteItem[] = [];
  for (const part of value.split(',')) {
    const [main, seatPart] = part.split('@');
    const [id, quantity] = main.split(':');
    const n = Number(quantity);
    if (!id || !Number.isInteger(n) || n < 1) return null;
    const seatIds = seatPart ? seatPart.split('|').map(decodeURIComponent) : undefined;
    if (seatIds && seatIds.length !== n) return null;
    items.push({ ticketTypeId: decodeURIComponent(id), quantity: n, ...(seatIds ? { seatIds } : {}) });
  }
  return items.length ? items : null;
}
