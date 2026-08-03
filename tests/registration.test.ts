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
  OPEN_TEAM_SLOT_ID,
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

test("選手の出場種目数に上限を設けない", () => {
  const athlete = initialState.athletes[0];
  const desired = ["80m", "250m", "long", "500m", "hurdle"];
  const next = applyAthleteEventAssignments(initialState, { [athlete.id]: desired });

  assert.deepEqual(eventIdsForAthlete(next, athlete.id), desired);
});

test("記録入力時も4種目目以降の選手登録を保存できる", () => {
  const athlete = initialState.athletes[0];
  const firstThree = applyAthleteEventAssignments(initialState, {
    [athlete.id]: ["80m", "250m", "long"],
  });
  const fourthSlot = eventRegistrationSlots(firstThree, "500m")
    .find((slot) => slot.teamId === athlete.teamId)!;
  const next = applyEventSlotAthleteAssignments(firstThree, "500m", {
    [fourthSlot.id]: athlete.id,
  });

  assert.deepEqual(eventIdsForAthlete(next, athlete.id), ["80m", "250m", "long", "500m"]);
});

test("6組の各組にA・B・Cチーム1名ずつの入力枠を用意する", () => {
  const slots = eventRegistrationSlots(initialState, "80m");
  const firstHeatSlots = slots.filter((slot) => slot.heatId === "80m-heat-1");

  assert.equal(slots.length, 18);
  assert.equal(new Set(slots.map((slot) => slot.heatId)).size, 6);
  assert.deepEqual(firstHeatSlots.map((slot) => slot.teamId), ["A", "B", "C"]);
  assert.deepEqual(firstHeatSlots.map((slot) => slot.laneOrOrder), [1, 2, 3]);
});

test("記録入力で別組を登録しても保存済みの組を残す", () => {
  const slots = eventRegistrationSlots(initialState, "250m");
  const firstHeatSlots = slots.filter((slot) => slot.heatId === "250m-heat-1");
  const secondHeatSlots = slots.filter((slot) => slot.heatId === "250m-heat-2");
  const teamAthletes = Object.fromEntries(initialState.teams.map((team) => [
    team.id,
    initialState.athletes.filter((athlete) => athlete.teamId === team.id),
  ]));
  const firstAssignments = Object.fromEntries(firstHeatSlots.map((slot) => [
    slot.id,
    teamAthletes[slot.teamId][0].id,
  ]));
  const first = applyEventSlotAthleteAssignments(initialState, "250m", firstAssignments);
  const saved = eventSlotAssignmentsForEvent(first, "250m");
  const second = applyEventSlotAthleteAssignments(first, "250m", {
    ...saved,
    ...Object.fromEntries(secondHeatSlots.map((slot) => [slot.id, teamAthletes[slot.teamId][1].id])),
  });

  assert.equal(second.entries.filter((entry) => entry.eventId === "250m").length, 6);
  assert.equal(second.entries.filter((entry) => entry.heatId === "250m-heat-1").length, 3);
  assert.equal(second.entries.filter((entry) => entry.heatId === "250m-heat-2").length, 3);
});

test("同じ選手を同じ種目の複数枠へ登録しない", () => {
  const slots = eventRegistrationSlots(initialState, "80m").filter((slot) => slot.teamId === "A");
  assert.throws(
    () => applyEventHeatAthleteAssignments(initialState, "80m", {
      [slots[0].id]: initialState.athletes[0].id,
      [slots[1].id]: initialState.athletes[0].id,
    }),
    /複数枠/,
  );
});

test("フィールド3種目は1組決勝のまま各チーム5枠を用意する", () => {
  const slots = eventRegistrationSlots(initialState, "long");
  const selectedAthletes = slots.map((slot) =>
    initialState.athletes.filter((athlete) => athlete.teamId === slot.teamId)[slot.slotNumber - 1],
  );
  const next = applyEventSlotAthleteAssignments(initialState, "long", Object.fromEntries(
    slots.map((slot, index) => [slot.id, selectedAthletes[index].id]),
  ));
  const entries = next.entries.filter((entry) => entry.eventId === "long");

  assert.equal(slots.length, 15);
  assert.equal(new Set(slots.map((slot) => slot.heatId)).size, 1);
  assert.deepEqual(slots.map((slot) => slot.laneOrOrder), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  assert.deepEqual(entries.map((entry) => entry.laneOrOrder), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
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

test("1000mは1組決勝のまま各チーム3枠を用意する", () => {
  const slots = eventRegistrationSlots(initialState, "1000m");

  assert.equal(slots.length, 9);
  assert.equal(new Set(slots.map((slot) => slot.heatId)).size, 1);
  assert.deepEqual(slots.map((slot) => slot.laneOrOrder), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(slots.map((slot) => slot.teamId), ["A", "A", "A", "B", "B", "B", "C", "C", "C"]);
});

test("110mハードルは男子9枠・女子6枠の2組を用意し、全選手を選択できる", () => {
  const slots = eventRegistrationSlots(initialState, "hurdle");
  const maleSlots = slots.filter((slot) => slot.heatId === "hurdle-heat-1");
  const femaleSlots = slots.filter((slot) => slot.heatId === "hurdle-heat-2");
  const aSlot = maleSlots[0];
  const bAthlete = initialState.athletes.find((athlete) => athlete.teamId === "B")!;
  const next = applyEventSlotAthleteAssignments(initialState, "hurdle", { [aSlot.id]: bAthlete.id });

  assert.equal(slots.length, 15);
  assert.equal(maleSlots.length, 9);
  assert.equal(femaleSlots.length, 6);
  assert.deepEqual([...new Set(slots.map((slot) => slot.teamId))], [OPEN_TEAM_SLOT_ID]);
  assert.ok(next.entries.some((entry) => entry.eventId === "hurdle" && entry.athleteId === bAthlete.id));
});

test("フィールド・1000m・リレー・110mハードル以外のトラック種目は6組ずつ用意する", () => {
  for (const eventId of ["80m", "250m", "500m"]) {
    assert.equal(initialState.heats.filter((heat) => heat.eventId === eventId).length, 6);
  }
  assert.equal(initialState.heats.filter((heat) => heat.eventId === "hurdle").length, 2);
  assert.equal(initialState.heats.filter((heat) => heat.eventId === "1000m").length, 1);
  assert.equal(initialState.heats.filter((heat) => heat.eventId === "relay").length, 1);
});
