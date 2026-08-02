import type { AbilityBand, Athlete, Entry, MeetingState, SexCategory } from "./domain.ts";
import { parseCsv } from "./adminCsv.ts";

export const ATHLETE_CSV_HEADERS = [
  "選手No", "氏名", "カナ", "性別", "学年", "チームID", "所属", "地域", "実力帯",
] as const;

function escapeCsv(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function createAthleteCsvTemplate(state: MeetingState) {
  const rows = [...state.athletes]
    .sort((left, right) => left.bib - right.bib)
    .map((athlete) => [
      athlete.bib, athlete.name, athlete.kana, athlete.sex, athlete.grade,
      athlete.teamId, athlete.affiliation, athlete.region, athlete.abilityBand,
    ].map(escapeCsv).join(","));
  return [ATHLETE_CSV_HEADERS.join(","), ...rows].join("\r\n");
}

export function applyAthleteCsv(state: MeetingState, text: string) {
  const [headers, ...rows] = parseCsv(text);
  if (!headers || rows.length === 0) throw new Error("CSVに取込行がありません");
  const missing = ATHLETE_CSV_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`CSVの列が不足しています: ${missing.join("、")}`);
  const existingByBib = new Map(state.athletes.map((athlete) => [athlete.bib, athlete]));
  const seen = new Set<number>();
  const athletes = rows.map((values, index): Athlete => {
    const row = Object.fromEntries(ATHLETE_CSV_HEADERS.map((header) => [
      header, values[headers.indexOf(header)]?.trim() ?? "",
    ])) as Record<(typeof ATHLETE_CSV_HEADERS)[number], string>;
    const line = index + 2;
    const bib = Number(row["選手No"]);
    const grade = Number(row["学年"]);
    if (!Number.isInteger(bib) || bib < 1) throw new Error(`${line}行目: 選手Noが不正です`);
    if (seen.has(bib)) throw new Error(`${line}行目: 選手No ${bib} が重複しています`);
    if (!row["氏名"]) throw new Error(`${line}行目: 氏名を入力してください`);
    if (!["男子", "女子"].includes(row["性別"])) throw new Error(`${line}行目: 性別は男子または女子です`);
    if (!Number.isInteger(grade) || grade < 1 || grade > 6) throw new Error(`${line}行目: 学年が不正です`);
    if (!state.teams.some((team) => team.id === row["チームID"])) throw new Error(`${line}行目: チームIDが不正です`);
    const abilityBand = row["実力帯"] || "C";
    if (!["A", "B", "C"].includes(abilityBand)) throw new Error(`${line}行目: 実力帯はA・B・Cです`);
    seen.add(bib);
    const existing = existingByBib.get(bib);
    return {
      id: existing?.id ?? `athlete-csv-${bib}`,
      bib,
      name: row["氏名"],
      kana: row["カナ"] || row["氏名"],
      sex: row["性別"] as SexCategory,
      grade,
      teamId: row["チームID"],
      affiliation: row["所属"],
      region: row["地域"],
      abilityBand: abilityBand as AbilityBand,
      personalBests: existing?.personalBests ?? {},
    };
  });
  const retainedIds = new Set(athletes.map((athlete) => athlete.id));
  const retainedEntries = state.entries.filter((entry) => retainedIds.has(entry.athleteId));
  const retainedEntryIds = new Set(retainedEntries.map((entry) => entry.id));
  return {
    state: {
      ...state,
      athletes: athletes.sort((left, right) => left.bib - right.bib),
      entries: retainedEntries,
      results: state.results.filter((result) => retainedEntryIds.has(result.entryId)),
    },
    athleteCount: athletes.length,
  };
}

export function eventIdsForAthlete(state: MeetingState, athleteId: string) {
  return state.events
    .filter((event) => state.entries.some((entry) => entry.athleteId === athleteId && entry.eventId === event.id))
    .map((event) => event.id)
    .slice(0, 3);
}

export type EventRegistrationSlot = {
  id: string;
  label: string;
  heatId: string;
  laneOrOrder: number;
  teamId: string;
  slotNumber: number;
};

