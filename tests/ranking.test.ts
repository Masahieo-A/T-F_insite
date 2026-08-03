import assert from "node:assert/strict";
import test from "node:test";
import { athletes, events, scoreRules, teams, type Entry, type Result } from "../lib/domain.ts";
import {
  calculateAthleteEventScores,
  calculateEventScoreTransactions,
  calculateOverallStandings,
  bestPerformance,
  formatPerformance,
  normalizePerformance,
  rankResults,
  rankResultsByAbilityBand,
  sanitizeNumericInput,
} from "../lib/ranking.ts";

const sprint = events.find((event) => event.id === "80m")!;
const longJump = events.find((event) => event.id === "long")!;
const entries: Entry[] = athletes.slice(0, 7).map((athlete, index) => ({
  id: `test-entry-${index}`,
  eventId: sprint.id,
  heatId: "80m-heat-1",
  athleteId: athlete.id,
  laneOrOrder: index + 1,
  scoringEligible: true,
}));
const resultValues = [10.12, 10.12, 10.44, null, null, null, 10.7];
const resultStatuses = ["OK", "OK", "OK", "DNS", "DNF", "DQ", "OK"] as const;
const results: Result[] = entries.map((entry, index) => ({
  id: `test-result-${index}`,
  entryId: entry.id,
  value: resultValues[index],
  displayValue: "",
  status: resultStatuses[index],
  provisional: true,
  isPersonalBest: index === 0,
}));
const fieldEntries: Entry[] = athletes.slice(0, 3).map((athlete, index) => ({
  ...entries[index],
  id: `field-entry-${index}`,
  eventId: longJump.id,
  heatId: "long-heat-1",
}));
const fieldResults: Result[] = fieldEntries.map((entry, index) => ({
  ...results[index],
  id: `field-result-${index}`,
  entryId: entry.id,
  value: [5.8, 5.42, 5.1][index],
  isPersonalBest: false,
}));

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

test("フィールド3試技から最高記録を自動採用する", () => {
  assert.equal(bestPerformance([5.12, 5.34, 5.21], longJump), 5.34);
  assert.equal(bestPerformance([null, 5.2, null], longJump), 5.2);
  assert.equal(bestPerformance([null, null, null], longJump), null);
});

test("トラックは昇順、フィールドは降順で順位を付ける", () => {
  const sprintRanked = rankResults(results, entries, athletes, sprint);
  assert.equal(sprintRanked[0].result.value, 10.12);
  assert.equal(sprintRanked[0].rank, 1);
  assert.equal(sprintRanked[1].rank, 1);
  assert.equal(sprintRanked[2].rank, 3);

  const fieldRanked = rankResults(fieldResults, fieldEntries, athletes, longJump);
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
  assert.ok(rankResults(results, entries, athletes, sprint).length > 3);
});

test("実力帯別順位を独立して再採番する", () => {
  const overall = rankResults(results, entries, athletes, sprint);
  const bandA = rankResultsByAbilityBand(overall, "A");
  assert.ok(bandA.length > 1);
  assert.equal(bandA[0].rank, 1);
  assert.ok(bandA.every((item) => item.athlete.abilityBand === "A"));
});

test("実力帯を使わず全体順位から6・4・2点を付ける", () => {
  const scoringAthletes = athletes.slice(0, 4).map((athlete, index) => ({
    ...athlete,
    id: `score-athlete-${index}`,
    teamId: teams[index % 3].id,
  }));
  const scoringEntries: Entry[] = scoringAthletes.map((athlete, index) => ({
    id: `score-entry-${index}`,
    eventId: sprint.id,
    heatId: "80m-heat-1",
    athleteId: athlete.id,
    laneOrOrder: index + 1,
    scoringEligible: true,
  }));
  const scoringResults: Result[] = scoringEntries.map((entry, index) => ({
    id: `score-result-${index}`,
    entryId: entry.id,
    value: [10, 10.2, 10.4, 10.8][index],
    displayValue: "",
    status: "OK",
    provisional: true,
    isPersonalBest: index === 0,
  }));
  const ranked = rankResults(scoringResults, scoringEntries, scoringAthletes, sprint);
  const scores = calculateAthleteEventScores(sprint, ranked, scoreRules[0]);
  assert.deepEqual(scores.map((score) => score.basePoints), [6, 4, 2, 0]);
  assert.deepEqual(scores.map((score) => score.rank), [1, 2, 3, 4]);

  const transactions = calculateEventScoreTransactions(sprint, ranked, teams, scoreRules[0]);
  assert.deepEqual(
    transactions.filter((transaction) => transaction.reason === "event-rank").map((transaction) => transaction.points),
    [6, 4, 2],
  );
  assert.equal(transactions.some((transaction) => transaction.reason === "pb-bonus"), false);
});

