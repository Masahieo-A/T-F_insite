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

export function calculateEventScoreTransactions(
  event: Event,
  ranked: RankedResult[],
  teams: Team[],
  rule: ScoreRule,
): ScoreTransaction[] {
  const validCount = ranked.filter((item) => item.rank !== null).length;
  const teamRows = teams.map((team) => {
    const members = ranked
      .filter((item) => item.athlete.teamId === team.id && item.entry.scoringEligible)
      .slice(0, event.scoringSlots);
    const ranks = members.map((item) => item.rank ?? validCount + 1);
    while (ranks.length < event.scoringSlots) ranks.push(validCount + 1);
    return { team, rankSum: ranks.reduce((sum, rank) => sum + rank, 0), bestRanks: ranks };
  }).sort((a, b) => a.rankSum - b.rankSum || a.bestRanks.join(",").localeCompare(b.bestRanks.join(",")));

  const transactions: ScoreTransaction[] = teamRows.map((row, index) => ({
    id: `${event.id}-${row.team.id}-event`,
    eventId: event.id,
    teamId: row.team.id,
    points: rule.eventPoints[index] ?? 0,
    reason: "event-rank",
    note: `種目内${index + 1}位（順位合計${row.rankSum}）`,
  }));

  ranked.filter((item) => item.result.isPersonalBest && item.rank !== null).forEach((item) => {
    transactions.push({
      id: `${event.id}-${item.entry.id}-pb`,
      eventId: event.id,
      teamId: item.athlete.teamId,
      points: rule.pbBonus,
      reason: "pb-bonus",
      note: `${item.athlete.name} PB`,
    });
  });

  return transactions;
}

export function calculateOverallStandings(
  teams: Team[],
  transactions: ScoreTransaction[],
): Array<Team & { points: number; wins: number; seconds: number; rank: number }> {
  const rows = teams.map((team) => {
    const own = transactions.filter((transaction) => transaction.teamId === team.id);
    return {
      ...team,
      points: own.reduce((sum, transaction) => sum + transaction.points, 0),
      wins: own.filter((transaction) => transaction.reason === "event-rank" && transaction.points === 6).length,
      seconds: own.filter((transaction) => transaction.reason === "event-rank" && transaction.points === 4).length,
      rank: 0,
    };
  }).sort((a, b) => b.points - a.points || b.wins - a.wins || b.seconds - a.seconds || a.displayOrder - b.displayOrder);

  let prior: (typeof rows)[number] | null = null;
  let rank = 0;
  return rows.map((row, index) => {
    if (!prior || row.points !== prior.points || row.wins !== prior.wins || row.seconds !== prior.seconds) rank = index + 1;
    prior = row;
    return { ...row, rank };
  });
}
