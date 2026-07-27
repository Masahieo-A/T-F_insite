"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  initialState,
  type Entry,
  type Event,
  type EventStatus,
  type MeetingState,
  type Result,
  type ResultStatus,
} from "@/lib/domain";
import {
  calculateAthleteEventScores,
  calculateEventScoreTransactions,
  calculateOverallStandings,
  formatPerformance,
  normalizePerformance,
  rankResults,
  sanitizeNumericInput,
  type RankedResult,
} from "@/lib/ranking";
import { applyBulkCsv, createBulkCsvTemplate } from "@/lib/adminCsv";
import {
  applyEventHeatAthleteAssignments,
  applyAthleteCsv,
  applyAthleteEventAssignments,
  createAthleteCsvTemplate,
  eventIdsForAthlete,
  heatAthleteAssignmentsForEvent,
} from "@/lib/registration";

type View = "schedule" | "results" | "team" | "input" | "selfEntry" | "registration" | "admin";
type ResultMode = "heats" | "overall";
type AdminMode = "status" | "athletes" | "entries" | "corrections" | "audit";
type RegistrationMode = "athletes" | "events" | "assignments";
type Discipline = "トラック" | "跳躍" | "投てき";

const RESULT_CODES: ResultStatus[] = ["DNS", "DNF", "DQ", "NM"];
const EVENT_STATUSES: EventStatus[] = ["編成済み", "入力中", "速報", "確定", "訂正中"];
const DISCIPLINE_FILTERS = [
  { label: "全て", value: "全て" },
  { label: "トラック", value: "トラック" },
  { label: "跳躍", value: "跳躍" },
  { label: "投擲", value: "投てき" },
] as const;

function currentTime() {
  return new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function currentEpoch() {
  return Date.now();
}

function callCompleteAtFromStart(startTime: string) {
  const [hours, minutes] = startTime.split(":").map(Number);
  const totalMinutes = (hours * 60 + minutes - 5 + 24 * 60) % (24 * 60);
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function isMeetingState(value: unknown): value is MeetingState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<MeetingState>;
  return state.dataVersion === 3
    && Array.isArray(state.athletes)
    && Array.isArray(state.entries)
    && Array.isArray(state.heats)
    && Array.isArray(state.results);
}

function withRequiredHeats(state: MeetingState) {
  const requiredCounts: Record<string, number> = { "500m": 3, hurdle: 3 };
  const heats = [...state.heats];
  for (const [eventId, count] of Object.entries(requiredCounts)) {
    for (let number = 1; number <= count; number += 1) {
      if (heats.some((heat) => heat.eventId === eventId && heat.number === number)) continue;
      heats.push({
        id: `${eventId}-heat-${number}`,
        eventId,
        number,
        callCompleteAt: "--:--",
      });
    }
  }
  return heats.length === state.heats.length ? state : { ...state, heats };
}

async function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("nans-kounai-faithful", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("cache")) db.createObjectStore("cache");
      if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbPut(store: string, key: IDBValidKey | undefined, value: unknown) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const request = key === undefined ? tx.objectStore(store).add(value) : tx.objectStore(store).put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  db.close();
}

async function idbGetState(): Promise<MeetingState | null> {
  const db = await openDb();
  return new Promise((resolve) => {
    const request = db.transaction("cache").objectStore("cache").get("state");
    request.onsuccess = () => {
      db.close();
      resolve(isMeetingState(request.result) ? withRequiredHeats(request.result) : null);
    };
    request.onerror = () => {
      db.close();
      resolve(null);
    };
  });
}

function eventDiscipline(event: Event) {
  if (event.discipline) return event.discipline;
  if (event.id === "shot") return "投てき";
  if (["long", "high"].includes(event.id)) return "跳躍";
  return "トラック";
}

function fullEventName(event: Event) {
  return `${event.category}${event.name}`;
}

function getResult(state: MeetingState, entryId: string): Result | undefined {
  return state.results.find((result) => result.entryId === entryId);
}

function getEntryRows(
  state: MeetingState,
  event: Event,
  entryList: Entry[],
  order: "lane" | "rank",
): RankedResult[] {
  const ranked = rankResults(state.results, entryList, state.athletes, event);
  return order === "rank"
    ? ranked
    : [...ranked].sort((a, b) => a.entry.laneOrOrder - b.entry.laneOrOrder);
}

function displayResult(item: RankedResult, event: Event) {
  return item.result.status === "OK"
    ? formatPerformance(item.result.value, event)
    : item.result.status;
}

function normalizeAthleteInput(value: string) {
  return value.trim().replace(/[ 　]/g, "");
}

