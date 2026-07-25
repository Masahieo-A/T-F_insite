import type {
  AbilityBand,
  Athlete,
  Entry,
  Event,
  Result,
  ScoreRule,
  ScoreTransaction,
  Team,
} from "./domain";

export type RankedResult = {
  result: Result;
  entry: Entry;
  athlete: Athlete;
  rank: number | null;
};

export type AthleteEventScore = {
  eventId: string;
  entryId: string;
  athleteId: string;
  athleteName: string;
  teamId: string;
  rank: number | null;
  basePoints: number;
  pbPoints: number;
  totalPoints: number;
  status: Result["status"];
};

export function sanitizeNumericInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.:]/g, "");
  const colonParts = cleaned.split(":").slice(0, 2);
  return colonParts.map((part) => {
    const dot = part.indexOf(".");
    return dot < 0 ? part : `${part.slice(0, dot + 1)}${part.slice(dot + 1).replace(/\./g, "")}`;
  }).join(":");
}

export function normalizePerformance(raw: string, event: Pick<Event, "kind" | "unit" | "id">): number | null {
  const clean = sanitizeNumericInput(raw);
  if (!clean) return null;

  if (event.unit === "seconds") {
    if (clean.includes(":")) {
      const [minutes, seconds] = clean.split(":");
      const normalized = Number(minutes) * 60 + Number(seconds);
      return Number.isFinite(normalized) ? Math.round(normalized * 100) / 100 : null;
    }
    if (clean.includes(".")) {
      const normalized = Number(clean);
      return Number.isFinite(normalized) ? Math.round(normalized * 100) / 100 : null;
    }
    if (clean.length >= 5 || ["500m", "1000m"].includes(event.id)) {
      const centiseconds = Number(clean.slice(-2));
      const secondsDigits = clean.slice(0, -2);
      const seconds = Number(secondsDigits.slice(-2));
      const minutes = Number(secondsDigits.slice(0, -2) || "0");
      return minutes * 60 + seconds + centiseconds / 100;
    }
    return Number(clean) / 100;
  }

  if (clean.includes(".")) {
    const normalized = Number(clean);
    return Number.isFinite(normalized) ? Math.round(normalized * 100) / 100 : null;
  }
  return Number(clean) / 100;
}

export function formatPerformance(value: number | null, event: Pick<Event, "unit">): string {
  if (value === null) return "";
  if (event.unit === "meters") {
    const meters = Math.floor(value);
    const centimeters = Math.round((value - meters) * 100);
    return `${meters}m${String(centimeters).padStart(2, "0")}`;
  }
  if (value >= 60) {
    const minutes = Math.floor(value / 60);
    const seconds = value - minutes * 60;
    return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
  }
  return value.toFixed(2);
}

export function comparePerformance(a: number, b: number, event: Pick<Event, "direction">): number {
  return event.direction === "asc" ? a - b : b - a;
}

export function isSamePerformance(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.000001;
}

export function rankResults(
  results: Result[],
  entries: Entry[],
  athletes: Athlete[],
  event: Event,
): RankedResult[] {
  const mapped = entries
    .filter((entry) => entry.eventId === event.id)
    .map((entry) => ({
      entry,
      athlete: athletes.find((athlete) => athlete.id === entry.athleteId)!,
      result: results.find((result) => result.entryId === entry.id) ?? {
        id: `empty-${entry.id}`,
        entryId: entry.id,
        value: null,
        displayValue: "",
        status: "DNS" as const,
        provisional: true,
        isPersonalBest: false,
      },
    }));

  const valid = mapped
    .filter((item) => item.result.status === "OK" && item.result.value !== null)
    .sort((a, b) => comparePerformance(a.result.value!, b.result.value!, event));

  let previousValue: number | null = null;
  let currentRank = 0;
  const rankedValid = valid.map((item, index) => {
    if (previousValue === null || !isSamePerformance(previousValue, item.result.value!)) currentRank = index + 1;
    previousValue = item.result.value;
    return { ...item, rank: currentRank };
  });

  const invalidOrder = { DNS: 1, DNF: 2, DQ: 3, NM: 4, OK: 0 };
  const invalid = mapped
    .filter((item) => item.result.status !== "OK" || item.result.value === null)
    .sort((a, b) => invalidOrder[a.result.status] - invalidOrder[b.result.status])
    .map((item) => ({ ...item, rank: null }));

  return [...rankedValid, ...invalid];
}

export function rankResultsByAbilityBand(
  ranked: RankedResult[],
  band: AbilityBand,
): RankedResult[] {
  const inBand = ranked.filter((item) => item.athlete.abilityBand === band && item.rank !== null);
  let previousValue: number | null = null;
  let currentRank = 0;
  return inBand.map((item, index) => {
    if (previousValue === null || !isSamePerformance(previousValue, item.result.value!)) currentRank = index + 1;
    previousValue = item.result.value;
    return { ...item, rank: currentRank };
  });
}

function sharedPlacePoints(rank: number, tiedCount: number, points: number[]) {
  let total = 0;
  for (let index = rank - 1; index < rank - 1 + tiedCount; index += 1) {
    total += points[index] ?? 0;
  }
  return Math.round((total / tiedCount) * 10) / 10;
}

