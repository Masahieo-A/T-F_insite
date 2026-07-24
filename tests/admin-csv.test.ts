import test from "node:test";
import assert from "node:assert/strict";
import { applyBulkCsv, createBulkCsvTemplate, parseCsv } from "../lib/adminCsv.ts";
import { initialState } from "../lib/domain.ts";

test("CSVテンプレートは現在の種目・選手・エントリーを出力する", () => {
  const csv = createBulkCsvTemplate(initialState);
  const rows = parseCsv(csv);

  assert.equal(rows.length, initialState.entries.length + 1);
  assert.equal(rows[0][0], "種目ID");
  assert.equal(rows[1][0], "60m");
  assert.equal(rows[1][5], "101");
  assert.equal(rows[1][6], "青木 陽斗");
});

test("CSV一括取込で種目名・開始時刻・出場者を同時更新する", () => {
  const csv = createBulkCsvTemplate(initialState)
    .replaceAll("60m,60m,13:50", "60m,短距離60m,13:45")
    .replace(
      "60m,短距離60m,13:45,1,1,101,青木 陽斗",
      "60m,短距離60m,13:45,1,1,136,福田 結月",
    );

  const imported = applyBulkCsv(initialState, csv);
  const event = imported.state.events.find((item) => item.id === "60m");
  const heat = imported.state.heats.find((item) => item.id === "60m-heat-1")!;
  const entry = imported.state.entries.find((item) =>
    item.eventId === "60m" && item.heatId === heat.id && item.laneOrOrder === 1)!;
  const athlete = imported.state.athletes.find((item) => item.id === entry.athleteId);

  assert.equal(event?.name, "短距離60m");
  assert.equal(event?.startTime, "13:45");
  assert.equal(athlete?.name, "福田 結月");
  assert.equal(imported.state.results.some((result) => result.entryId === entry.id), false);
});

test("同じ組・レーンが重複したCSVは取り込まない", () => {
  const csv = createBulkCsvTemplate(initialState);
  const rows = parseCsv(csv);
  const duplicate = [rows[0], rows[1], rows[1]]
    .map((row) => row.join(","))
    .join("\r\n");

  assert.throws(() => applyBulkCsv(initialState, duplicate), /同じ組・レーンが重複/);
});

test("開始時刻の形式が不正なCSVは取り込まない", () => {
  const csv = createBulkCsvTemplate(initialState).replace("13:50", "午後1時50分");
  assert.throws(() => applyBulkCsv(initialState, csv), /HH:MM形式/);
});
