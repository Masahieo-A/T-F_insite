import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAthleteCsv,
  applyAthleteEventAssignments,
  applyEventHeatAthleteAssignments,
  applyEventSlotAthleteAssignments,
  createAthleteCsvTemplate,
  eventRegistrationSlots,
  eventIdsForAthlete,
  eventSlotAssignmentsForEvent,
  heatAthleteAssignmentsForEvent,
} from "../lib/registration.ts";
import { initialState } from "../lib/domain.ts";

test("競技者CSVテンプレートは氏名と性別を含み、再取込できる", () => {
  const csv = createAthleteCsvTemplate(initialState);
  const imported = applyAthleteCsv(initialState, csv.replaceAll("冨田 歩佑", "冨田 歩一"));

  assert.match(csv, /選手No,氏名,カナ,性別/);
  assert.equal(imported.state.athletes[0].name, "冨田 歩一");
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
    () => applyAthleteEventAssignments(initialState, { [athlete.id]: ["80m", "80m"] }),
    /重複/,
  );
});

test("当日種目登録は種目ごとの組へ選手を配置する", () => {
  const heats = initialState.heats.filter((heat) => heat.eventId === "80m");
  const next = applyEventHeatAthleteAssignments(initialState, "80m", {
    [heats[0].id]: initialState.athletes[0].id,
    [heats[1].id]: initialState.athletes[1].id,
    [heats[2].id]: initialState.athletes[2].id,
  });

  assert.deepEqual(heatAthleteAssignmentsForEvent(next, "80m"), {
    [heats[0].id]: initialState.athletes[0].id,
    [heats[1].id]: initialState.athletes[1].id,
    [heats[2].id]: initialState.athletes[2].id,
  });
  assert.deepEqual(
    next.entries
      .filter((entry) => entry.eventId === "80m")
      .map((entry) => entry.laneOrOrder),
    [1, 1, 1],
  );
});

test("同じ選手を同じ種目の複数枠へ登録しない", () => {
  const heats = initialState.heats.filter((heat) => heat.eventId === "80m");
  assert.throws(
    () => applyEventHeatAthleteAssignments(initialState, "80m", {
      [heats[0].id]: initialState.athletes[0].id,
      [heats[1].id]: initialState.athletes[0].id,
    }),
    /複数枠/,
  );
});

test("フィールド3種目は1組決勝のまま各チーム3枠を用意する", () => {
  const slots = eventRegistrationSlots(initialState, "long");
  const selectedAthletes = slots.map((slot) =>
    initialState.athletes.filter((athlete) => athlete.teamId === slot.teamId)[slot.laneOrOrder % 3],
  );
  const next = applyEventSlotAthleteAssignments(initialState, "long", Object.fromEntries(
    slots.map((slot, index) => [slot.id, selectedAthletes[index].id]),
  ));
  const entries = next.entries.filter((entry) => entry.eventId === "long");

  assert.equal(slots.length, 9);
  assert.equal(new Set(slots.map((slot) => slot.heatId)).size, 1);
  assert.deepEqual(slots.map((slot) => slot.laneOrOrder), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(entries.map((entry) => entry.laneOrOrder), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(eventSlotAssignmentsForEvent(next, "long"), Object.fromEntries(
    slots.map((slot, index) => [slot.id, selectedAthletes[index].id]),
  ));
});

test("フィールドのチーム枠には別チームの選手を登録しない", () => {
  const slots = eventRegistrationSlots(initialState, "shot");
  const aSlot = slots.find((slot) => slot.teamId === "A")!;
  const bAthlete = initialState.athletes.find((athlete) => athlete.teamId === "B")!;

  assert.throws(
    () => applyEventSlotAthleteAssignments(initialState, "shot", { [aSlot.id]: bAthlete.id }),
    /Aチーム/,
  );
});

test("500mとハードルは3組ずつ用意する", () => {
  assert.equal(initialState.heats.filter((heat) => heat.eventId === "500m").length, 3);
  assert.equal(initialState.heats.filter((heat) => heat.eventId === "hurdle").length, 3);
});
