import type { OrganizerEvent } from '../../api/events';

/** Dashboard classification (SRS 4.16). Drafts count as upcoming. */
export type EventPhase = 'upcoming' | 'active' | 'completed' | 'cancelled';

export function eventPhase(event: Pick<OrganizerEvent, 'status' | 'startsAt' | 'endsAt'>, now: Date): EventPhase {
  if (event.status === 'cancelled') return 'cancelled';
  if (event.endsAt < now) return 'completed';
  if (event.startsAt <= now) return 'active';
  return 'upcoming';
}
