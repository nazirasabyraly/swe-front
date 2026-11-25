/*
 * Assigned seating (SRS 4.3.1). Contract: docs/backend-contract.md, "Assigned seating".
 * Layouts are predefined by the platform; organizers choose one and map its price categories to
 * ticket types. Seat holds and the "never sell a seat twice" guarantee are the server's job.
 */
import { json, request } from './http';

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

const ev = (id: string) => `/api/events/${encodeURIComponent(id)}`;

export const httpSeatingApi: SeatingApi = {
  listLayouts: () => request<VenueLayout[]>('/api/venue-layouts'),
  getSeating: (eventId) => request<SeatingConfig>(`${ev(eventId)}/seating`),
  updateSeating: (eventId, config) => request<SeatingConfig>(`${ev(eventId)}/seating`, json('PUT', config)),
  getSeatMap: (eventId) => request<SeatMap>(`/api/public/events/${encodeURIComponent(eventId)}/seat-map`),
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
