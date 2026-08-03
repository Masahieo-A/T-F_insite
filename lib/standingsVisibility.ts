import type { MeetingState } from "./domain.ts";

export const STANDINGS_LOCK_EVENT_ID = "hurdle";
export const STANDINGS_LOCK_HEAT_NUMBER = 2;

export function isStandingsLocked(state: MeetingState) {
  const triggerHeat = state.heats.find((heat) =>
    heat.eventId === STANDINGS_LOCK_EVENT_ID
    && heat.number === STANDINGS_LOCK_HEAT_NUMBER);
  if (!triggerHeat) return false;
  const triggerEntryIds = new Set(state.entries
    .filter((entry) => entry.heatId === triggerHeat.id)
    .map((entry) => entry.id));
  return state.results.some((result) => triggerEntryIds.has(result.entryId));
}