export default function Home() {
  const [state, setState] = useState<MeetingState>(initialState);
  const [view, setView] = useState<View>("schedule");
  const [kindFilter, setKindFilter] = useState("全て");
  const [sexFilter, setSexFilter] = useState("全て");
  const [selectedEventId, setSelectedEventId] = useState("80m");
  const [selectedHeatId, setSelectedHeatId] = useState("80m-heat-1");
  const [resultOrder, setResultOrder] = useState<"lane" | "rank">("rank");
  const [resultMode, setResultMode] = useState<ResultMode>("heats");
  const [inputDrafts, setInputDrafts] = useState<Record<string, string>>({});
  const [inputCodes, setInputCodes] = useState<Record<string, ResultStatus>>({});
  const [reviewing, setReviewing] = useState(false);
  const [syncState, setSyncState] = useState<"同期済み" | "DB同期済み" | "端末保存済み" | "同期中">("同期済み");
  const [adminMode, setAdminMode] = useState<AdminMode>("status");
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>("athletes");
  const [adminDrafts, setAdminDrafts] = useState<Record<string, string>>({});
  const [adminCodes, setAdminCodes] = useState<Record<string, ResultStatus>>({});
  const [adminReason, setAdminReason] = useState("");
  const [eventDrafts, setEventDrafts] = useState<Record<string, { name?: string; startTime?: string; discipline?: Discipline }>>({});
  const [athleteDrafts, setAthleteDrafts] = useState<Record<string, { name?: string; sex?: "男子" | "女子" }>>({});
  const [newAthleteBib, setNewAthleteBib] = useState("");
  const [newAthleteName, setNewAthleteName] = useState("");
  const [newAthleteSex, setNewAthleteSex] = useState<"男子" | "女子">("男子");
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string[]>>({});
  const [selfEventId, setSelfEventId] = useState("80m");
  const [selfHeatAssignments, setSelfHeatAssignments] = useState<Record<string, string>>({});
  const [selfReviewing, setSelfReviewing] = useState(false);
  const [newEntryHeatId, setNewEntryHeatId] = useState("");
  const [newEntryAthleteId, setNewEntryAthleteId] = useState("");
  const [newEntryLane, setNewEntryLane] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const cached = await idbGetState();
      if (active && cached) setState(cached);
      try {
        const response = await fetch("/api/state");
        const data = await response.json() as { state?: unknown; source?: string };
        if (active && isMeetingState(data.state)) {
          const normalized = withRequiredHeats(data.state);
          setState(normalized);
          await idbPut("cache", "state", normalized);
        }
        if (active && data.source === "google-sheets") setSyncState("DB同期済み");
      } catch {
        setSyncState("端末保存済み");
      }
    })();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => { active = false; };
  }, []);

  const selectedEvent = state.events.find((event) => event.id === selectedEventId) ?? state.events[0];
  const selectedHeats = state.heats.filter((heat) => heat.eventId === selectedEvent.id);
  const selectedHeat = selectedHeats.find((heat) => heat.id === selectedHeatId) ?? selectedHeats[0];
  const selfEvent = state.events.find((event) => event.id === selfEventId && event.id !== "relay")
    ?? state.events.find((event) => event.id !== "relay")
    ?? state.events[0];
  const selfHeats = state.heats
    .filter((heat) => heat.eventId === selfEvent.id)
    .sort((left, right) => left.number - right.number);
  const savedSelfHeatAssignments = heatAthleteAssignmentsForEvent(state, selfEvent.id);
  const currentSelfHeatInputs = Object.fromEntries(
    selfHeats.map((heat) => {
      const savedAthlete = state.athletes.find((athlete) => athlete.id === savedSelfHeatAssignments[heat.id]);
      return [heat.id, selfHeatAssignments[heat.id] ?? savedAthlete?.name ?? ""];
    }),
  );
  const heatEntries = state.entries.filter((entry) => entry.heatId === selectedHeat?.id);
  const eventEntries = state.entries.filter((entry) => entry.eventId === selectedEvent.id);
  const inputChangeCount = heatEntries.filter((entry) =>
    Boolean(inputCodes[entry.id] || inputDrafts[entry.id])).length;

  const transactions = useMemo(() => state.events
    .filter((event) => ["速報", "確定"].includes(event.status))
    .flatMap((event) => calculateEventScoreTransactions(
      event,
      rankResults(state.results, state.entries, state.athletes, event),
      state.teams,
      state.scoreRules[0],
    )), [state]);

  const standings = useMemo(
    () => calculateOverallStandings(state.teams, transactions),
    [state.teams, transactions],
  );
  const hasTeamScores = transactions.length > 0;
  const athleteScores = useMemo(() => state.events
    .filter((event) => ["速報", "確定"].includes(event.status))
    .flatMap((event) => calculateAthleteEventScores(
      event,
      rankResults(state.results, state.entries, state.athletes, event),
      state.scoreRules[0],
    )), [state]);

  const visibleSchedule = state.heats.filter((heat) => {
    const event = state.events.find((candidate) => candidate.id === heat.eventId)!;
    const kindMatches = kindFilter === "全て" || eventDiscipline(event) === kindFilter;
    const sexMatches = sexFilter === "全て" || event.category === sexFilter || event.category === "共通";
    return kindMatches && sexMatches;
  });

  const persist = async (next: MeetingState, action: string, detail: string) => {
    setState(next);
    setSyncState("同期中");
    await idbPut("cache", "state", next);
    try {
      const response = await fetch("/api/state", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: next, actor: "大会端末", action, detail }),
      });
      if (!response.ok) throw new Error("sync failed");
      const data = await response.json() as { source?: string };
      setSyncState(data.source === "google-sheets" ? "DB同期済み" : "同期済み");
    } catch {
      await idbPut("queue", undefined, { state: next, action, detail, createdAt: currentEpoch() });
      setSyncState("端末保存済み");
    }
  };

  const openEvent = (eventId: string, nextView: View = "results") => {
    const heat = state.heats.find((candidate) => candidate.eventId === eventId);
    setSelectedEventId(eventId);
    if (heat) {
      setSelectedHeatId(heat.id);
      setNewEntryHeatId(heat.id);
    }
    setNewEntryLane("");
    setResultMode("heats");
    setReviewing(false);
    setView(nextView);
    window.scrollTo(0, 0);
  };

  const updateDraft = (entryId: string, raw: string, target: "input" | "admin") => {
    const clean = sanitizeNumericInput(raw);
    if (target === "input") {
      setInputDrafts((current) => ({ ...current, [entryId]: clean }));
      setInputCodes((current) => {
        const next = { ...current };
        delete next[entryId];
        return next;
      });
    } else {
      setAdminDrafts((current) => ({ ...current, [entryId]: clean }));
      setAdminCodes((current) => ({ ...current, [entryId]: "OK" }));
    }
  };

  const saveProvisional = async () => {
    const nextResults = [...state.results];
    heatEntries.forEach((entry) => {
      const existingIndex = nextResults.findIndex((result) => result.entryId === entry.id);
      const code = inputCodes[entry.id];
      const raw = inputDrafts[entry.id];
      if (!code && !raw) return;
      const value = code ? null : normalizePerformance(raw, selectedEvent);
      const result: Result = {
        id: existingIndex >= 0 ? nextResults[existingIndex].id : `result-${entry.id}`,
        entryId: entry.id,
        value,
        displayValue: formatPerformance(value, selectedEvent),
        status: code ?? "OK",
        provisional: true,
        isPersonalBest: false,
      };
      if (existingIndex >= 0) nextResults[existingIndex] = result;
      else nextResults.push(result);
    });
    const now = new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const next: MeetingState = {
      ...state,
      results: nextResults,
      events: state.events.map((event) => event.id === selectedEvent.id ? { ...event, status: "速報" } : event),
      auditLogs: [{
        id: crypto.randomUUID(),
        at: now,
        actor: "記録係端末",
        action: "速報保存",
        entity: `${selectedEvent.name} ${selectedHeat.number}組`,
        before: "入力中",
        after: "速報",
        reason: "入力内容確認済み",
      }, ...state.auditLogs],
      updatedAt: now,
    };
    await persist(next, "速報保存", `${selectedEvent.name} ${selectedHeat.number}組`);
    setReviewing(false);
    setInputDrafts((current) => Object.fromEntries(
      Object.entries(current).filter(([entryId]) => !heatEntries.some((entry) => entry.id === entryId)),
    ));
    setInputCodes((current) => Object.fromEntries(
      Object.entries(current).filter(([entryId]) => !heatEntries.some((entry) => entry.id === entryId)),
    ) as Record<string, ResultStatus>);
    setMessage("速報を保存しました");
  };

  const changeEventStatus = async (eventId: string, status: EventStatus) => {
    const event = state.events.find((candidate) => candidate.id === eventId)!;
    const now = new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const next: MeetingState = {
      ...state,
      events: state.events.map((candidate) => candidate.id === eventId ? { ...candidate, status } : candidate),
      auditLogs: [{
        id: crypto.randomUUID(),
        at: now,
        actor: "大会管理者",
        action: "状態変更",
        entity: event.name,
        before: event.status,
        after: status,
        reason: "管理画面操作",
      }, ...state.auditLogs],
      updatedAt: now,
    };
    await persist(next, "状態変更", `${event.name}: ${event.status}→${status}`);
  };

  const saveEventDetails = async (eventId: string) => {
    const event = state.events.find((candidate) => candidate.id === eventId)!;
    const draft = eventDrafts[eventId] ?? {};
    const name = (draft.name ?? event.name).trim();
    const startTime = draft.startTime ?? event.startTime;
    const discipline = draft.discipline ?? eventDiscipline(event);
    if (!name) {
      setMessage("種目名を入力してください");
      return;
    }
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
      setMessage("開始時刻はHH:MM形式で入力してください");
      return;
    }
    if (name === event.name && startTime === event.startTime && discipline === eventDiscipline(event)) {
      setMessage("変更内容がありません");
      return;
    }
    const now = currentTime();
    const next: MeetingState = {
      ...state,
      events: state.events.map((candidate) =>
        candidate.id === eventId ? {
          ...candidate,
          name,
          startTime,
          discipline,
          kind: discipline === "トラック" ? "track" : "field",
          direction: discipline === "トラック" ? "asc" : "desc",
          unit: discipline === "トラック" ? "seconds" : "meters",
        } : candidate),
      heats: state.heats.map((heat) =>
        heat.eventId === eventId ? { ...heat, callCompleteAt: callCompleteAtFromStart(startTime) } : heat),
      auditLogs: [{
        id: crypto.randomUUID(),
        at: now,
        actor: "大会管理者",
        action: "競技情報変更",
        entity: event.name,
        before: `${event.name} ${event.startTime} ${eventDiscipline(event)}`,
        after: `${name} ${startTime} ${discipline}`,
        reason: "管理画面操作",
      }, ...state.auditLogs],
      updatedAt: now,
    };
    await persist(next, "競技情報変更", `${event.name} ${event.startTime}→${name} ${startTime} ${discipline}`);
    setEventDrafts((current) => {
      const updated = { ...current };
      delete updated[eventId];
      return updated;
    });
    setMessage(`${name}の種目種類・開始時刻を更新しました`);
  };

  const saveCorrections = async () => {
    if (!adminReason.trim()) return;
    const nextResults = [...state.results];
    const changes: string[] = [];
    eventEntries.forEach((entry) => {
      const raw = adminDrafts[entry.id];
      const code = adminCodes[entry.id];
      if (!raw && !code) return;
      const index = nextResults.findIndex((result) => result.entryId === entry.id);
      const before = index >= 0 ? nextResults[index] : undefined;
      const value = code && code !== "OK" ? null : normalizePerformance(raw || "", selectedEvent);
      const nextResult: Result = {
        id: before?.id ?? `result-${entry.id}`,
        entryId: entry.id,
        value,
        displayValue: formatPerformance(value, selectedEvent),
        status: code ?? "OK",
        provisional: true,
        isPersonalBest: false,
      };
      if (index >= 0) nextResults[index] = nextResult;
      else nextResults.push(nextResult);
      changes.push(`${entry.id}:${before?.displayValue || before?.status || "未入力"}→${nextResult.displayValue || nextResult.status}`);
    });
    if (!changes.length) return;
    const now = new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const next: MeetingState = {
      ...state,
      results: nextResults,
      events: state.events.map((event) => event.id === selectedEvent.id ? { ...event, status: "訂正中" } : event),
      auditLogs: [{
        id: crypto.randomUUID(),
        at: now,
        actor: "大会管理者",
        action: "記録訂正",
        entity: selectedEvent.name,
        before: changes.map((change) => change.split("→")[0]).join("、"),
        after: changes.map((change) => change.split("→")[1]).join("、"),
        reason: adminReason,
      }, ...state.auditLogs],
      updatedAt: now,
    };
    await persist(next, "記録訂正", `${selectedEvent.name}: ${adminReason}`);
    setAdminDrafts({});
    setAdminCodes({});
    setAdminReason("");
    setMessage("訂正を保存し、状態を「訂正中」にしました");
  };

  const downloadBulkTemplate = () => {
    const csv = createBulkCsvTemplate(state);
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "校内大会_選手エントリーテンプレート.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("現在の登録内容を入れたCSVテンプレートをダウンロードしました");
  };

  const importBulkCsv = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const imported = applyBulkCsv(state, String(reader.result));
        const now = currentTime();
        const eventsById = new Map(imported.state.events.map((item) => [item.id, item]));
        const next: MeetingState = {
          ...imported.state,
          heats: imported.state.heats.map((heat) => {
            const item = eventsById.get(heat.eventId)!;
            return { ...heat, callCompleteAt: callCompleteAtFromStart(item.startTime) };
          }),
          auditLogs: [{
            id: crypto.randomUUID(),
            at: now,
            actor: "大会管理者",
            action: "CSV一括取込",
            entity: `${imported.eventCount}種目`,
            before: "取込前",
            after: `${imported.rowCount}エントリー・選手${imported.athleteCount}名`,
            reason: file.name,
          }, ...imported.state.auditLogs],
          updatedAt: now,
        };
        await persist(next, "CSV一括取込", `${file.name}: ${imported.rowCount}件`);
        setMessage(`CSVを反映しました（${imported.eventCount}種目・${imported.rowCount}エントリー）`);
      } catch (error) {
        setMessage(error instanceof Error ? `CSV取込エラー: ${error.message}` : "CSVの取込に失敗しました");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  const downloadAthleteTemplate = () => {
    const blob = new Blob(["\uFEFF", createAthleteCsvTemplate(state)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "校内大会_競技者登録テンプレート.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("競技者登録CSVテンプレートをダウンロードしました");
  };

  const importAthleteCsv = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const imported = applyAthleteCsv(state, String(reader.result));
        const now = currentTime();
        const next: MeetingState = {
          ...imported.state,
          auditLogs: [{
            id: crypto.randomUUID(),
            at: now,
            actor: "大会管理者",
            action: "競技者CSV取込",
            entity: `${imported.athleteCount}名`,
            before: `${state.athletes.length}名`,
            after: `${imported.athleteCount}名`,
            reason: file.name,
          }, ...imported.state.auditLogs],
          updatedAt: now,
        };
        await persist(next, "競技者CSV取込", `${file.name}: ${imported.athleteCount}名`);
        setAssignmentDrafts({});
        setMessage(`競技者CSVを反映しました（${imported.athleteCount}名）`);
      } catch (error) {
        setMessage(error instanceof Error ? `CSV取込エラー: ${error.message}` : "CSVの取込に失敗しました");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  const saveAthleteDetails = async (athleteId: string) => {
    const athlete = state.athletes.find((candidate) => candidate.id === athleteId)!;
    const draft = athleteDrafts[athleteId] ?? {};
    const name = (draft.name ?? athlete.name).trim();
    const sex = draft.sex ?? athlete.sex;
    if (!name) {
      setMessage("競技者氏名を入力してください");
      return;
    }
    if (name === athlete.name && sex === athlete.sex) {
      setMessage("変更内容がありません");
      return;
    }
    const now = currentTime();
    const next: MeetingState = {
      ...state,
      athletes: state.athletes.map((candidate) =>
        candidate.id === athleteId ? { ...candidate, name, sex } : candidate),
      auditLogs: [{
        id: crypto.randomUUID(),
        at: now,
        actor: "大会管理者",
        action: "競技者情報変更",
        entity: `No.${athlete.bib}`,
        before: `${athlete.name} ${athlete.sex}`,
        after: `${name} ${sex}`,
        reason: "エントリ登録画面",
      }, ...state.auditLogs],
      updatedAt: now,
    };
    await persist(next, "競技者情報変更", `No.${athlete.bib}: ${athlete.name}→${name}`);
    setAthleteDrafts((current) => {
      const updated = { ...current };
      delete updated[athleteId];
      return updated;
    });
    setMessage(`No.${athlete.bib} ${name}を更新しました`);
  };

  const addAthlete = async () => {
    const bib = Number(newAthleteBib || Math.max(100, ...state.athletes.map((athlete) => athlete.bib)) + 1);
    const name = newAthleteName.trim();
    if (!Number.isInteger(bib) || bib < 1 || !name) {
      setMessage("選手Noと氏名を正しく入力してください");
      return;
    }
    if (state.athletes.some((athlete) => athlete.bib === bib)) {
      setMessage(`選手No ${bib} は登録済みです`);
      return;
    }
    const now = currentTime();
    const athlete = {
      id: `athlete-${crypto.randomUUID()}`,
      bib,
      name,
      kana: name,
      grade: 1,
      sex: newAthleteSex,
      teamId: state.teams[0]?.id ?? "A",
      affiliation: "校内",
      region: "校内",
      abilityBand: "C" as const,
      personalBests: {},
    };
    const next: MeetingState = {
      ...state,
      athletes: [...state.athletes, athlete].sort((left, right) => left.bib - right.bib),
      auditLogs: [{
        id: crypto.randomUUID(),
        at: now,
        actor: "大会管理者",
        action: "競技者追加",
        entity: `No.${bib}`,
        before: "未登録",
        after: `${name} ${newAthleteSex}`,
        reason: "エントリ登録画面",
      }, ...state.auditLogs],
      updatedAt: now,
    };
    await persist(next, "競技者追加", `No.${bib} ${name}`);
    setNewAthleteBib("");
    setNewAthleteName("");
    setMessage(`${name}を競技者登録しました`);
  };

  const assignmentFor = (athleteId: string) =>
    assignmentDrafts[athleteId] ?? eventIdsForAthlete(state, athleteId);

  const updateAssignment = (athleteId: string, slot: number, eventId: string) => {
    const current = [...assignmentFor(athleteId)];
    while (current.length < 3) current.push("");
    current[slot] = eventId;
    setAssignmentDrafts((drafts) => ({ ...drafts, [athleteId]: current }));
  };

  const saveAssignments = async () => {
    const assignments = assignmentDrafts;
    const changedAthleteCount = Object.keys(assignments).length;
    if (!changedAthleteCount) {
      setMessage("変更した選手種目がありません");
      return;
    }
    try {
      const assigned = applyAthleteEventAssignments(state, assignments);
      const now = currentTime();
      const next: MeetingState = {
        ...assigned,
        auditLogs: [{
          id: crypto.randomUUID(),
          at: now,
          actor: "大会管理者",
          action: "選手種目登録",
          entity: `${changedAthleteCount}名`,
          before: `${state.entries.length}エントリー`,
          after: `${assigned.entries.length}エントリー`,
          reason: "表形式一括保存",
        }, ...state.auditLogs],
        updatedAt: now,
      };
      await persist(next, "選手種目登録", `${changedAthleteCount}名変更・${assigned.entries.length}エントリー`);
      setAssignmentDrafts({});
      setMessage(`選手種目登録を保存しました（${assigned.entries.length}エントリー）`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "選手種目登録の保存に失敗しました");
    }
  };

  const chooseSelfEvent = (eventId: string) => {
    setSelfEventId(eventId);
    setSelfHeatAssignments({});
    setSelfReviewing(false);
  };

  const updateSelfHeatAssignment = (heatId: string, athleteName: string) => {
    setSelfHeatAssignments((current) => ({ ...current, [heatId]: athleteName }));
    setSelfReviewing(false);
  };

  const findAthleteBySelfInput = (sourceState: MeetingState, value: string) => {
    const trimmed = value.trim();
    const bibMatch = trimmed.match(/^(?:No\.?|Ｎｏ\.?)?\s*(\d+)(?:\s|　|$)/i);
    if (bibMatch) {
      const athlete = sourceState.athletes.find((candidate) => candidate.bib === Number(bibMatch[1]));
      if (athlete) return athlete;
    }
    const normalized = normalizeAthleteInput(trimmed);
    return sourceState.athletes.find((athlete) =>
      normalizeAthleteInput(athlete.name) === normalized
      || normalizeAthleteInput(athlete.kana) === normalized);
  };

  const resolveSelfHeatAssignments = (sourceState: MeetingState, eventId: string) => {
    const sourceHeats = sourceState.heats
      .filter((heat) => heat.eventId === eventId)
      .sort((left, right) => left.number - right.number);
    const sourceSaved = heatAthleteAssignmentsForEvent(sourceState, eventId);
    const assignments: Record<string, string> = {};
    for (const heat of sourceHeats) {
      const savedAthlete = sourceState.athletes.find((athlete) => athlete.id === sourceSaved[heat.id]);
      const input = selfHeatAssignments[heat.id] ?? savedAthlete?.name ?? "";
      if (!input.trim()) {
        assignments[heat.id] = "";
        continue;
      }
      const athlete = findAthleteBySelfInput(sourceState, input);
      if (!athlete) throw new Error(`${heat.number}組: ${input} は選手登録にありません`);
      assignments[heat.id] = athlete.id;
    }
    return assignments;
  };

  const reviewSelfEntry = () => {
    try {
      const selected = Object.values(resolveSelfHeatAssignments(state, selfEvent.id)).filter(Boolean);
      if (selected.length === 0) {
        setMessage("登録する選手を1名以上入力してください");
        return;
      }
      if (new Set(selected).size !== selected.length) {
        setMessage("同じ選手を複数の組へ登録できません");
        return;
      }
      setSelfReviewing(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "種目登録の確認に失敗しました");
    }
  };

  const saveSelfEntry = async () => {
    let latestState = state;
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      const data = await response.json() as { state?: unknown };
      if (isMeetingState(data.state)) latestState = withRequiredHeats(data.state);
    } catch {
      // 通信断時は端末上の最新状態を使い、persist側のオフラインキューへ渡す。
    }
    const event = latestState.events.find((candidate) => candidate.id === selfEvent.id);
    if (!event) return;
    try {
      const latestHeats = latestState.heats
        .filter((heat) => heat.eventId === event.id)
        .sort((left, right) => left.number - right.number);
      const latestSavedAssignments = heatAthleteAssignmentsForEvent(latestState, event.id);
      const assignments = resolveSelfHeatAssignments(latestState, event.id);
      const assigned = applyEventHeatAthleteAssignments(latestState, event.id, assignments);
      const now = currentTime();
      const beforeNames = latestHeats
        .map((heat) => {
          const athleteId = latestSavedAssignments[heat.id];
          const athlete = latestState.athletes.find((candidate) => candidate.id === athleteId);
          return athlete ? `${heat.number}組:${athlete.name}` : "";
        })
        .filter(Boolean)
        .join("、") || "未登録";
      const selectedNames = latestHeats
        .map((heat) => {
          const athleteId = assignments[heat.id];
          const athlete = latestState.athletes.find((candidate) => candidate.id === athleteId);
          return athlete ? `${heat.number}組:${athlete.name}` : "";
        })
        .filter(Boolean)
        .join("、");
      const next: MeetingState = {
        ...assigned,
        auditLogs: [{
          id: crypto.randomUUID(),
          at: now,
          actor: "生徒登録端末",
          action: "当日種目登録",
          entity: event.name,
          before: beforeNames,
          after: selectedNames,
          reason: "種目別の組登録",
        }, ...latestState.auditLogs],
        updatedAt: now,
      };
      await persist(next, "当日種目登録", `${event.name}: ${selectedNames}`);
      setSelfHeatAssignments({});
      setSelfReviewing(false);
      setMessage(`${event.name}の組登録を保存しました`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "種目登録の保存に失敗しました");
    }
  };

  const changeEntryAthlete = async (entryId: string, athleteId: string) => {
    const entry = state.entries.find((candidate) => candidate.id === entryId)!;
    if (entry.athleteId === athleteId) return;
    const before = state.athletes.find((athlete) => athlete.id === entry.athleteId)!;
    const after = state.athletes.find((athlete) => athlete.id === athleteId)!;
    if (state.entries.some((candidate) =>
      candidate.eventId === entry.eventId && candidate.athleteId === athleteId && candidate.id !== entryId)) {
      setMessage(`${after.name}はすでにこの種目へ登録されています`);
      return;
    }
    const now = currentTime();
    const next: MeetingState = {
      ...state,
      entries: state.entries.map((candidate) =>
        candidate.id === entryId ? { ...candidate, athleteId } : candidate),
      results: state.results.filter((result) => result.entryId !== entryId),
      auditLogs: [{
        id: crypto.randomUUID(),
        at: now,
        actor: "大会管理者",
        action: "出場者変更",
        entity: selectedEvent.name,
        before: before.name,
        after: after.name,
        reason: "個別変更",
      }, ...state.auditLogs],
      updatedAt: now,
    };
    await persist(next, "出場者変更", `${selectedEvent.name}: ${before.name}→${after.name}`);
    setMessage(`${before.name}を${after.name}へ変更しました。旧選手の記録は削除しました`);
  };

  const removeEntry = async (entryId: string) => {
    const entry = state.entries.find((candidate) => candidate.id === entryId)!;
    const athlete = state.athletes.find((candidate) => candidate.id === entry.athleteId)!;
    if (!window.confirm(`${athlete.name}を${selectedEvent.name}から削除しますか？`)) return;
    const now = currentTime();
    const next: MeetingState = {
      ...state,
      entries: state.entries.filter((candidate) => candidate.id !== entryId),
      results: state.results.filter((result) => result.entryId !== entryId),
      auditLogs: [{
        id: crypto.randomUUID(),
        at: now,
        actor: "大会管理者",
        action: "出場者削除",
        entity: selectedEvent.name,
        before: athlete.name,
        after: "削除",
        reason: "個別変更",
      }, ...state.auditLogs],
      updatedAt: now,
    };
    await persist(next, "出場者削除", `${selectedEvent.name}: ${athlete.name}`);
    setMessage(`${athlete.name}を${selectedEvent.name}から削除しました`);
  };

  const addEntry = async () => {
    const heatId = newEntryHeatId || selectedHeats[0]?.id;
    const athleteId = newEntryAthleteId || state.athletes[0]?.id;
    const heat = state.heats.find((candidate) => candidate.id === heatId);
    const athlete = state.athletes.find((candidate) => candidate.id === athleteId);
    if (!heat || !athlete) {
      setMessage("組と選手を選択してください");
      return;
    }
    const suggestedLane = Math.max(
      0,
      ...state.entries.filter((entry) => entry.heatId === heat.id).map((entry) => entry.laneOrOrder),
    ) + 1;
    const laneOrOrder = Number(newEntryLane || suggestedLane);
    if (!Number.isInteger(laneOrOrder) || laneOrOrder < 1) {
      setMessage("レーン・試順は1以上の整数で入力してください");
      return;
    }
    if (state.entries.some((entry) =>
      entry.eventId === selectedEvent.id && entry.athleteId === athlete.id)) {
      setMessage(`${athlete.name}はすでにこの種目へ登録されています`);
      return;
    }
    if (state.entries.some((entry) => entry.heatId === heat.id && entry.laneOrOrder === laneOrOrder)) {
      setMessage(`${heat.number}組のレーン・試順${laneOrOrder}は使用済みです`);
      return;
    }
    const now = currentTime();
    const entry: Entry = {
      id: `entry-${crypto.randomUUID()}`,
      eventId: selectedEvent.id,
      heatId: heat.id,
      athleteId: athlete.id,
      laneOrOrder,
      scoringEligible: true,
    };
    const next: MeetingState = {
      ...state,
      entries: [...state.entries, entry],
      auditLogs: [{
        id: crypto.randomUUID(),
        at: now,
        actor: "大会管理者",
        action: "出場者追加",
        entity: selectedEvent.name,
        before: "未登録",
        after: `${athlete.name} ${heat.number}組 ${laneOrOrder}`,
        reason: "個別変更",
      }, ...state.auditLogs],
      updatedAt: now,
    };
    await persist(next, "出場者追加", `${selectedEvent.name}: ${athlete.name}`);
    setNewEntryLane("");
    setMessage(`${athlete.name}を${selectedEvent.name}へ追加しました`);
  };

  const headerTitle = view === "schedule"
    ? "競技一覧－開始時刻別"
    : view === "results"
      ? "結果一覧（2026/08/03）"
      : view === "team"
        ? "総合順位（2026/08/03）"
        : view === "input"
          ? "記録入力（2026/08/03）"
          : view === "selfEntry"
            ? "当日 種目登録（2026/08/03）"
            : view === "registration"
              ? "エントリ登録（2026/08/03）"
              : "大会管理（2026/08/03）";

  const renderResultRow = (item: RankedResult, event: Event, showRank = false) => {
    const team = state.teams.find((candidate) => candidate.id === item.athlete.teamId)!;
    const invalid = item.result.status !== "OK";
    return (
      <tr key={item.entry.id} className={invalid ? "dns" : ""}>
        <td>{showRank ? item.rank ?? "-" : item.entry.laneOrOrder}</td>
        <td>{item.athlete.bib}</td>
        <td className="athlete">
          <div className="kana">{item.athlete.kana}</div>
          {item.athlete.name}（{item.athlete.grade}）
        </td>
        <td className="affiliation">{team.name}<br />{item.athlete.region}</td>
        <td className="scorecol">
          {displayResult(item, event)}
        </td>
      </tr>
    );
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>{headerTitle}</h1>
        {view === "schedule" ? (
          <div className="top-actions">
            <button className="goldbtn" onClick={() => setKindFilter("全て")}>競技別表示</button>
            <button className="goldbtn" onClick={() => setView("team")}>所属別表示</button>
          </div>
        ) : (
          <button className="topbtn" onClick={() => { setView("schedule"); window.scrollTo(0, 0); }}>
            <span className="homeicon">⌂</span> TOP
          </button>
        )}
      </header>

      {view === "schedule" && (
        <section>
          <div className="meet">
            校内陸上競技大会　兼　3年生引退試合　2026/08/03
            <br />
            <div className="powered">Powered By Tomida High School</div>
          </div>
          <div className="controls">
            <div className="row">
              <select className="select" aria-label="開催日"><option>2026/08/03</option></select>
              <div className="seg discipline-seg">
                {DISCIPLINE_FILTERS.map(({ label, value }) => (
                  <button key={value} className={kindFilter === value ? "active" : ""} onClick={() => setKindFilter(value)}>{label}</button>
                ))}
              </div>
            </div>
            <div className="row center">
              <div className="seg">
                {["全て", "男子", "女子"].map((value) => (
                  <button key={value} className={sexFilter === value ? "active" : ""} onClick={() => setSexFilter(value)}>{value}</button>
                ))}
              </div>
            </div>
            <div className="overall-summary">
              <div className="summary-heading">総合順位 <span>{hasTeamScores ? "速報・確定済み種目から自動計算" : "結果入力後に自動計算"}</span></div>
              <table className="grid summary-grid">
                <thead><tr><th>順位</th><th>チーム</th><th>得点</th></tr></thead>
                <tbody>{standings.map((team) => (
                  <tr key={team.id} className={hasTeamScores && team.rank === 1 ? "leader-row" : ""}>
                    <td>{hasTeamScores ? `${team.rank}位` : "-"}</td>
                    <td className="event">{team.name}{hasTeamScores && team.rank === 1 && <span className="leader-label"> 暫定1位</span>}</td>
                    <td className="scorecol">{team.points}</td>
                  </tr>
                ))}</tbody>
              </table>
              <div className="summary-link"><a href="#" onClick={(event) => { event.preventDefault(); setView("team"); window.scrollTo(0, 0); }}>選手別・種目別の得点を見る</a></div>
            </div>
          </div>
          <div className="tablewrap schedule-wrap">
            <table className="grid schedule-grid">
              <thead>
                <tr><th>開始時刻</th><th>競技名</th><th>ﾗｳﾝﾄﾞ</th><th>組</th><th>氏名</th></tr>
              </thead>
              <tbody>
                {visibleSchedule.length === 0 && <tr><td colSpan={5} className="empty">該当する競技はありません</td></tr>}
                {visibleSchedule.map((heat) => {
                  const event = state.events.find((candidate) => candidate.id === heat.eventId)!;
                  const heatAthleteNames = state.entries
                    .filter((entry) => entry.heatId === heat.id)
                    .sort((left, right) => left.laneOrOrder - right.laneOrOrder)
                    .map((entry) => state.athletes.find((athlete) => athlete.id === entry.athleteId)?.name)
                    .filter(Boolean)
                    .join("、");
                  return (
                    <tr key={heat.id}>
                      <td>{event.startTime}</td>
                      <td className="event">{fullEventName(event)}</td>
                      <td><a href="#" onClick={(mouseEvent) => { mouseEvent.preventDefault(); openEvent(event.id); }}>{event.round}</a></td>
                      <td><a href="#" onClick={(mouseEvent) => { mouseEvent.preventDefault(); openEvent(event.id); }}>{heat.number}</a></td>
                      <td className="event">{heatAthleteNames || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="staff-links">
            <button type="button" className="link-button student-entry-link" onClick={() => { setView("selfEntry"); window.scrollTo(0, 0); }}>当日 種目登録</button>
            <button type="button" className="link-button" onClick={() => openEvent("80m", "input")}>記録入力</button>
            <button type="button" className="link-button" onClick={() => { setView("registration"); window.scrollTo(0, 0); }}>エントリ登録</button>
            <button type="button" className="link-button" onClick={() => setView("admin")}>大会管理</button>
          </div>
        </section>
      )}

      {view === "results" && (
        <section>
          <div className="result-head">
            <div className="event-title">{fullEventName(selectedEvent)}　{selectedEvent.round}</div>
            <div className="subseg">
              <button className={resultOrder === "lane" ? "active" : ""} onClick={() => setResultOrder("lane")}>レーン</button>
              <button className={resultOrder === "rank" ? "active" : ""} onClick={() => setResultOrder("rank")}>順位</button>
            </div>
            <div className="history">
              <button>歴代記録</button>
              <a href="#" onClick={(event) => { event.preventDefault(); setResultMode(resultMode === "overall" ? "heats" : "overall"); }}>
                {resultMode === "overall" ? "組別結果へ戻る" : "集計結果（集計済）"}
              </a>
            </div>
          </div>

          {resultMode === "heats" && selectedHeats.map((heat) => {
            const entries = state.entries.filter((entry) => entry.heatId === heat.id);
            const rows = getEntryRows(state, selectedEvent, entries, resultOrder);
            return (
              <div key={heat.id} className="heat-block">
                <div className="heat-title">{heat.number}組 {selectedEvent.status} 招集完了時刻 {heat.callCompleteAt}</div>
                <div className="tablewrap">
                  <table className="grid result-grid">
                    <thead><tr><th>レーン</th><th>No</th><th>競技者名</th><th>所属<br />所属地</th><th>記録</th></tr></thead>
                    <tbody>
                      {rows.length === 0
                        ? <tr><td colSpan={5} className="empty">結果はまだありません</td></tr>
                        : rows.map((item) => renderResultRow(item, selectedEvent))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {resultMode === "overall" && (
            <div className="heat-block">
              <div className="heat-title">全体順位 {selectedEvent.status}</div>
              <div className="tablewrap">
                <table className="grid result-grid">
                  <thead><tr><th>順位</th><th>No</th><th>競技者名</th><th>所属<br />所属地</th><th>記録</th></tr></thead>
                  <tbody>{rankResults(state.results, eventEntries, state.athletes, selectedEvent).map((item) => renderResultRow(item, selectedEvent, true))}</tbody>
                </table>
              </div>
            </div>
          )}

          <div className="note">DNF:途中棄権、DNS:欠場、DQ:失格、NM:記録なし</div>
        </section>
      )}

      {view === "team" && (
        <section>
          <div className="result-head">
            <div className="event-title">総合順位　<span className="provisional-text">{hasTeamScores ? "暫定" : "集計前"}</span></div>
            <div className="history"><a href="#" onClick={(event) => event.preventDefault()}>得点内訳（自動計算）</a></div>
          </div>
          <div className="heat-title">総合順位　最終更新 {state.updatedAt}</div>
          <div className="tablewrap">
            <table className="grid team-grid">
              <thead><tr><th>順位</th><th>チーム</th><th>得点</th></tr></thead>
              <tbody>{standings.map((team) => <tr key={team.id} className={hasTeamScores && team.rank === 1 ? "leader-row" : ""}><td>{hasTeamScores ? team.rank : "-"}</td><td className="event">{team.name}</td><td className="scorecol">{team.points}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="heat-title">選手別・種目別得点</div>
          <div className="tablewrap">
            <table className="grid athlete-score-grid">
              <thead><tr><th>競技</th><th>選手</th><th>チーム</th><th>個人順位</th><th>得点</th></tr></thead>
              <tbody>
                {athleteScores.length === 0 && <tr><td colSpan={5} className="empty">速報・確定済みの得点はまだありません</td></tr>}
                {athleteScores.map((score) => {
                  const event = state.events.find((candidate) => candidate.id === score.eventId)!;
                  const team = state.teams.find((candidate) => candidate.id === score.teamId)!;
                  return <tr key={score.entryId} className={score.rank === null ? "dns" : ""}>
                    <td className="event">{event.name}</td>
                    <td className="event">{score.athleteName}</td>
                    <td>{team.shortName}</td>
                    <td>{score.rank === null ? score.status : `${score.rank}位`}</td>
                    <td className="scorecol">{score.totalPoints}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          <div className="heat-title">得点計算明細</div>
          <div className="tablewrap">
            <table className="grid transaction-grid">
              <thead><tr><th>競技</th><th>所属</th><th>内容</th><th>得点</th></tr></thead>
              <tbody>{transactions.map((transaction) => {
                const event = state.events.find((candidate) => candidate.id === transaction.eventId)!;
                const team = state.teams.find((candidate) => candidate.id === transaction.teamId)!;
                return <tr key={transaction.id}><td>{event.name}</td><td>{team.name}</td><td>{transaction.note}</td><td>{transaction.points}</td></tr>;
              })}</tbody>
            </table>
          </div>
        </section>
      )}

      {view === "input" && (
        <section>
          <div className="result-head">
            <div className="event-title">スマートフォン記録入力　<span className="sync-label">{syncState}</span></div>
            <div className="storage-note">
              {syncState === "DB同期済み"
                ? "Googleスプレッドシートへ永続保存し、複数端末で共有しています。"
                : "入力確認と端末保存は利用できます。DB未接続時は複数端末で共有されません。"}
            </div>
            <div className="input-selects">
              <select className="select" aria-label="入力種目" value={selectedEvent.id} onChange={(event) => openEvent(event.target.value, "input")}>
                {state.events.map((event) => <option key={event.id} value={event.id}>{fullEventName(event)}</option>)}
              </select>
              <select className="select" aria-label="入力組" value={selectedHeat.id} onChange={(event) => { setSelectedHeatId(event.target.value); setReviewing(false); }}>
                {selectedHeats.map((heat) => <option key={heat.id} value={heat.id}>{heat.number}組</option>)}
              </select>
            </div>
          </div>
          <div className="heat-title">{selectedEvent.name} {selectedHeat.number}組　レーン・試順</div>
          <div className="tablewrap">
            <table className="grid input-grid">
              <thead><tr><th>ﾚｰﾝ</th><th>No</th><th>競技者名</th><th>記録</th><th>状態</th></tr></thead>
              <tbody>{heatEntries.sort((a, b) => a.laneOrOrder - b.laneOrOrder).map((entry) => {
                const athlete = state.athletes.find((candidate) => candidate.id === entry.athleteId)!;
                const existing = getResult(state, entry.id);
                return (
                  <tr key={entry.id} className={inputCodes[entry.id] ? "dns" : ""}>
                    <td>{entry.laneOrOrder}</td><td>{athlete.bib}</td>
                    <td className="athlete"><div className="kana">{athlete.kana}</div>{athlete.name}（{athlete.grade}）</td>
                    <td>
                      <input
                        className="record-field"
                        aria-label={`${athlete.name}の記録`}
                        inputMode="decimal"
                        pattern="[0-9.:]*"
                        disabled={Boolean(inputCodes[entry.id])}
                        value={inputDrafts[entry.id] ?? ""}
                        placeholder={existing?.status === "OK" ? formatPerformance(existing.value, selectedEvent) : ""}
                        onChange={(event) => updateDraft(entry.id, event.target.value, "input")}
                      />
                      <span className="unit">{selectedEvent.unit === "meters" ? "m" : "秒"}</span>
                    </td>
                    <td>
                      <div className="code-row">
                        {RESULT_CODES.map((code) => <button
                          key={code}
                          className={inputCodes[entry.id] === code ? "selected" : ""}
                          aria-pressed={inputCodes[entry.id] === code}
                          onClick={() => setInputCodes((current) => {
                            const next = { ...current };
                            if (next[entry.id] === code) delete next[entry.id];
                            else next[entry.id] = code;
                            return next;
                          })}
                        >{code}</button>)}
                      </div>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <div className="input-summary">今回の入力：{inputChangeCount}件 ／ 未変更：{heatEntries.length - inputChangeCount}件</div>
          <div className="input-actions">
            <button className="darkbtn" onClick={() => {
              if (!inputChangeCount) {
                setMessage("記録またはDNS・DNF・DQ・NMを1件以上入力してください");
                return;
              }
              setReviewing(true);
            }}>入力内容を確認</button>
          </div>
          {reviewing && (
            <div className="review-section">
              <div className="heat-title">入力内容確認　{selectedHeat.number}組</div>
              <div className="tablewrap">
                <table className="grid review-grid">
                  <thead><tr><th>ﾚｰﾝ</th><th>競技者名</th><th>保存内容</th></tr></thead>
                  <tbody>{heatEntries.map((entry) => {
                    const athlete = state.athletes.find((candidate) => candidate.id === entry.athleteId)!;
                    const existing = getResult(state, entry.id);
                    const value = inputCodes[entry.id]
                      || formatPerformance(normalizePerformance(inputDrafts[entry.id] || "", selectedEvent), selectedEvent)
                      || (existing?.status === "OK" ? formatPerformance(existing.value, selectedEvent) : existing?.status)
                      || "未入力";
                    const changed = Boolean(inputCodes[entry.id] || inputDrafts[entry.id]);
                    return <tr key={entry.id}><td>{entry.laneOrOrder}</td><td>{athlete.name}</td><td>{value}<span className="review-source">{changed ? "今回入力" : "保存済み"}</span></td></tr>;
                  })}</tbody>
                </table>
              </div>
              <div className="input-actions"><button className="mutedbtn" onClick={() => setReviewing(false)}>入力へ戻る</button><button className="darkbtn" onClick={saveProvisional}>速報保存</button></div>
            </div>
          )}
        </section>
      )}

      {view === "selfEntry" && (
        <section>
          <div className="result-head">
            <div className="event-title">生徒用　当日種目登録　<span className="sync-label">{syncState}</span></div>
            <div className="storage-note">競技を選び、1組・2組・3組などの登録枠へ出場する選手の氏名または選手Noを入力してください。全員リレーは選択不要です。</div>
          </div>
          <div className="self-entry-form">
            <div className="self-step">
              <label htmlFor="self-event">1．競技</label>
              <select
                id="self-event"
                className="select"
                value={selfEvent.id}
                onChange={(event) => chooseSelfEvent(event.target.value)}
              >
                {state.events.filter((event) => event.id !== "relay").map((event) => (
                  <option key={event.id} value={event.id}>{event.startTime}　{fullEventName(event)}</option>
                ))}
              </select>
            </div>
          </div>
          <datalist id="self-athlete-list">
            {state.athletes.map((athlete) => (
              <option key={athlete.id} value={athlete.name}>No.{athlete.bib} {state.teams.find((team) => team.id === athlete.teamId)?.shortName}</option>
            ))}
          </datalist>
          <div className="tablewrap">
            <table className="grid self-entry-grid">
              <thead><tr><th>登録枠</th><th>氏名</th><th>チーム</th></tr></thead>
              <tbody>{selfHeats.map((heat) => {
                const input = currentSelfHeatInputs[heat.id] ?? "";
                const athlete = findAthleteBySelfInput(state, input);
                const team = athlete ? state.teams.find((candidate) => candidate.id === athlete.teamId) : undefined;
                return (
                  <tr key={heat.id}>
                    <td>{heat.number}組</td>
                    <td>
                      <input
                        className="admin-text-field self-name-field"
                        list="self-athlete-list"
                        placeholder="氏名またはNo."
                        aria-label={`${selfEvent.name}${heat.number}組の氏名`}
                        value={input}
                        onChange={(change) => updateSelfHeatAssignment(heat.id, change.target.value)}
                      />
                    </td>
                    <td>{team?.shortName ?? "－"}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <div className="input-actions">
            <button className="darkbtn" onClick={reviewSelfEntry}>入力内容を確認</button>
          </div>
          {selfReviewing && (
            <div className="review-section self-review">
              <div className="heat-title">登録内容の確認</div>
              <div className="tablewrap">
                <table className="grid review-grid">
                  <thead><tr><th>競技</th><th>登録枠</th><th>氏名</th></tr></thead>
                  <tbody>{selfHeats.map((heat) => {
                    const athlete = findAthleteBySelfInput(state, currentSelfHeatInputs[heat.id] ?? "");
                    return athlete ? (
                      <tr key={heat.id}>
                        <td className="event">{selfEvent.name}</td>
                        <td>{heat.number}組</td>
                        <td className="event">{athlete.name}</td>
                      </tr>
                    ) : null;
                  })}</tbody>
                </table>
              </div>
              <div className="input-actions">
                <button className="mutedbtn" onClick={() => setSelfReviewing(false)}>戻って修正</button>
                <button className="darkbtn" onClick={saveSelfEntry}>この内容で登録</button>
              </div>
            </div>
          )}
        </section>
      )}

      {view === "registration" && (
        <section>
          <div className="result-head">
            <div className="event-title">エントリ登録</div>
            <div className="subseg registration-seg">
              {([
                ["athletes", "競技者登録"],
                ["events", "種目設定"],
                ["assignments", "選手種目登録"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  className={registrationMode === key ? "active" : ""}
                  onClick={() => setRegistrationMode(key)}
                >{label}</button>
              ))}
            </div>
          </div>

          {registrationMode === "athletes" && <>
            <div className="csv-workflow">
              <div className="workflow-title">競技者CSV一括取り込み</div>
              <ol>
                <li>現在の競技者入りテンプレートをダウンロード</li>
                <li>氏名・性別などを編集してCSV形式で保存</li>
                <li>編集済みCSVを取り込み、サイトへ反映</li>
              </ol>
              <div className="admin-tools csv-actions">
                <button className="goldbtn" onClick={downloadAthleteTemplate}>1. テンプレートをDL</button>
                <label className="darkbtn filebtn">3. 編集済みCSVを取り込む
                  <input type="file" accept=".csv,text/csv" onChange={importAthleteCsv} />
                </label>
              </div>
              <p>必須列は選手No・氏名・性別・学年・チームIDです。実力帯列は旧データ互換用で、空欄でも取り込めます。</p>
            </div>
            <div className="athlete-add">
              <div className="workflow-title">競技者を個別追加</div>
              <label>選手No
                <input className="admin-text-field" inputMode="numeric" pattern="[0-9]*" placeholder="自動" value={newAthleteBib} onChange={(event) => setNewAthleteBib(event.target.value.replace(/\D/g, ""))} />
              </label>
              <label>氏名
                <input className="admin-text-field" value={newAthleteName} onChange={(event) => setNewAthleteName(event.target.value)} />
              </label>
              <label>性別
                <select className="compact-select" value={newAthleteSex} onChange={(event) => setNewAthleteSex(event.target.value as "男子" | "女子")}>
                  <option>男子</option><option>女子</option>
                </select>
              </label>
              <button className="darkbtn" onClick={addAthlete}>競技者を追加</button>
            </div>
            <div className="admin-note">競技者の氏名・性別は行ごとに変更できます。</div>
            <div className="tablewrap">
              <table className="grid athlete-registration-grid">
                <thead><tr><th>No</th><th>競技者氏名</th><th>性別</th><th>保存</th></tr></thead>
                <tbody>{state.athletes.map((athlete) => (
                  <tr key={athlete.id}>
                    <td>{athlete.bib}</td>
                    <td><input className="admin-text-field" value={athleteDrafts[athlete.id]?.name ?? athlete.name} onChange={(event) => setAthleteDrafts((current) => ({ ...current, [athlete.id]: { ...current[athlete.id], name: event.target.value } }))} /></td>
                    <td><select className="compact-select" value={athleteDrafts[athlete.id]?.sex ?? athlete.sex} onChange={(event) => setAthleteDrafts((current) => ({ ...current, [athlete.id]: { ...current[athlete.id], sex: event.target.value as "男子" | "女子" } }))}><option>男子</option><option>女子</option></select></td>
                    <td><button className="row-save-button" onClick={() => saveAthleteDetails(athlete.id)}>保存</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>}

          {registrationMode === "events" && <>
            <div className="admin-note">大会で行う種目の名称・種類・開始時刻をサイト上で変更し、行ごとに保存できます。</div>
            <div className="tablewrap">
              <table className="grid event-registration-grid">
                <thead><tr><th>開始時刻</th><th>種目名</th><th>種類</th><th>保存</th></tr></thead>
                <tbody>{state.events.map((event) => (
                  <tr key={event.id}>
                    <td><input className="admin-text-field time-field" type="time" value={eventDrafts[event.id]?.startTime ?? event.startTime} onChange={(change) => setEventDrafts((current) => ({ ...current, [event.id]: { ...current[event.id], startTime: change.target.value } }))} /></td>
                    <td><input className="admin-text-field" value={eventDrafts[event.id]?.name ?? event.name} onChange={(change) => setEventDrafts((current) => ({ ...current, [event.id]: { ...current[event.id], name: change.target.value } }))} /></td>
                    <td><select className="compact-select" value={eventDrafts[event.id]?.discipline ?? eventDiscipline(event)} onChange={(change) => setEventDrafts((current) => ({ ...current, [event.id]: { ...current[event.id], discipline: change.target.value as Discipline } }))}><option>トラック</option><option>跳躍</option><option>投てき</option></select></td>
                    <td><button className="row-save-button" onClick={() => saveEventDetails(event.id)}>保存</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>}

          {registrationMode === "assignments" && <>
            <div className="admin-note">競技者ごとに最大3種目を選択します。プルダウンは「種目設定」の登録内容を参照します。</div>
            <div className="tablewrap assignment-wrap">
              <table className="grid assignment-grid">
                <thead><tr><th>ナンバー</th><th>競技者名</th><th>性別</th><th>参加競技1</th><th>参加競技2</th><th>参加競技3</th></tr></thead>
                <tbody>{state.athletes.map((athlete) => {
                  const selected = assignmentFor(athlete.id);
                  return (
                    <tr key={athlete.id}>
                      <td>{athlete.bib}</td>
                      <td className="event"><div className="kana">{athlete.kana}</div>{athlete.name}</td>
                      <td>{athlete.sex}</td>
                      {[0, 1, 2].map((slot) => (
                        <td key={slot}>
                          <select className="assignment-select" aria-label={`${athlete.name}の参加競技${slot + 1}`} value={selected[slot] ?? ""} onChange={(event) => updateAssignment(athlete.id, slot, event.target.value)}>
                            <option value="">未選択</option>
                            {state.events.filter((event) => event.id !== "relay").map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
                          </select>
                        </td>
                      ))}
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
            <div className="input-actions assignment-actions"><button className="darkbtn" onClick={saveAssignments}>選手種目登録を保存</button></div>
          </>}
        </section>
      )}

      {view === "admin" && (
        <section>
          <div className="result-head">
            <div className="event-title">管理者画面</div>
            <div className="subseg admin-seg">
              {([
                ["status", "競技管理"], ["athletes", "選手登録"], ["entries", "エントリー編集"], ["corrections", "記録修正"], ["audit", "監査ログ"],
              ] as const).map(([key, label]) => <button key={key} className={adminMode === key ? "active" : ""} onClick={() => setAdminMode(key)}>{label}</button>)}
            </div>
          </div>

          {adminMode === "status" && <>
            <div className="admin-note">種目名・開始時刻を入力して行ごとに保存できます。状態変更は選択時に即時反映されます。</div>
            <div className="tablewrap">
              <table className="grid admin-grid">
                <thead><tr><th>開始時刻</th><th>種目名</th><th>状態</th><th>保存</th></tr></thead>
                <tbody>{state.events.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <input
                        className="admin-text-field time-field"
                        type="time"
                        aria-label={`${event.name}の開始時刻`}
                        value={eventDrafts[event.id]?.startTime ?? event.startTime}
                        onChange={(change) => setEventDrafts((current) => ({
                          ...current,
                          [event.id]: { ...current[event.id], startTime: change.target.value },
                        }))}
                      />
                    </td>
                    <td>
                      <input
                        className="admin-text-field"
                        aria-label={`${event.name}の種目名`}
                        value={eventDrafts[event.id]?.name ?? event.name}
                        onChange={(change) => setEventDrafts((current) => ({
                          ...current,
                          [event.id]: { ...current[event.id], name: change.target.value },
                        }))}
                      />
                    </td>
                    <td>
                      <select
                        className="compact-select"
                        aria-label={`${event.name}の状態`}
                        value={event.status}
                        onChange={(change) => changeEventStatus(event.id, change.target.value as EventStatus)}
                      >
                        {EVENT_STATUSES.map((status) => <option key={status}>{status}</option>)}
                      </select>
                    </td>
                    <td><button className="row-save-button" onClick={() => saveEventDetails(event.id)}>保存</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>}

          {adminMode === "athletes" && <>
            <div className="admin-tools"><span>登録済み {state.athletes.length}名</span><span>CSV一括更新は「エントリー編集」から行えます。</span></div>
            <div className="tablewrap"><table className="grid athlete-master"><thead><tr><th>No</th><th>氏名</th><th>学年</th><th>性別</th><th>所属・登録先</th></tr></thead><tbody>{state.athletes.map((athlete) => <tr key={athlete.id}><td>{athlete.bib}</td><td className="athlete"><div className="kana">{athlete.kana}</div>{athlete.name}</td><td>{athlete.grade}</td><td>{athlete.sex}</td><td>{state.teams.find((team) => team.id === athlete.teamId)?.name}<br />{athlete.affiliation}</td></tr>)}</tbody></table></div>
          </>}

          {adminMode === "entries" && <>
            <div className="csv-workflow">
              <div className="workflow-title">CSV一括取り込み</div>
              <ol>
                <li>現在の登録内容入りテンプレートをダウンロード</li>
                <li>CSVの内容を編集して保存</li>
                <li>編集済みCSVを取り込んでサイトへ反映</li>
              </ol>
              <div className="admin-tools csv-actions">
                <button className="goldbtn" onClick={downloadBulkTemplate}>1. テンプレートをDL</button>
                <label className="darkbtn filebtn">3. 編集済みCSVを取り込む
                  <input type="file" accept=".csv,text/csv" onChange={importBulkCsv} />
                </label>
              </div>
              <p>行を削除すると、その種目の該当出場枠も削除されます。種目名・開始時刻・選手情報・組・レーンを一括更新できます。</p>
            </div>

            <div className="admin-tools entry-event-selector">
              <label htmlFor="entry-event">個別変更する種目</label>
              <select id="entry-event" className="select" value={selectedEvent.id} onChange={(event) => openEvent(event.target.value, "admin")}>
                {state.events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
              </select>
              <span>選手を変更すると、その枠に保存済みの記録は削除されます。</span>
            </div>
            <div className="tablewrap">
              <table className="grid entry-master">
                <thead><tr><th>組</th><th>ﾚｰﾝ<br />試順</th><th>出場者</th><th>得点</th><th>操作</th></tr></thead>
                <tbody>
                  {eventEntries.length === 0 && <tr><td colSpan={5} className="empty">出場者は登録されていません</td></tr>}
                  {eventEntries.map((entry) => {
                    const heat = state.heats.find((candidate) => candidate.id === entry.heatId)!;
                    return (
                      <tr key={entry.id}>
                        <td>{heat.number}</td>
                        <td>{entry.laneOrOrder}</td>
                        <td>
                          <select
                            className="compact-select athlete-select"
                            aria-label={`${selectedEvent.name} ${heat.number}組 ${entry.laneOrOrder}の出場者`}
                            value={entry.athleteId}
                            onChange={(change) => changeEntryAthlete(entry.id, change.target.value)}
                          >
                            {state.athletes.map((athlete) => (
                              <option key={athlete.id} value={athlete.id}>No.{athlete.bib} {athlete.name}</option>
                            ))}
                          </select>
                        </td>
                        <td>{entry.scoringEligible ? "○" : "－"}</td>
                        <td><button className="danger-button" onClick={() => removeEntry(entry.id)}>削除</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="entry-add">
              <div className="workflow-title">出場者を個別追加</div>
              <label>組
                <select
                  className="compact-select"
                  value={newEntryHeatId || selectedHeats[0]?.id || ""}
                  onChange={(event) => setNewEntryHeatId(event.target.value)}
                >
                  {selectedHeats.map((heat) => <option key={heat.id} value={heat.id}>{heat.number}組</option>)}
                </select>
              </label>
              <label>レーン・試順
                <input
                  className="admin-text-field"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="自動"
                  value={newEntryLane}
                  onChange={(event) => setNewEntryLane(event.target.value.replace(/\D/g, ""))}
                />
              </label>
              <label>選手
                <select
                  className="compact-select"
                  value={newEntryAthleteId || state.athletes[0]?.id || ""}
                  onChange={(event) => setNewEntryAthleteId(event.target.value)}
                >
                  {state.athletes.map((athlete) => <option key={athlete.id} value={athlete.id}>No.{athlete.bib} {athlete.name}</option>)}
                </select>
              </label>
              <button className="darkbtn" onClick={addEntry}>出場者を追加</button>
            </div>
          </>}

          {adminMode === "corrections" && <>
            <div className="admin-tools"><select className="select" value={selectedEvent.id} onChange={(event) => openEvent(event.target.value, "admin")}>{state.events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select><input className="reason-field" value={adminReason} onChange={(event) => setAdminReason(event.target.value)} placeholder="訂正理由（必須）" /></div>
            <div className="tablewrap"><table className="grid correction-grid"><thead><tr><th>No</th><th>競技者名</th><th>現在</th><th>訂正値</th><th>状態</th></tr></thead><tbody>{eventEntries.map((entry) => { const athlete = state.athletes.find((candidate) => candidate.id === entry.athleteId)!; const current = getResult(state, entry.id); return <tr key={entry.id}><td>{athlete.bib}</td><td className="event">{athlete.name}</td><td>{current?.status === "OK" ? formatPerformance(current.value, selectedEvent) : current?.status || "未入力"}</td><td><input className="record-field" inputMode="decimal" pattern="[0-9.:]*" value={adminDrafts[entry.id] || ""} onChange={(event) => updateDraft(entry.id, event.target.value, "admin")} /></td><td><select className="compact-select" value={adminCodes[entry.id] || "OK"} onChange={(event) => setAdminCodes((codes) => ({ ...codes, [entry.id]: event.target.value as ResultStatus }))}><option>OK</option>{RESULT_CODES.map((code) => <option key={code}>{code}</option>)}</select></td></tr>; })}</tbody></table></div>
            <div className="input-actions"><button className="darkbtn" disabled={!adminReason.trim()} onClick={saveCorrections}>理由付きで訂正保存</button></div>
          </>}

          {adminMode === "audit" && <div className="tablewrap"><table className="grid audit-grid"><thead><tr><th>時刻</th><th>操作者</th><th>操作</th><th>対象</th><th>理由</th></tr></thead><tbody>{state.auditLogs.map((log) => <tr key={log.id}><td>{log.at}</td><td>{log.actor}</td><td>{log.action}</td><td>{log.entity}</td><td className="event">{log.reason}</td></tr>)}</tbody></table></div>}
        </section>
      )}

      {message && <div className="message" role="status"><span>{message}</span><button onClick={() => setMessage("")}>閉じる</button></div>}
    </div>
  );
}