const TEAM_FIELD_EVENT_IDS = new Set(["long", "high", "shot"]);

function isTeamFieldEvent(eventId: string) {
  return TEAM_FIELD_EVENT_IDS.has(eventId);
}

export function eventRegistrationSlots(state: MeetingState, eventId: string): EventRegistrationSlot[] {
  const heats = state.heats
    .filter((heat) => heat.eventId === eventId)
    .sort((left, right) => left.number - right.number);
  if (isTeamFieldEvent(eventId)) {
    const heat = heats[0];
    if (!heat) return [];
    return [...state.teams]
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .flatMap((team, teamIndex) =>
        [1, 2, 3, 4, 5].map((slotNumber) => ({
          id: `${eventId}-${team.id}-slot-${slotNumber}`,
          label: `${team.name} ${slotNumber}人目`,
          heatId: heat.id,
          laneOrOrder: teamIndex * 5 + slotNumber,
          teamId: team.id,
          slotNumber,
        })),
      );
  }
  return heats.flatMap((heat) => [...state.teams]
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((team, teamIndex) => ({
      id: `${eventId}-${heat.id}-${team.id}`,
      label: `${heat.number}組 ${team.name}`,
      heatId: heat.id,
      laneOrOrder: teamIndex + 1,
      teamId: team.id,
      slotNumber: 1,
    })));
}

export function eventSlotAssignmentsForEvent(state: MeetingState, eventId: string) {
  const eventEntries = state.entries.filter((entry) => entry.eventId === eventId);
  const usedEntryIds = new Set<string>();
  return Object.fromEntries(eventRegistrationSlots(state, eventId).map((slot) => {
    const exact = eventEntries.find((entry) => {
      const athlete = state.athletes.find((candidate) => candidate.id === entry.athleteId);
      return !usedEntryIds.has(entry.id)
        && entry.heatId === slot.heatId
        && entry.laneOrOrder === slot.laneOrOrder
        && athlete?.teamId === slot.teamId;
    });
    const compatible = exact ?? eventEntries.find((entry) => {
      const athlete = state.athletes.find((candidate) => candidate.id === entry.athleteId);
      return !usedEntryIds.has(entry.id)
        && entry.heatId === slot.heatId
        && athlete?.teamId === slot.teamId;
    });
    if (compatible) usedEntryIds.add(compatible.id);
    return [slot.id, compatible?.athleteId ?? ""];
  }));
}

export function applyEventSlotAthleteAssignments(
  state: MeetingState,
  eventId: string,
  assignments: Record<string, string>,
) {
  const event = state.events.find((candidate) => candidate.id === eventId);
  if (!event) throw new Error("種目が見つかりません");

  const slots = eventRegistrationSlots(state, eventId);
  if (!slots.length) throw new Error(`${event.name}: 登録枠がありません`);

  const selected = slots
    .map((slot) => assignments[slot.id] ?? "")
    .filter(Boolean);
  if (new Set(selected).size !== selected.length) {
    throw new Error("同じ選手を同じ種目の複数枠へ登録できません");
  }
  const athleteIds = new Set(state.athletes.map((athlete) => athlete.id));
  const missingAthlete = selected.find((athleteId) => !athleteIds.has(athleteId));
  if (missingAthlete) throw new Error("存在しない選手が選択されています");
  const teamsById = new Map(state.teams.map((team) => [team.id, team]));
  for (const slot of slots) {
    const athleteId = assignments[slot.id];
    if (!athleteId) continue;
    const athlete = state.athletes.find((candidate) => candidate.id === athleteId)!;
    if (athlete.teamId !== slot.teamId) {
      const team = teamsById.get(slot.teamId);
      throw new Error(`${slot.label}: ${athlete.name}は${team?.name ?? slot.teamId}の選手ではありません`);
    }
  }

  const previousEventEntries = state.entries.filter((entry) => entry.eventId === eventId);
  const previousBySlot = new Map(previousEventEntries.map((entry) => [`${entry.heatId}:${entry.laneOrOrder}`, entry]));
  const previousByAthlete = new Map(previousEventEntries.map((entry) => [entry.athleteId, entry]));
  const entries = state.entries.filter((entry) => entry.eventId !== eventId);
  const keptEntryIds = new Set(entries.map((entry) => entry.id));

  for (const athleteId of selected) {
    const registeredEventCount = new Set([
      ...entries.filter((entry) => entry.athleteId === athleteId).map((entry) => entry.eventId),
      eventId,
    ]).size;
    if (registeredEventCount > 3) {
      const athlete = state.athletes.find((candidate) => candidate.id === athleteId)!;
      throw new Error(`${athlete.name}: 出場種目は最大3つまでです`);
    }
  }

  for (const slot of slots) {
    const athleteId = assignments[slot.id];
    if (!athleteId) continue;
    const exactPrevious = previousBySlot.get(`${slot.heatId}:${slot.laneOrOrder}`);
    const previous = exactPrevious?.athleteId === athleteId ? exactPrevious : previousByAthlete.get(athleteId);
    const entry: Entry = {
      id: previous?.athleteId === athleteId ? previous.id : `entry-self-${eventId}-${slot.id}-${athleteId}`,
      eventId,
      heatId: slot.heatId,
      athleteId,
      laneOrOrder: slot.laneOrOrder,
      scoringEligible: true,
    };
    entries.push(entry);
    keptEntryIds.add(entry.id);
  }

  return {
    ...state,
    entries,
    results: state.results.filter((result) => keptEntryIds.has(result.entryId)),
  };
}