export function calculateAthleteEventScores(
  event: Event,
  ranked: RankedResult[],
  rule: ScoreRule,
): AthleteEventScore[] {
  const eligible = ranked.filter((item) => item.entry.scoringEligible);
  let previousValue: number | null = null;
  let currentRank = 0;
  const scoringRanked = eligible.map((item, index) => {
    if (item.rank === null) return { ...item, rank: null };
    if (previousValue === null || !isSamePerformance(previousValue, item.result.value!)) {
      currentRank = index + 1;
    }
    previousValue = item.result.value;
    return { ...item, rank: currentRank };
  });
  const rows: AthleteEventScore[] = eligible.map((item) => ({
    eventId: event.id,
    entryId: item.entry.id,
    athleteId: item.athlete.id,
    athleteName: item.athlete.name,
    teamId: item.athlete.teamId,
    rank: null,
    basePoints: 0,
    pbPoints: 0,
    totalPoints: 0,
    status: item.result.status,
  }));

  const valid = scoringRanked.filter((item) => item.rank !== null);
  const points = event.id === "relay" ? [18, 12, 6] : rule.eventPoints;
  for (const item of valid) {
    const tiedCount = valid.filter((candidate) => candidate.rank === item.rank).length;
    const row = rows.find((candidate) => candidate.entryId === item.entry.id)!;
    row.rank = item.rank;
    row.basePoints = sharedPlacePoints(item.rank!, tiedCount, points);
  }

  if (event.id === "relay") {
    rows.forEach((row) => {
      row.totalPoints = row.basePoints;
    });
    return rows;
  }

  for (const teamId of new Set(rows.map((row) => row.teamId))) {
    const pbCandidates = scoringRanked.filter((item) =>
      item.athlete.teamId === teamId
      && item.result.isPersonalBest
      && item.rank !== null,
    );
    pbCandidates.slice(0, 2).forEach((item) => {
      const row = rows.find((candidate) => candidate.entryId === item.entry.id)!;
      row.pbPoints = rule.pbBonus;
    });
  }

  rows.forEach((row) => {
    row.totalPoints = Math.round((row.basePoints + row.pbPoints) * 10) / 10;
  });
  return rows;
}

export function calculateEventScoreTransactions(
  event: Event,
  ranked: RankedResult[],
  teams: Team[],
  rule: ScoreRule,
): ScoreTransaction[] {
  const teamIds = new Set(teams.map((team) => team.id));
  const scores = calculateAthleteEventScores(event, ranked, rule)
    .filter((score) => teamIds.has(score.teamId));
  return scores.flatMap((score): ScoreTransaction[] => {
    const rankLabel = event.id === "relay" ? "リレー" : "全体";
    const base = score.basePoints > 0 ? [{
      id: `${event.id}-${score.entryId}-event`,
      eventId: event.id,
      teamId: score.teamId,
      points: score.basePoints,
      reason: "event-rank" as const,
      note: `${rankLabel}${score.rank}位 ${score.athleteName}`,
    }] : [];
    const pb = score.pbPoints > 0 ? [{
      id: `${event.id}-${score.entryId}-pb`,
      eventId: event.id,
      teamId: score.teamId,
      points: score.pbPoints,
      reason: "pb-bonus" as const,
      note: `${score.athleteName} PB`,
    }] : [];
    return [...base, ...pb];
  });
}

export function calculateOverallStandings(
  teams: Team[],
  transactions: ScoreTransaction[],
): Array<Team & {
  points: number;
  basePoints: number;
  pbPoints: number;
  eventWins: number;
  bandWins: number;
  relayRank: number;
  wins: number;
  seconds: number;
  rank: number;
}> {
  const eventIds = [...new Set(transactions.map((transaction) => transaction.eventId))];
  const rows = teams.map((team) => {
    const own = transactions.filter((transaction) => transaction.teamId === team.id);
    const basePoints = own
      .filter((transaction) => transaction.reason !== "pb-bonus")
      .reduce((sum, transaction) => sum + transaction.points, 0);
    const pbPoints = own
      .filter((transaction) => transaction.reason === "pb-bonus")
      .reduce((sum, transaction) => sum + transaction.points, 0);
    const eventWins = eventIds.filter((eventId) => {
      const teamTotals = teams.map((candidate) => transactions
        .filter((transaction) =>
          transaction.eventId === eventId
          && transaction.teamId === candidate.id
          && transaction.reason !== "pb-bonus")
        .reduce((sum, transaction) => sum + transaction.points, 0));
      const ownTotal = transactions
        .filter((transaction) =>
          transaction.eventId === eventId
          && transaction.teamId === team.id
          && transaction.reason !== "pb-bonus")
        .reduce((sum, transaction) => sum + transaction.points, 0);
      return ownTotal > 0 && ownTotal === Math.max(...teamTotals);
    }).length;
    const individualWins = own.filter((transaction) =>
      transaction.reason === "event-rank" && /全体1位/.test(transaction.note)).length;
    const relayNote = own.find((transaction) =>
      transaction.eventId === "relay" && transaction.reason === "event-rank")?.note ?? "";
    const relayRank = Number(relayNote.match(/リレー(\d+)位/)?.[1] ?? 99);
    return {
      ...team,
      points: Math.round((basePoints + pbPoints) * 10) / 10,
      basePoints: Math.round(basePoints * 10) / 10,
      pbPoints: Math.round(pbPoints * 10) / 10,
      eventWins,
      bandWins: individualWins,
      relayRank,
      wins: eventWins,
      seconds: individualWins,
      rank: 0,
    };
  }).sort((a, b) =>
    b.points - a.points
    || b.basePoints - a.basePoints
    || b.eventWins - a.eventWins
    || b.bandWins - a.bandWins
    || a.relayRank - b.relayRank
    || a.displayOrder - b.displayOrder);

  let prior: (typeof rows)[number] | null = null;
  let rank = 0;
  return rows.map((row, index) => {
    if (!prior
      || row.points !== prior.points
      || row.basePoints !== prior.basePoints
      || row.eventWins !== prior.eventWins
      || row.bandWins !== prior.bandWins
      || row.relayRank !== prior.relayRank) rank = index + 1;
    prior = row;
    return { ...row, rank };
  });
}
