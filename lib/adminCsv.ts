import type {
  AbilityBand,
  Athlete,
  Entry,
  MeetingState,
  SexCategory,
} from "./domain.ts";

export const BULK_CSV_HEADERS = [
  "種目ID",
  "種目名",
  "開始時刻",
  "組",
  "レーン・試順",
  "選手No",
  "氏名",
  "カナ",
  "学年",
  "性別",
  "チームID",
  "所属",
  "地域",
  "実力帯",
  "得点対象",
] as const;

type BulkCsvRow = Record<(typeof BULK_CSV_HEADERS)[number], string>;

function escapeCsv(value: string | number | boolean) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  row.push(field.replace(/\r$/, ""));
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

export function createBulkCsvTemplate(state: MeetingState) {
  const rows = [...state.entries]
    .sort((left, right) => {
      const leftEvent = state.events.findIndex((event) => event.id === left.eventId);
      const rightEvent = state.events.findIndex((event) => event.id === right.eventId);
      if (leftEvent !== rightEvent) return leftEvent - rightEvent;
      const leftHeat = state.heats.find((heat) => heat.id === left.heatId)?.number ?? 0;
      const rightHeat = state.heats.find((heat) => heat.id === right.heatId)?.number ?? 0;
      return leftHeat - rightHeat || left.laneOrOrder - right.laneOrOrder;
    })
    .map((entry) => {
      const event = state.events.find((candidate) => candidate.id === entry.eventId)!;
      const heat = state.heats.find((candidate) => candidate.id === entry.heatId)!;
      const athlete = state.athletes.find((candidate) => candidate.id === entry.athleteId)!;
      return [
        event.id,
        event.name,
        event.startTime,
        heat.number,
        entry.laneOrOrder,
        athlete.bib,
        athlete.name,
        athlete.kana,
        athlete.grade,
        athlete.sex,
        athlete.teamId,
        athlete.affiliation,
        athlete.region,
        athlete.abilityBand,
        entry.scoringEligible ? "1" : "0",
      ].map(escapeCsv).join(",");
    });

  return [BULK_CSV_HEADERS.join(","), ...rows].join("\r\n");
}

function parseBoolean(value: string, rowNumber: number) {
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "○", "はい"].includes(normalized)) return true;
  if (["0", "false", "－", "-", "いいえ"].includes(normalized)) return false;
  throw new Error(`${rowNumber}行目: 得点対象は1または0で入力してください`);
}

function rowRecord(headers: string[], values: string[]): BulkCsvRow {
  const missing = BULK_CSV_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`CSVの列が不足しています: ${missing.join("、")}`);
  return Object.fromEntries(
    BULK_CSV_HEADERS.map((header) => [header, values[headers.indexOf(header)]?.trim() ?? ""]),
  ) as BulkCsvRow;
}

export type BulkCsvImportResult = {
  state: MeetingState;
  rowCount: number;
  eventCount: number;
  athleteCount: number;
};

