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
  discipline?: "トラック" | "跳躍" | "投てき";
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
  attempts?: Array<number | null>;
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
  dataVersion: 3;
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
  { id: "A", name: "Aチーム", shortName: "A", displayOrder: 1 },
  { id: "B", name: "Bチーム", shortName: "B", displayOrder: 2 },
  { id: "C", name: "Cチーム", shortName: "C", displayOrder: 3 },
];

const athleteRows = [
  ["冨田 歩佑", "A", "男子"], ["今井 賢冴", "A", "男子"], ["梅田 歩武", "A", "男子"],
  ["山本 俊太朗", "A", "男子"], ["中島 優太", "A", "男子"], ["西脇 唯央", "A", "女子"],
  ["石川 華衣", "A", "女子"], ["川村 優奈", "A", "女子"], ["坂口 彩恵", "A", "女子"],
  ["小出 琳太郎", "B", "男子"], ["寺田 開翔", "B", "男子"], ["奥岡 快", "B", "男子"],
  ["横井 晴紀", "B", "男子"], ["下里 洸凱", "B", "男子"], ["佐々木 康太郎", "B", "男子"],
  ["福田 奈緒子", "B", "女子"], ["小堀 冬芽", "B", "女子"], ["マジョンド 花房", "B", "女子"],
  ["早川 知希", "C", "男子"], ["太田 伊吹", "C", "男子"], ["児玉 大輝", "C", "男子"],
  ["木村 俐斗", "C", "男子"], ["新保 了輔", "C", "男子"], ["砂原 葵", "C", "女子"],
  ["浜砂 來実", "C", "女子"], ["野村 結菜", "C", "女子"], ["青松 政宏", "C", "男子"],
] as const;

export const athletes: Athlete[] = athleteRows.map(([name, teamId, sex], index) => ({
  id: `athlete-${index + 1}`,
  bib: 101 + index,
  name,
  kana: name,
  grade: 1,
  sex,
  teamId,
  affiliation: "校内陸上部",
  region: "校内",
  abilityBand: (["A", "B", "C"] as const)[index % 3],
  personalBests: {},
}));

export const events: Event[] = [
  { id: "80m", name: "100m", category: "共通", kind: "track", discipline: "トラック", direction: "asc", unit: "seconds", startTime: "13:50", round: "ﾀｲﾑﾚｰｽ", scoringSlots: 3, status: "編成済み" },
  { id: "250m", name: "250m（1周）", category: "共通", kind: "track", discipline: "トラック", direction: "asc", unit: "seconds", startTime: "14:05", round: "ﾀｲﾑﾚｰｽ", scoringSlots: 3, status: "編成済み" },
  { id: "long", name: "走幅跳", category: "共通", kind: "field", discipline: "跳躍", direction: "desc", unit: "meters", startTime: "14:35", round: "決　勝", scoringSlots: 3, status: "編成済み" },
  { id: "high", name: "走高跳", category: "共通", kind: "field", discipline: "跳躍", direction: "desc", unit: "meters", startTime: "14:35", round: "決　勝", scoringSlots: 3, status: "編成済み" },
  { id: "shot", name: "砲丸投", category: "共通", kind: "field", discipline: "投てき", direction: "desc", unit: "meters", startTime: "14:35", round: "決　勝", scoringSlots: 3, status: "編成済み" },
  { id: "500m", name: "500m（250m×2周）", category: "共通", kind: "track", discipline: "トラック", direction: "asc", unit: "seconds", startTime: "15:45", round: "ﾀｲﾑﾚｰｽ", scoringSlots: 3, status: "編成済み" },
  { id: "hurdle", name: "110mハードル", category: "共通", kind: "track", discipline: "トラック", direction: "asc", unit: "seconds", startTime: "16:05", round: "ﾀｲﾑﾚｰｽ", scoringSlots: 3, status: "編成済み" },
  { id: "1000m", name: "1000m（4周）", category: "共通", kind: "track", discipline: "トラック", direction: "asc", unit: "seconds", startTime: "16:25", round: "決　勝", scoringSlots: 3, status: "編成済み" },
  { id: "relay", name: "9×400m 全員リレー", category: "共通", kind: "track", discipline: "トラック", direction: "asc", unit: "seconds", startTime: "16:50", round: "決　勝", scoringSlots: 1, status: "編成済み" },
];

const heatCounts: Record<string, number> = {
  "80m": 5, "250m": 5, long: 1, high: 1, shot: 1,
  "500m": 5, hurdle: 5, "1000m": 1, relay: 1,
};

export const heats: Heat[] = events.flatMap((event) =>
  Array.from({ length: heatCounts[event.id] }, (_, index) => ({
    id: `${event.id}-heat-${index + 1}`,
    eventId: event.id,
    number: index + 1,
    callCompleteAt: "--:--",
  })),
);

export const entries: Entry[] = [];
export const results: Result[] = [];

export const scoreRules: ScoreRule[] = [
  { id: "default", eventPoints: [6, 4, 2], pbBonus: 1, invalidPenalty: 99 },
];

export const initialState: MeetingState = {
  dataVersion: 3,
  athletes,
  teams,
  events,
  entries,
  heats,
  results,
  scoreRules,
  scoreTransactions: [],
  auditLogs: [],
  updatedAt: "",
};