test("複数組のトラック種目は組ごとに6・4・2点を付ける", () => {
  const heatAthletes = athletes.slice(0, 6).map((athlete, index) => ({
    ...athlete,
    id: `heat-athlete-${index}`,
    teamId: teams[index % 3].id,
  }));
  const heatEntries: Entry[] = heatAthletes.map((athlete, index) => ({
    id: `heat-entry-${index}`,
    eventId: sprint.id,
    heatId: index < 3 ? "80m-heat-1" : "80m-heat-2",
    athleteId: athlete.id,
    laneOrOrder: (index % 3) + 1,
    scoringEligible: true,
  }));
  const heatResults: Result[] = heatEntries.map((entry, index) => ({
    id: `heat-result-${index}`,
    entryId: entry.id,
    value: [10.0, 10.2, 10.4, 9.8, 11.0, 11.2][index],
    displayValue: "",
    status: "OK",
    provisional: true,
    isPersonalBest: false,
  }));
  const scores = calculateAthleteEventScores(
    sprint,
    rankResults(heatResults, heatEntries, heatAthletes, sprint),
    scoreRules[0],
  );
  const byEntry = Object.fromEntries(scores.map((score) => [score.entryId, score]));
  const transactions = calculateEventScoreTransactions(
    sprint,
    rankResults(heatResults, heatEntries, heatAthletes, sprint),
    teams,
    scoreRules[0],
  );

  assert.equal(byEntry["heat-entry-0"].rank, 1);
  assert.equal(byEntry["heat-entry-0"].basePoints, 6);
  assert.equal(byEntry["heat-entry-3"].rank, 1);
  assert.equal(byEntry["heat-entry-3"].basePoints, 6);
  assert.deepEqual(
    transactions.filter((transaction) => transaction.reason === "event-rank").map((transaction) => transaction.note),
    ["1組1位 冨田 歩佑", "1組2位 今井 賢冴", "1組3位 梅田 歩武", "2組1位 山本 俊太朗", "2組2位 中島 優太", "2組3位 西脇 唯央"],
  );
});

test("同着は該当順位点を平均し、無効記録は0点にする", () => {
  const tieAthletes = athletes.slice(0, 4).map((athlete, index) => ({
    ...athlete,
    id: `tie-athlete-${index}`,
    teamId: teams[index % 3].id,
  }));
  const tieEntries: Entry[] = tieAthletes.map((athlete, index) => ({
    id: `tie-entry-${index}`,
    eventId: sprint.id,
    heatId: "80m-heat-1",
    athleteId: athlete.id,
    laneOrOrder: index + 1,
    scoringEligible: true,
  }));
  const tieResults: Result[] = tieEntries.map((entry, index) => ({
    id: `tie-result-${index}`,
    entryId: entry.id,
    value: index === 3 ? null : [10, 10, 10.4][index],
    displayValue: "",
    status: index === 3 ? "DNS" : "OK",
    provisional: true,
    isPersonalBest: false,
  }));
  const scores = calculateAthleteEventScores(
    sprint,
    rankResults(tieResults, tieEntries, tieAthletes, sprint),
    scoreRules[0],
  );
  assert.deepEqual(scores.map((score) => score.basePoints), [5, 5, 2, 0]);
  assert.equal(scores[3].rank, null);
});

test("PBボーナスは得点に加算しない", () => {
  const pbAthletes = athletes.slice(0, 3).map((athlete, index) => ({
    ...athlete,
    id: `pb-athlete-${index}`,
    teamId: "A",
  }));
  const pbEntries: Entry[] = pbAthletes.map((athlete, index) => ({
    id: `pb-entry-${index}`,
    eventId: sprint.id,
    heatId: "80m-heat-1",
    athleteId: athlete.id,
    laneOrOrder: index + 1,
    scoringEligible: true,
  }));
  const pbResults: Result[] = pbEntries.map((entry, index) => ({
    id: `pb-result-${index}`,
    entryId: entry.id,
    value: 10 + index,
    displayValue: "",
    status: "OK",
    provisional: true,
    isPersonalBest: true,
  }));
  const scores = calculateAthleteEventScores(
    sprint,
    rankResults(pbResults, pbEntries, pbAthletes, sprint),
    scoreRules[0],
  );
  assert.equal(scores.reduce((sum, score) => sum + score.pbPoints, 0), 0);
  assert.equal(scores.reduce((sum, score) => sum + score.totalPoints, 0), 12);
});

test("総合同点は得点・種目勝利・個人1位数の順で判定し、完全同点は同順位にする", () => {
  const tied = calculateOverallStandings(teams, [
    { id: "r1", eventId: "e1", teamId: "A", points: 6, reason: "event-rank", note: "" },
    { id: "b1", eventId: "e1", teamId: "B", points: 6, reason: "event-rank", note: "" },
    { id: "g1", eventId: "e1", teamId: "C", points: 4, reason: "event-rank", note: "" },
    { id: "legacy-pb", eventId: "e1", teamId: "C", points: 100, reason: "pb-bonus", note: "旧PB" },
  ]);
  assert.equal(tied[0].rank, 1);
  assert.equal(tied[1].rank, 1);
  assert.equal(tied[2].rank, 3);
  assert.equal(tied[2].points, 4);
  assert.equal(tied[2].pbPoints, 0);
});
