import test from "node:test";
import assert from "node:assert/strict";
import { applyBulkCsv, createBulkCsvTemplate, parseCsv } from "../lib/adminCsv.ts";
import { initialState } from "../lib/domain.ts";
import { applyAthleteEventAssignments } from "../lib/registration.ts";

const populatedState = applyAthleteEventAssignments(initialState, {
  [initialState.athletes[0].id]: ["80m"],
  [initialState.athletes[1].id]: ["80m"],
});

test("CSVテンプレートは現在の種目・選手・エントリーを出力する", () => {
  const csv = createBulkCsvTemplate(populatedState);
  const rows = parseCsv(csv);

  assert.equal(rows.length, populatedState.entries.length + 1);
  assert.equal(rows[0][0], "種目ID");
  assert.equal(rows[1][0], "80m");
  assert.equal(rows[1][1], "100m");
  assert.equal(rows[1][5], "101");
  assert.equal(rows[1][6], "冨田 歩佑");
});

test("CSV一括取込で種目名・開始時刻・出場者を同時更新する", () => {
  const csv = createBulkCsvTemplate(populatedState)
    .replaceAll("80m,100m,13:50", "80m,短距離100m,13:45")
    .replace(
      "80m,短距離100m,13:45,1,1,101,冨田 歩佑",
      "80m,短距離100m,13:45,1,1,127,青松 政宏",
    );

  const imported = applyBulkCsv(populatedState, csv);
  const event = imported.state.events.find((item) => item.id === "80m");
  const heat = imported.state.heats.find((item) => item.id === "80m-heat-1")!;
  const entry = imported.state.entries.find((item) =>
    item.eventId === "80m" && item.heatId === heat.id && item.laneOrOrder === 1)!;
  const athlete = imported.state.athletes.find((item) => item.id === entry.athleteId);

  assert.equal(event?.name, "短距離100m");
  assert.equal(event?.startTime, "13:45");
  assert.equal(athlete?.name, "青松 政宏");
  assert.equal(imported.state.results.some((result) => result.entryId === entry.id), false);
});

test("同じ組・レーンが重複したCSVは取り込まない", () => {
  const csv = createBulkCsvTemplate(populatedState);
  const rows = parseCsv(csv);
  const duplicate = [rows[0], rows[1], rows[1]]
    .map((row) => row.join(","))
    .join("\r\n");

  assert.throws(() => applyBulkCsv(populatedState, duplicate), /同じ組・レーンが重複/);
});

test("開始時刻の形式が不正なCSVは取り込まない", () => {
  const csv = createBulkCsvTemplate(populatedState).replace("13:50", "午後1時50分");
  assert.throws(() => applyBulkCsv(populatedState, csv), /HH:MM形式/);
});
