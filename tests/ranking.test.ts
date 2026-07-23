import assert from "node:assert/strict";
import test from "node:test";
import { athletes, entries, events, results, scoreRules, teams } from "../lib/domain.ts";
import {
  calculateEventScoreTransactions,
  calculateOverallStandings,
  formatPerformance,
  normalizePerformance,
  rankResults,
  rankResultsByAbilityBand,
  sanitizeNumericInput,
} from "../lib/ranking.ts";

const sprint = events.find((event) => event.id === "60m")!;
const longJump = events.find((event) => event.id === "long")!;

test("記録文字列を計算用数値へ正規化する", () => {
  assert.equal(sanitizeNumericInput("1a:03.8x7"), "1:03.87");
  assert.equal(normalizePerformance("1234", sprint), 12.34);
  assert.equal(normalizePerformance("1:03.87", sprint), 63.87);
  assert.equal(normalizePerformance("12345", events.find((event) => event.id === "500m")!), 83.45);
  assert.equal(normalizePerformance("542", longJump), 5.42);
  assert.equal(normalizePerformance("5.42m", longJump), 5.42);
  assert.equal(normalizePerformance("", sprint), null);
});

test("表示値と計算値を分離して整形する", () => {
  assert.equal(formatPerformance(63.87, sprint), "1:03.87");
  assert.equal(formatPerformance(5.42, longJump), "5m42");
  assert.equal(formatPerformance(null, longJump), "");
});

test("トラックは昇順、フィールドは降順で順位を付ける", () => {
  const sprintRanked = rankResults(results, entries, athletes, sprint);
  assert.equal(sprintRanked[0].result.value, 7.46);
  assert.equal(sprintRanked[0].rank, 1);
  assert.equal(sprintRanked[1].rank, 1);
  assert.equal(sprintRanked[2].rank, 3);

  const fieldRanked = rankResults(results, entries, athletes, longJump);
  assert.equal(fieldRanked[0].result.value, 5.8);
  assert.equal(fieldRanked[0].rank, 1);
});

test("DNS・DNF・DQ・NMを有効順位から除外する", () => {
  const ranked = rankResults(results, entries, athletes, sprint);
  const invalid = ranked.filter((item) => item.result.status !== "OK");
  assert.deepEqual(invalid.map((item) => item.result.status), ["DNS", "DNF", "DQ"]);
  assert.ok(invalid.every((item) => item.rank === null));
});

test("0件・1件・多数件を処理できる", () => {
  assert.deepEqual(rankResults([], [], [], sprint), []);
  const oneEntry = entries.find((entry) => entry.eventId === sprint.id)!;
  const oneResult = results.find((result) => result.entryId === oneEntry.id)!;
  const oneAthlete = athletes.find((athlete) => athlete.id === oneEntry.athleteId)!;
  const rankedOne = rankResults([oneResult], [oneEntry], [oneAthlete], sprint);
  assert.equal(rankedOne.length, 1);
  assert.equal(rankedOne[0].rank, 1);
  assert.ok(rankResults(results, entries, athletes, sprint).length > 10);
});

test("実力帯別順位を独立して再採番する", () => {
  const overall = rankResults(results, entries, athletes, sprint);
  const bandA = rankResultsByAbilityBand(overall, "A");
  assert.ok(bandA.length > 1);
  assert.equal(bandA[0].rank, 1);
  assert.ok(bandA.every((item) => item.athlete.abilityBand === "A"));
});

test("種目順位点とPBボーナスから得点取引を作る", () => {
  const ranked = rankResults(results, entries, athletes, sprint);
  const transactions = calculateEventScoreTransactions(sprint, ranked, teams, scoreRules[0]);
  const eventPoints = transactions.filter((transaction) => transaction.reason === "event-rank");
  assert.deepEqual(eventPoints.map((transaction) => transaction.points), [6, 4, 2]);
  assert.ok(transactions.some((transaction) => transaction.reason === "pb-bonus"));
});

test("総合同点は1位数・2位数で判定し、完全同点は同順位にする", () => {
  const tied = calculateOverallStandings(teams, [
    { id: "r1", eventId: "e1", teamId: "red", points: 6, reason: "event-rank", note: "" },
    { id: "b1", eventId: "e1", teamId: "blue", points: 6, reason: "event-rank", note: "" },
    { id: "g1", eventId: "e1", teamId: "green", points: 4, reason: "event-rank", note: "" },
  ]);
  assert.equal(tied[0].rank, 1);
  assert.equal(tied[1].rank, 1);
  assert.equal(tied[2].rank, 3);
});