export function applyBulkCsv(state: MeetingState, text: string): BulkCsvImportResult {
  const parsed = parseCsv(text);
  if (parsed.length < 2) throw new Error("CSVに取込行がありません");
  const [headers, ...dataRows] = parsed;
  const rows = dataRows.map((values) => rowRecord(headers, values));
  const importedEventIds = new Set<string>();
  const eventMetadata = new Map<string, { name: string; startTime: string }>();
  const athleteByBib = new Map(state.athletes.map((athlete) => [athlete.bib, athlete]));
  const nextAthletesByBib = new Map(athleteByBib);
  const slotKeys = new Set<string>();

  const normalizedRows = rows.map((row, index) => {
    const rowNumber = index + 2;
    const event = state.events.find((candidate) => candidate.id === row["種目ID"]);
    if (!event) throw new Error(`${rowNumber}行目: 種目ID「${row["種目ID"]}」が見つかりません`);
    if (!row["種目名"]) throw new Error(`${rowNumber}行目: 種目名を入力してください`);
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row["開始時刻"])) {
      throw new Error(`${rowNumber}行目: 開始時刻はHH:MM形式で入力してください`);
    }

    const previousMetadata = eventMetadata.get(event.id);
    const metadata = { name: row["種目名"], startTime: row["開始時刻"] };
    if (previousMetadata && (previousMetadata.name !== metadata.name || previousMetadata.startTime !== metadata.startTime)) {
      throw new Error(`${rowNumber}行目: 同じ種目IDの種目名・開始時刻が一致していません`);
    }
    eventMetadata.set(event.id, metadata);
    importedEventIds.add(event.id);

    const heatNumber = Number(row["組"]);
    const heat = state.heats.find((candidate) => candidate.eventId === event.id && candidate.number === heatNumber);
    if (!heat) throw new Error(`${rowNumber}行目: ${event.name}の${row["組"]}組が見つかりません`);
    const laneOrOrder = Number(row["レーン・試順"]);
    if (!Number.isInteger(laneOrOrder) || laneOrOrder < 1) {
      throw new Error(`${rowNumber}行目: レーン・試順は1以上の整数で入力してください`);
    }
    const slotKey = `${event.id}|${heat.id}|${laneOrOrder}`;
    if (slotKeys.has(slotKey)) throw new Error(`${rowNumber}行目: 同じ組・レーンが重複しています`);
    slotKeys.add(slotKey);

    const bib = Number(row["選手No"]);
    const grade = Number(row["学年"]);
    if (!Number.isInteger(bib) || bib < 1) throw new Error(`${rowNumber}行目: 選手Noが不正です`);
    if (!row["氏名"] || !row["カナ"]) throw new Error(`${rowNumber}行目: 氏名とカナを入力してください`);
    if (!Number.isInteger(grade) || grade < 1 || grade > 6) throw new Error(`${rowNumber}行目: 学年が不正です`);
    if (!["男子", "女子"].includes(row["性別"])) throw new Error(`${rowNumber}行目: 性別は男子または女子です`);
    if (!state.teams.some((team) => team.id === row["チームID"])) {
      throw new Error(`${rowNumber}行目: チームID「${row["チームID"]}」が見つかりません`);
    }
    const abilityBand = row["実力帯"] || "C";
    if (!["A", "B", "C"].includes(abilityBand)) throw new Error(`${rowNumber}行目: 実力帯はA・B・Cのいずれかです`);

    const existingAthlete = athleteByBib.get(bib);
    const athlete: Athlete = {
      id: existingAthlete?.id ?? `athlete-csv-${bib}`,
      bib,
      name: row["氏名"],
      kana: row["カナ"],
      grade,
      sex: row["性別"] as SexCategory,
      teamId: row["チームID"],
      affiliation: row["所属"],
      region: row["地域"],
      abilityBand: abilityBand as AbilityBand,
      personalBests: existingAthlete?.personalBests ?? {},
    };
    nextAthletesByBib.set(bib, athlete);

    return {
      event,
      heat,
      laneOrOrder,
      athlete,
      scoringEligible: parseBoolean(row["得点対象"], rowNumber),
    };
  });

  const originalImportedEntries = state.entries.filter((entry) => importedEventIds.has(entry.eventId));
  const originalBySlot = new Map(originalImportedEntries.map((entry) => [
    `${entry.eventId}|${entry.heatId}|${entry.laneOrOrder}`,
    entry,
  ]));
  const preservedResultEntryIds = new Set<string>();
  const importedEntries: Entry[] = normalizedRows.map(({ event, heat, laneOrOrder, athlete, scoringEligible }) => {
    const slotKey = `${event.id}|${heat.id}|${laneOrOrder}`;
    const previous = originalBySlot.get(slotKey);
    if (previous?.athleteId === athlete.id) preservedResultEntryIds.add(previous.id);
    return {
      id: previous?.id ?? `entry-csv-${event.id}-${heat.number}-${laneOrOrder}-${athlete.bib}`,
      eventId: event.id,
      heatId: heat.id,
      athleteId: athlete.id,
      laneOrOrder,
      scoringEligible,
    };
  });
  const importedEntryIds = new Set(originalImportedEntries.map((entry) => entry.id));

  return {
    state: {
      ...state,
      athletes: [...nextAthletesByBib.values()].sort((left, right) => left.bib - right.bib),
      events: state.events.map((event) => {
        const metadata = eventMetadata.get(event.id);
        return metadata ? { ...event, ...metadata } : event;
      }),
      entries: [
        ...state.entries.filter((entry) => !importedEventIds.has(entry.eventId)),
        ...importedEntries,
      ],
      results: state.results.filter((result) =>
        !importedEntryIds.has(result.entryId) || preservedResultEntryIds.has(result.entryId)),
    },
    rowCount: normalizedRows.length,
    eventCount: importedEventIds.size,
    athleteCount: nextAthletesByBib.size,
  };
}
