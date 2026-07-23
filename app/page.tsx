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
  calculateEventScoreTransactions,
  calculateOverallStandings,
  formatPerformance,
  normalizePerformance,
  rankResults,
  rankResultsByAbilityBand,
  sanitizeNumericInput,
  type RankedResult,
} from "@/lib/ranking";

type View = "schedule" | "results" | "team" | "input" | "admin";
type ResultMode = "heats" | "overall" | "band";
type AdminMode = "status" | "athletes" | "entries" | "corrections" | "audit";

const RESULT_CODES: ResultStatus[] = ["DNS", "DNF", "DQ", "NM"];
const EVENT_STATUSES: EventStatus[] = ["編成済み", "入力中", "速報", "確定", "訂正中"];

function isMeetingState(value: unknown): value is MeetingState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<MeetingState>;
  return state.dataVersion === 2
    && Array.isArray(state.athletes)
    && Array.isArray(state.entries)
    && Array.isArray(state.heats)
    && Array.isArray(state.results);
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
      resolve(isMeetingState(request.result) ? request.result : null);
    };
    request.onerror = () => {
      db.close();
      resolve(null);
    };
  });
}

function eventDiscipline(event: Event) {
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

export default function Home() {
  const [state, setState] = useState<MeetingState>(initialState);
  const [view, setView] = useState<View>("schedule");
  const [kindFilter, setKindFilter] = useState("全て");
  const [sexFilter, setSexFilter] = useState("全て");
  const [selectedEventId, setSelectedEventId] = useState("60m");
  const [selectedHeatId, setSelectedHeatId] = useState("60m-heat-1");
  const [resultOrder, setResultOrder] = useState<"lane" | "rank">("rank");
  const [resultMode, setResultMode] = useState<ResultMode>("heats");
  const [abilityBand, setAbilityBand] = useState<"A" | "B" | "C">("A");
  const [inputDrafts, setInputDrafts] = useState<Record<string, string>>({});
  const [inputCodes, setInputCodes] = useState<Record<string, ResultStatus>>({});
  const [reviewing, setReviewing] = useState(false);
  const [syncState, setSyncState] = useState<"同期済み" | "端末保存済み" | "同期中">("同期済み");
  const [adminMode, setAdminMode] = useState<AdminMode>("status");
  const [adminDrafts, setAdminDrafts] = useState<Record<string, string>>({});
  const [adminCodes, setAdminCodes] = useState<Record<string, ResultStatus>>({});
  const [adminReason, setAdminReason] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const cached = await idbGetState();
      if (active && cached) setState(cached);
      try {
        const response = await fetch("/api/state");
        const data = await response.json() as { state?: unknown };
        if (active && isMeetingState(data.state)) {
          setState(data.state);
          await idbPut("cache", "state", data.state);
        }
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
  const heatEntries = state.entries.filter((entry) => entry.heatId === selectedHeat?.id);
  const eventEntries = state.entries.filter((entry) => entry.eventId === selectedEvent.id);

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
      setSyncState("同期済み");
    } catch {
      await idbPut("queue", undefined, { state: next, action, detail, createdAt: Date.now() });
      setSyncState("端末保存済み");
    }
  };

  const openEvent = (eventId: string, nextView: View = "results") => {
    const heat = state.heats.find((candidate) => candidate.eventId === eventId);
    setSelectedEventId(eventId);
    if (heat) setSelectedHeatId(heat.id);
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
      const athlete = state.athletes.find((candidate) => candidate.id === entry.athleteId)!;
      const pb = athlete.personalBests[selectedEvent.id] ?? null;
      const result: Result = {
        id: existingIndex >= 0 ? nextResults[existingIndex].id : `result-${entry.id}`,
        entryId: entry.id,
        value,
        displayValue: formatPerformance(value, selectedEvent),
        status: code ?? "OK",
        provisional: true,
        isPersonalBest: value !== null && pb !== null && (selectedEvent.direction === "asc" ? value < pb : value > pb),
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
        isPersonalBest: before?.isPersonalBest ?? false,
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

  const importAthletes = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = String(reader.result).split(/\r?\n/).slice(1).filter(Boolean);
      if (!rows.length) return;
      setMessage(`CSV ${rows.length}件を確認しました。既存選手マスタは管理画面でのみ更新されます。`);
    };
    reader.readAsText(file);
  };

  const headerTitle = view === "schedule"
    ? "競技一覧－開始時刻別"
    : view === "results"
      ? "結果一覧（2026/07/23）"
      : view === "team"
        ? "対抗戦集計（2026/07/23）"
        : view === "input"
          ? "記録入力（2026/07/23）"
          : "大会管理（2026/07/23）";

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
          {item.result.isPersonalBest && item.result.status === "OK" && <span className="pb"> PB</span>}
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
            校内陸上競技大会　兼　3年生引退試合　2026/07/23
            <br />
            <div className="powered">Powered By School T&amp;F</div>
          </div>
          <div className="controls">
            <div className="row">
              <select className="select" aria-label="開催日"><option>2026/07/23</option></select>
              <div className="seg discipline-seg">
                {["全て", "トラック", "跳躍", "投てき"].map((value) => (
                  <button key={value} className={kindFilter === value ? "active" : ""} onClick={() => setKindFilter(value)}>{value}</button>
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
            <div className="darktabs">
              <button onClick={() => openEvent("60m")}>タイムレース集計</button>
              <button className="muted" disabled>混成集計</button>
              <button onClick={() => setView("team")}>対抗戦集計</button>
              <button>コンディション</button>
            </div>
          </div>
          <div className="tablewrap schedule-wrap">
            <table className="grid schedule-grid">
              <thead>
                <tr><th>開始時刻</th><th>競技名</th><th>ﾗｳﾝﾄﾞ</th><th>組</th><th>着取</th></tr>
              </thead>
              <tbody>
                {visibleSchedule.length === 0 && <tr><td colSpan={5} className="empty">該当する競技はありません</td></tr>}
                {visibleSchedule.map((heat) => {
                  const event = state.events.find((candidate) => candidate.id === heat.eventId)!;
                  return (
                    <tr key={heat.id}>
                      <td>{event.startTime}</td>
                      <td className="event">{fullEventName(event)}</td>
                      <td><a href="#" onClick={(mouseEvent) => { mouseEvent.preventDefault(); openEvent(event.id); }}>{event.round}</a></td>
                      <td><a href="#" onClick={(mouseEvent) => { mouseEvent.preventDefault(); openEvent(event.id); }}>{heat.number}</a></td>
                      <td>-</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="staff-links">
            <a href="#" onClick={(event) => { event.preventDefault(); openEvent("60m", "input"); }}>記録入力</a>
            <a href="#" onClick={(event) => { event.preventDefault(); setView("admin"); }}>大会管理</a>
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
              <a href="#" onClick={(event) => { event.preventDefault(); setResultMode("band"); }}>実力帯別</a>
            </div>
            {resultMode === "band" && (
              <div className="subseg bandseg">
                {(["A", "B", "C"] as const).map((band) => (
                  <button key={band} className={abilityBand === band ? "active" : ""} onClick={() => setAbilityBand(band)}>{band}帯</button>
                ))}
              </div>
            )}
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

          {resultMode === "band" && (
            <div className="heat-block">
              <div className="heat-title">実力帯 {abilityBand}　全体順位</div>
              <div className="tablewrap">
                <table className="grid result-grid">
                  <thead><tr><th>順位</th><th>No</th><th>競技者名</th><th>所属<br />所属地</th><th>記録</th></tr></thead>
                  <tbody>
                    {rankResultsByAbilityBand(rankResults(state.results, eventEntries, state.athletes, selectedEvent), abilityBand)
                      .map((item) => renderResultRow(item, selectedEvent, true))}
                  </tbody>
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
            <div className="event-title">チーム総合得点　<span className="provisional-text">暫定</span></div>
            <div className="history"><a href="#" onClick={(event) => event.preventDefault()}>得点内訳（自動計算）</a></div>
          </div>
          <div className="heat-title">総合順位　最終更新 {state.updatedAt}</div>
          <div className="tablewrap">
            <table className="grid team-grid">
              <thead><tr><th>順位</th><th>所属</th><th>得点</th><th>1位数</th><th>2位数</th></tr></thead>
              <tbody>{standings.map((team) => <tr key={team.id}><td>{team.rank}</td><td className="event">{team.name}</td><td className="scorecol">{team.points}</td><td>{team.wins}</td><td>{team.seconds}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="heat-title">種目別得点内訳</div>
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
                        value={inputDrafts[entry.id] ?? ""}
                        placeholder={existing?.status === "OK" ? formatPerformance(existing.value, selectedEvent) : ""}
                        onChange={(event) => updateDraft(entry.id, event.target.value, "input")}
                      />
                      <span className="unit">{selectedEvent.unit === "meters" ? "m" : "秒"}</span>
                    </td>
                    <td>
                      <div className="code-row">
                        {RESULT_CODES.map((code) => <button key={code} className={inputCodes[entry.id] === code ? "selected" : ""} onClick={() => setInputCodes((current) => ({ ...current, [entry.id]: code }))}>{code}</button>)}
                      </div>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <div className="input-actions">
            <button className="darkbtn" onClick={() => setReviewing(true)}>入力内容を確認</button>
          </div>
          {reviewing && (
            <div className="review-section">
              <div className="heat-title">入力内容確認　{selectedHeat.number}組</div>
              <div className="tablewrap">
                <table className="grid review-grid">
                  <thead><tr><th>ﾚｰﾝ</th><th>競技者名</th><th>保存内容</th></tr></thead>
                  <tbody>{heatEntries.map((entry) => {
                    const athlete = state.athletes.find((candidate) => candidate.id === entry.athleteId)!;
                    const value = inputCodes[entry.id] || formatPerformance(normalizePerformance(inputDrafts[entry.id] || "", selectedEvent), selectedEvent) || "変更なし";
                    return <tr key={entry.id}><td>{entry.laneOrOrder}</td><td>{athlete.name}</td><td>{value}</td></tr>;
                  })}</tbody>
                </table>
              </div>
              <div className="input-actions"><button className="mutedbtn" onClick={() => setReviewing(false)}>入力へ戻る</button><button className="darkbtn" onClick={saveProvisional}>速報保存</button></div>
            </div>
          )}
        </section>
      )}

      {view === "admin" && (
        <section>
          <div className="result-head">
            <div className="event-title">管理者画面</div>
            <div className="subseg admin-seg">
              {([
                ["status", "状態管理"], ["athletes", "選手登録"], ["entries", "エントリー"], ["corrections", "記録修正"], ["audit", "監査ログ"],
              ] as const).map(([key, label]) => <button key={key} className={adminMode === key ? "active" : ""} onClick={() => setAdminMode(key)}>{label}</button>)}
            </div>
          </div>

          {adminMode === "status" && <div className="tablewrap"><table className="grid admin-grid"><thead><tr><th>開始</th><th>競技名</th><th>状態</th><th>変更</th></tr></thead><tbody>{state.events.map((event) => <tr key={event.id}><td>{event.startTime}</td><td className="event">{event.name}</td><td>{event.status}</td><td><select className="compact-select" aria-label={`${event.name}の状態`} value={event.status} onChange={(change) => changeEventStatus(event.id, change.target.value as EventStatus)}>{EVENT_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></td></tr>)}</tbody></table></div>}

          {adminMode === "athletes" && <>
            <div className="admin-tools"><label className="goldbtn filebtn">選手CSV取込<input type="file" accept=".csv" onChange={importAthletes} /></label><span>登録済み {state.athletes.length}名</span></div>
            <div className="tablewrap"><table className="grid athlete-master"><thead><tr><th>No</th><th>氏名</th><th>学年</th><th>性別</th><th>所属・登録先</th><th>実力帯</th></tr></thead><tbody>{state.athletes.map((athlete) => <tr key={athlete.id}><td>{athlete.bib}</td><td className="athlete"><div className="kana">{athlete.kana}</div>{athlete.name}</td><td>{athlete.grade}</td><td>{athlete.sex}</td><td>{state.teams.find((team) => team.id === athlete.teamId)?.name}<br />{athlete.affiliation}</td><td>{athlete.abilityBand}</td></tr>)}</tbody></table></div>
          </>}

          {adminMode === "entries" && <>
            <div className="admin-tools"><select className="select" value={selectedEvent.id} onChange={(event) => openEvent(event.target.value, "admin")}>{state.events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select><span>入力画面では選手マスタを変更できません</span></div>
            <div className="tablewrap"><table className="grid entry-master"><thead><tr><th>組</th><th>ﾚｰﾝ</th><th>No</th><th>競技者名</th><th>得点対象</th></tr></thead><tbody>{eventEntries.map((entry) => { const athlete = state.athletes.find((candidate) => candidate.id === entry.athleteId)!; const heat = state.heats.find((candidate) => candidate.id === entry.heatId)!; return <tr key={entry.id}><td>{heat.number}</td><td>{entry.laneOrOrder}</td><td>{athlete.bib}</td><td className="event">{athlete.name}</td><td>{entry.scoringEligible ? "○" : "－"}</td></tr>; })}</tbody></table></div>
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
