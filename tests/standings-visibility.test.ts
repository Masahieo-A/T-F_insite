import assert from "node:assert/strict";
import test from "node:test";
import { initialState, type MeetingState } from "../lib/domain.ts";
import { isStandingsLocked } from "../lib/standingsVisibility.ts";

function stateWithResults(eventId: string, heatNumber: number, count: number): MeetingState {
  const heat = initialState.heats.find((candidate) =>
    candidate.eventId === eventId && candidate.number === heatNumber)!;
  const entries = Array.from({ length: count }, (_, index) => ({
    id: `${heat.id}-entry-${index + 1}`,
    eventId,
    heatId: heat.id,
    athleteId: initialState.athletes[index].id,
    laneOrOrder: index + 1,
    scoringEligible: true,
  }));
  return {
    ...initialState,
    entries,
    results: entries.map((entry, index) => ({
      id: `${entry.id}-result`,
      entryId: entry.id,
      value: 15.2 + index,
      displayValue: (15.2 + index).toFixed(2),
      status: "OK",
      provisional: true,
      isPersonalBest: false,
    })),
  };
}

test("110mハードル女子組6名分の保存結果をトリガーに総合順位をロックする", () => {
  assert.equal(isStandingsLocked(initialState), false);
  assert.equal(isStandingsLocked(stateWithResults("hurdle", 1, 9)), false);
  assert.equal(isStandingsLocked(stateWithResults("hurdle", 2, 5)), false);
  assert.equal(isStandingsLocked(stateWithResults("hurdle", 2, 6)), true);
});
