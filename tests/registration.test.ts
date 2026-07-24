import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAthleteCsv,
  applyAthleteEventAssignments,
  createAthleteCsvTemplate,
  eventIdsForAthlete,
} from "../lib/registration.ts";
import { initialState } from "../lib/domain.ts";

test("競技者CSVテンプレートは氏名と性別を含み、再取込できる", () => {
  const csv = createAthleteCsvTemplate(initialState);
  const imported = applyAthleteCsv(initialState, csv.replace("青木 陽斗", "青木 陽一"));

  assert.match(csv, /選手No,氏名,カナ,性別/);
  assert.equal(imported.state.athletes[0].name, "青木 陽一");
  assert.equal(imported.state.athletes[0].sex, "男子");
});

test("選手種目登録は既存種目を保ち、新規種目を自動で組・試順へ配置する", () => {
  const athlete = initialState.athletes[0];
  const current = eventIdsForAthlete(initialState, athlete.id);
  const desired = [...current.slice(0, 2), "1000m"];
  const next = applyAthleteEventAssignments(initialState, { [athlete.id]: desired });

  assert.deepEqual(eventIdsForAthlete(next, athlete.id), desired);
  assert.ok(next.entries.some((entry) => entry.athleteId === athlete.id && entry.eventId === "1000m"));
});

test("同じ参加種目の重複選択は保存しない", () => {
  const athlete = initialState.athletes[0];
  assert.throws(
    () => applyAthleteEventAssignments(initialState, { [athlete.id]: ["60m", "60m"] }),
    /重複/,
  );
});
