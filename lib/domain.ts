export type SexCategory = "男子" | "女子";
export type AbilityBand = "A" | "B" | "C";
export type EventKind = "track" | "field";
export type EventStatus = "編成済み" | "入力中" | "速報" | "確定" | "訂正中";
export type ResultStatus = "OK" | "DNS" | "DNF" | "DQ" | "NM";

export type Team = {
  id: string;
  name: string;
  shortName: string;
  displayOrder: number;
};

export type Athlete = {
  id: string;
  bib: number;
  name: string;
  kana: string;
  grade: number;
  sex: SexCategory;
  teamId: string;
  affiliation: string;
  region: string;
  abilityBand: AbilityBand;
  personalBests: Record<string, number>;
};

export type Event = {
  id: string;
  name: string;
  category: "男子" | "女子" | "共通";
  kind: EventKind;
  direction: "asc" | "desc";
  unit: "seconds" | "meters";
  startTime: string;
  round: string;
  scoringSlots: number;
  status: EventStatus;
};

export type Heat = {
  id: string;
  eventId: string;
  number: number;
  callCompleteAt: string;
};

export type Entry = {
  id: string;
  eventId: string;
  heatId: string;
  athleteId: string;
  laneOrOrder: number;
  scoringEligible: boolean;
};

export type Result = {
  id: string;
  entryId: string;
  value: number | null;
  displayValue: string;
  status: ResultStatus;
  provisional: boolean;
  isPersonalBest: boolean;
};

export type ScoreRule = {
  id: string;
  eventPoints: number[];
  pbBonus: number;
  invalidPenalty: number;
};

export type ScoreTransaction = {
  id: string;
  eventId: string;
  teamId: string;
  points: number;
  reason: "event-rank" | "pb-bonus" | "manual";
  note: string;
};

export type AuditLog = {
  id: string;
  at: string;
  actor: string;
  action: string;
  entity: string;
  before: string;
  after: string;
  reason: string;
};

export type MeetingState = {
  dataVersion: 2;
  athletes: Athlete[];
  teams: Team[];
  events: Event[];
  entries: Entry[];
  heats: Heat[];
  results: Result[];
  scoreRules: ScoreRule[];
  scoreTransactions: ScoreTransaction[];
  auditLogs: AuditLog[];
  updatedAt: string;
};

export const teams: Team[] = [
  { id: "red", name: "赤組", shortName: "赤", displayOrder: 1 },
  { id: "blue", name: "青組", shortName: "青", displayOrder: 2 },
  { id: "green", name: "緑組", shortName: "緑", displayOrder: 3 },
];

const athleteRows = [
  ["青木 陽斗", "ｱｵｷ ﾊﾙﾄ", "校内陸上部", "red"],
  ["石川 結衣", "ｲｼｶﾜ ﾕｲ", "校内陸上部", "blue"],
  ["上田 蒼真", "ｳｴﾀﾞ ｿｳﾏ", "校内陸上部", "green"],
  ["遠藤 美咲", "ｴﾝﾄﾞｳ ﾐｻｷ", "校内陸上部", "red"],
  ["大西 蓮", "ｵｵﾆｼ ﾚﾝ", "校内陸上部", "blue"],
  ["加藤 凛", "ｶﾄｳ ﾘﾝ", "校内陸上部", "green"],
  ["木村 悠真", "ｷﾑﾗ ﾕｳﾏ", "校内陸上部", "red"],
  ["小林 彩花", "ｺﾊﾞﾔｼ ｱﾔｶ", "校内陸上部", "blue"],
  ["斎藤 湊", "ｻｲﾄｳ ﾐﾅﾄ", "校内陸上部", "green"],
  ["佐々木 杏", "ｻｻｷ ｱﾝ", "校内陸上部", "red"],
  ["鈴木 大和", "ｽｽﾞｷ ﾔﾏﾄ", "校内陸上部", "blue"],
  ["高橋 莉央", "ﾀｶﾊｼ ﾘｵ", "校内陸上部", "green"],
  ["田中 颯太", "ﾀﾅｶ ｿｳﾀ", "校内陸上部", "red"],
  ["中村 心春", "ﾅｶﾑﾗ ｺﾊﾙ", "校内陸上部", "blue"],
  ["西村 伊織", "ﾆｼﾑﾗ ｲｵﾘ", "校内陸上部", "green"],
  ["橋本 芽依", "ﾊｼﾓﾄ ﾒｲ", "校内陸上部", "red"],
  ["林 陸", "ﾊﾔｼ ﾘｸ", "校内陸上部", "blue"],
  ["藤田 葵", "ﾌｼﾞﾀ ｱｵｲ", "校内陸上部", "green"],
  ["前田 琉生", "ﾏｴﾀﾞ ﾙｲ", "校内陸上部", "red"],
  ["松本 咲良", "ﾏﾂﾓﾄ ｻｸﾗ", "校内陸上部", "blue"],
  ["三浦 朝陽", "ﾐｳﾗ ｱｻﾋ", "校内陸上部", "green"],
  ["宮本 澪", "ﾐﾔﾓﾄ ﾐｵ", "校内陸上部", "red"],
  ["村上 岳", "ﾑﾗｶﾐ ｶﾞｸ", "校内陸上部", "blue"],
  ["森 七海", "ﾓﾘ ﾅﾅﾐ", "校内陸上部", "green"],
  ["山口 樹", "ﾔﾏｸﾞﾁ ｲﾂｷ", "校内陸上部", "red"],
  ["山田 紬", "ﾔﾏﾀﾞ ﾂﾑｷﾞ", "校内陸上部", "blue"],
  ["吉田 翔", "ﾖｼﾀﾞ ｼｮｳ", "校内陸上部", "green"],
  ["渡辺 琴音", "ﾜﾀﾅﾍﾞ ｺﾄﾈ", "校内陸上部", "red"],
  ["井上 陽向", "ｲﾉｳｴ ﾋﾅﾀ", "校内陸上部", "blue"],
  ["岡田 凪", "ｵｶﾀﾞ ﾅｷﾞ", "校内陸上部", "green"],
  ["川口 新", "ｶﾜｸﾞﾁ ｱﾗﾀ", "校内陸上部", "red"],
  ["近藤 花", "ｺﾝﾄﾞｳ ﾊﾅ", "校内陸上部", "blue"],
  ["坂本 奏太", "ｻｶﾓﾄ ｿｳﾀ", "校内陸上部", "green"],
  ["清水 ひかり", "ｼﾐｽﾞ ﾋｶﾘ", "校内陸上部", "red"],
  ["一ノ瀬 アレクサンダー翔太郎", "ｲﾁﾉｾ ｱﾚｸｻﾝﾀﾞｰｼｮｳﾀﾛｳ", "校内陸上競技部長距離ブロック", "blue"],
  ["福田 結月", "ﾌｸﾀﾞ ﾕﾂﾞｷ", "校内陸上部", "green"],
] as const;

