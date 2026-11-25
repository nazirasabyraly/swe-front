/*
 * Assigned seating (SRS 4.3.1). Backend: the event's `seating_mode` / `venue_id`, and
 * GET /events/:id/seatmap (not implemented on the backend yet).
 * The backend has no venue-layout catalog or price-category mapping, so choosing a layout
 * isn't supported; switching an event back to general admission is.
 */
import type { EventDto } from './events';
import { json, notSupported, request } from './http';

export type SeatStatus = 'available' | 'held' | 'sold' | 'unavailable';

export interface LayoutSeat {
  /** Stable across the event, e.g. "PAR-A-3". */
  id: string;
  number: string;
  category: string;
  accessible: boolean;
}

export interface LayoutSection {
  id: string;
  name: string;
  rows: { label: string; seats: LayoutSeat[] }[];
}

export interface VenueLayout {
  id: string;
  name: string;
  description: string;
  seatCount: number;
  categories: { id: string; label: string }[];
  sections: LayoutSection[];
}

export interface SeatingConfig {
  mode: 'general_admission' | 'assigned';
  layoutId: string | null;
  /** Price category id → ticket type id. Seats in unmapped categories aren't sold. */
  categoryTicketTypes: Record<string, string>;
}

export interface SeatMapSeat extends LayoutSeat {
  status: SeatStatus;
  ticketTypeId: string | null;
  /** KZT from the mapped ticket type; null when the seat isn't sold for this event. */
  price: number | null;
}

export interface SeatMap {
  mode: 'general_admission' | 'assigned';
  layoutName: string;
  categories: { id: string; label: string; ticketTypeId: string | null }[];
  sections: { id: string; name: string; rows: { label: string; seats: SeatMapSeat[] }[] }[];
}

export const SEATING_ERRORS = { seatUnavailable: 'seat_unavailable', hasSales: 'seating_has_sales' } as const;

export interface SeatingApi {
  listLayouts(): Promise<VenueLayout[]>;
  getSeating(eventId: string): Promise<SeatingConfig>;
  /** `409 seating_has_sales` once seats are sold. */
  updateSeating(eventId: string, config: SeatingConfig): Promise<SeatingConfig>;
  /** Public: live seat statuses for the event page. `mode: general_admission` means no map. */
  getSeatMap(eventId: string): Promise<SeatMap>;
}

const ev = (id: string) => `/events/${encodeURIComponent(id)}`;

interface SeatMapDto {
  venueName: string;
  sections: {
    id: string;
    name: string;
    rows: {
      label: string;
      seats: { id: string; seatNumber: string; priceCategory: string | null; isAccessible: boolean; status: 'available' | 'held' | 'mine' | 'sold' }[];
    }[];
  }[];
}

const EMPTY_GA_MAP: SeatMap = { mode: 'general_admission', layoutName: '', categories: [], sections: [] };

export const httpSeatingApi: SeatingApi = {
  listLayouts: async () => notSupported('Venue layouts'),
  async getSeating(eventId) {
    const event = await request<EventDto>(ev(eventId));
    return { mode: event.seatingMode, layoutId: event.venueId, categoryTicketTypes: {} };
  },
  async updateSeating(eventId, config) {
    if (config.mode === 'assigned') notSupported('Assigned seating');
    const event = await request<EventDto>(ev(eventId), json('PATCH', { seatingMode: 'general_admission', venueId: null }));
    return { mode: event.seatingMode, layoutId: event.venueId, categoryTicketTypes: {} };
  },
  async getSeatMap(eventId) {
    const event = await request<EventDto>(ev(eventId));
    if (event.seatingMode === 'general_admission') return EMPTY_GA_MAP;
    const map = await request<SeatMapDto>(`${ev(eventId)}/seatmap`);
    const categories = [...new Set(map.sections.flatMap((s) => s.rows.flatMap((r) => r.seats.map((x) => x.priceCategory ?? ''))))];
    return {
      mode: 'assigned',
      layoutName: map.venueName,
      categories: categories.map((c) => ({ id: c, label: c, ticketTypeId: null })),
      sections: map.sections.map((section) => ({
        id: section.id,
        name: section.name,
        rows: section.rows.map((row) => ({
          label: row.label,
          seats: row.seats.map((seat) => ({
            id: seat.id,
            number: seat.seatNumber,
            category: seat.priceCategory ?? '',
            accessible: seat.isAccessible,
            status: seat.status === 'mine' ? 'held' : seat.status,
            ticketTypeId: null,
            price: null,
          })),
        })),
      })),
    };
  },
};

/** "Parterre · Row A · Seat 3" */
export function seatLabel(map: Pick<SeatMap, 'sections'>, seatId: string): { section: string; row: string; seat: string } | null {
  for (const section of map.sections) {
    for (const row of section.rows) {
      const seat = row.seats.find((s) => s.id === seatId);
      if (seat) return { section: section.name, row: row.label, seat: seat.number };
    }
  }
  return null;
}