export function heatAthleteAssignmentsForEvent(state: MeetingState, eventId: string) {
  return eventSlotAssignmentsForEvent(state, eventId);
}

export function applyEventHeatAthleteAssignments(
  state: MeetingState,
  eventId: string,
  assignments: Record<string, string>,
) {
  return applyEventSlotAthleteAssignments(state, eventId, assignments);
}

export function applyAthleteEventAssignments(
  state: MeetingState,
  assignments: Record<string, string[]>,
) {
  const eventIds = new Set(state.events.map((event) => event.id));
  const managedAthletes = new Set(Object.keys(assignments));
  const entries = state.entries.filter((entry) => !managedAthletes.has(entry.athleteId));
  const keptEntryIds = new Set(entries.map((entry) => entry.id));

  for (const athlete of state.athletes) {
    if (!managedAthletes.has(athlete.id)) continue;
    const desired = assignments[athlete.id].filter(Boolean);
    if (desired.length > 3 || new Set(desired).size !== desired.length) {
      throw new Error(`${athlete.name}: 同じ種目を重複して選択できません`);
    }
    if (desired.some((eventId) => !eventIds.has(eventId))) {
      throw new Error(`${athlete.name}: 存在しない種目が選択されています`);
    }
    for (const eventId of desired) {
      const existing = state.entries.find((entry) => entry.athleteId === athlete.id && entry.eventId === eventId);
      if (existing) {
        entries.push(existing);
        keptEntryIds.add(existing.id);
        continue;
      }
      const heats = state.heats.filter((heat) => heat.eventId === eventId);
      if (!heats.length) throw new Error(`${state.events.find((event) => event.id === eventId)?.name}: 組がありません`);
      const heat = [...heats].sort((left, right) => {
        const leftCount = entries.filter((entry) => entry.heatId === left.id).length;
        const rightCount = entries.filter((entry) => entry.heatId === right.id).length;
        return leftCount - rightCount || left.number - right.number;
      })[0];
      const laneOrOrder = Math.max(0, ...entries.filter((entry) => entry.heatId === heat.id).map((entry) => entry.laneOrOrder)) + 1;
      const entry: Entry = {
        id: `entry-assignment-${athlete.id}-${eventId}`,
        eventId,
        heatId: heat.id,
        athleteId: athlete.id,
        laneOrOrder,
        scoringEligible: true,
      };
      entries.push(entry);
      keptEntryIds.add(entry.id);
    }
  }
  return {
    ...state,
    entries,
    results: state.results.filter((result) => keptEntryIds.has(result.entryId)),
  };
}