export const athletes: Athlete[] = athleteRows.map(([name, kana, affiliation, teamId], index) => ({
  id: `athlete-${index + 1}`,
  bib: 101 + index,
  name,
  kana,
  grade: (index % 3) + 1,
  sex: index % 2 === 0 ? "男子" : "女子",
  teamId,
  affiliation,
  region: "校内",
  abilityBand: (["A", "B", "C"] as const)[index % 3],
  personalBests: {
    "60m": 7.35 + (index % 8) * 0.24,
    "250m": 34.1 + (index % 8) * 1.05,
    "500m": 79.5 + (index % 6) * 3.2,
    "走幅跳": 4.3 + (index % 7) * 0.23,
  },
}));

export const events: Event[] = [
  { id: "60m", name: "60m", category: "共通", kind: "track", direction: "asc", unit: "seconds", startTime: "13:50", round: "ﾀｲﾑﾚｰｽ", scoringSlots: 3, status: "確定" },
  { id: "250m", name: "250m（1周）", category: "共通", kind: "track", direction: "asc", unit: "seconds", startTime: "14:10", round: "ﾀｲﾑﾚｰｽ", scoringSlots: 3, status: "確定" },
  { id: "long", name: "走幅跳", category: "共通", kind: "field", direction: "desc", unit: "meters", startTime: "14:35", round: "決　勝", scoringSlots: 3, status: "速報" },
  { id: "high", name: "走高跳", category: "共通", kind: "field", direction: "desc", unit: "meters", startTime: "14:35", round: "決　勝", scoringSlots: 2, status: "入力中" },
  { id: "shot", name: "砲丸投", category: "共通", kind: "field", direction: "desc", unit: "meters", startTime: "14:35", round: "決　勝", scoringSlots: 3, status: "速報" },
  { id: "500m", name: "500m（2周）", category: "共通", kind: "track", direction: "asc", unit: "seconds", startTime: "15:45", round: "ﾀｲﾑﾚｰｽ", scoringSlots: 2, status: "編成済み" },
  { id: "1000m", name: "1000m（4周）", category: "共通", kind: "track", direction: "asc", unit: "seconds", startTime: "16:05", round: "決　勝", scoringSlots: 2, status: "編成済み" },
  { id: "declare", name: "申告タイム250m", category: "共通", kind: "track", direction: "asc", unit: "seconds", startTime: "16:30", round: "特別競技", scoringSlots: 2, status: "編成済み" },
  { id: "relay", name: "4×250mリレー", category: "共通", kind: "track", direction: "asc", unit: "seconds", startTime: "16:55", round: "決　勝", scoringSlots: 1, status: "編成済み" },
  { id: "shuttle", name: "12×50m全員シャトルR", category: "共通", kind: "track", direction: "asc", unit: "seconds", startTime: "17:30", round: "決　勝", scoringSlots: 1, status: "編成済み" },
];

