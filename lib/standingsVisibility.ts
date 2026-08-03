import type { MeetingState } from "./domain.ts";

export const STANDINGS_LOCK_EVENT_ID = "hurdle";
export const STANDINGS_LOCK_HEAT_NUMBER = 2;
export const STANDINGS_LOCK_REQUIRED_RESULTS = 6;

export function isStandingsLocked(state: MeetingState) {
  const triggerHeat = state.heats.find((heat) =>
    heat.eventId === STANDINGS_LOCK_EVENT_ID
    && heat.number === STANDINGS_LOCK_HEAT_NUMBER);
  if (!triggerHeat) return false;
  const triggerEntryIds = new Set(state.entries
    .filter((entry) => entry.heatId === triggerHeat.id)
    .map((entry) => entry.id));
  const completedResultEntryIds = new Set(state.results
    .filter((result) => triggerEntryIds.has(result.entryId))
    .map((result) => result.entryId));
  return completedResultEntryIds.size >= STANDINGS_LOCK_REQUIRED_RESULTS;
}
