import assert from "node:assert/strict";
import test from "node:test";
import { initialState, type MeetingState } from "../lib/domain.ts";
import { isStandingsLocked } from "../lib/standingsVisibility.ts";

function stateWithResult(eventId: string, heatNumber: number): MeetingState {
  const heat = initialState.heats.find((candidate) =>
    candidate.eventId === eventId && candidate.number === heatNumber)!;
  const entry = {
    id: `${heat.id}-entry`,
    eventId,
    heatId: heat.id,
    athleteId: initialState.athletes[0].id,
    laneOrOrder: 1,
    scoringEligible: true,
  };
  return {
    ...initialState,
    entries: [entry],
    results: [{
      id: `${entry.id}-result`,
      entryId: entry.id,
      value: 15.2,
      displayValue: "15.20",
      status: "OK",
      provisional: true,
      isPersonalBest: false,
    }],
  };
}

test("110mハードル女子組の保存結果をトリガーに総合順位をロックする", () => {
  assert.equal(isStandingsLocked(initialState), false);
  assert.equal(isStandingsLocked(stateWithResult("hurdle", 1)), false);
  assert.equal(isStandingsLocked(stateWithResult("hurdle", 2)), true);
});