const heatCounts: Record<string, number> = {
  "60m": 3,
  "250m": 3,
  long: 1,
  high: 1,
  shot: 1,
  "500m": 2,
  "1000m": 1,
  declare: 2,
  relay: 1,
  shuttle: 1,
};

export const heats: Heat[] = events.flatMap((event) =>
  Array.from({ length: heatCounts[event.id] }, (_, index) => ({
    id: `${event.id}-heat-${index + 1}`,
    eventId: event.id,
    number: index + 1,
    callCompleteAt: event.status === "編成済み" ? "--:--" : event.startTime.replace(/:(\d\d)$/, (_, mm) => `:${String(Math.max(0, Number(mm) - 5)).padStart(2, "0")}`),
  })),
);

const entryCounts: Record<string, number> = {
  "60m": 18,
  "250m": 9,
  long: 9,
  high: 6,
  shot: 9,
  "500m": 6,
  "1000m": 6,
  declare: 6,
  relay: 3,
  shuttle: 3,
};

export const entries: Entry[] = events.flatMap((event) => {
  const eventHeats = heats.filter((heat) => heat.eventId === event.id);
  return Array.from({ length: entryCounts[event.id] }, (_, index) => {
    const heat = eventHeats[index % eventHeats.length];
    return {
      id: `${event.id}-entry-${index + 1}`,
      eventId: event.id,
      heatId: heat.id,
      athleteId: event.id === "long" && index === entryCounts[event.id] - 1
        ? athletes[34].id
        : athletes[index % athletes.length].id,
      laneOrOrder: Math.floor(index / eventHeats.length) + 1,
      scoringEligible: true,
    };
  });
});

const trackValues: Record<string, number[]> = {
  "60m": [7.46, 7.46, 7.65, 7.71, 7.83, 7.94, 7.52, 7.66, 7.79, 7.9, 8.04, 8.21, 7.59, 7.72, 7.88, 8.01, 8.16, 8.28],
  "250m": [34.28, 34.86, 35.15, 35.62, 36.08, 36.44, 36.92, 37.31, 37.9],
  "500m": [78.54, 81.32, 83.45, 85.08, 88.22, 91.6],
};
const fieldValues: Record<string, number[]> = {
  long: [5.8, 5.63, 5.42, 5.31, 5.08, 4.96, 4.75, 4.51, 4.38],
  high: [1.7, 1.65, 1.65, 1.6, 1.55, 1.5],
  shot: [11.5, 10.92, 10.44, 9.98, 9.42, 8.86, 8.31, 7.95, 7.54],
};

export const results: Result[] = entries.flatMap((entry, index) => {
  const eventEntries = entries.filter((candidate) => candidate.eventId === entry.eventId);
  const position = eventEntries.findIndex((candidate) => candidate.id === entry.id);
  const values = trackValues[entry.eventId] || fieldValues[entry.eventId];
  if (!values) return [];
  const invalidStatus: ResultStatus =
    entry.eventId === "60m" && position === 5 ? "DNS" :
    entry.eventId === "60m" && position === 11 ? "DNF" :
    entry.eventId === "60m" && position === 17 ? "DQ" :
    entry.eventId === "long" && position === 8 ? "NM" : "OK";
  const value = invalidStatus === "OK" ? values[position] : null;
  const athlete = athletes.find((candidate) => candidate.id === entry.athleteId)!;
  const pb = athlete.personalBests[entry.eventId] ?? null;
  return [{
    id: `result-${entry.id}`,
    entryId: entry.id,
    value,
    displayValue: "",
    status: invalidStatus,
    provisional: !["60m", "250m"].includes(entry.eventId),
    isPersonalBest: value !== null && pb !== null && (events.find((candidate) => candidate.id === entry.eventId)!.direction === "asc" ? value < pb : value > pb),
  }];
});

export const scoreRules: ScoreRule[] = [
  { id: "default", eventPoints: [6, 4, 2], pbBonus: 1, invalidPenalty: 99 },
];

export const initialState: MeetingState = {
  dataVersion: 2,
  athletes,
  teams,
  events,
  entries,
  heats,
  results,
  scoreRules,
  scoreTransactions: [],
  auditLogs: [
    { id: "audit-1", at: "14:42:18", actor: "走幅跳記録係", action: "速報保存", entity: "走幅跳", before: "入力中", after: "速報", reason: "全試技確認済み" },
    { id: "audit-2", at: "14:31:04", actor: "主任記録員", action: "確定", entity: "250m（1周）", before: "速報", after: "確定", reason: "全3組確認済み" },
  ],
  updatedAt: "14:42:18",
};
