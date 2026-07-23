"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";

type Team = { id: string; name: string; short: string; color: string };
type Athlete = {
  id: string;
  bib: number;
  name: string;
  kana: string;
  grade: number;
  sex: "男子" | "女子";
  teamId: string;
};
type EventType = "track" | "field" | "highjump" | "relay" | "special";
type EventStatus = "未編成" | "編成済み" | "入力中" | "速報" | "確定" | "訂正中";
type EventItem = {
  id: string;
  time: string;
  name: string;
  category: "男子" | "女子" | "共通";
  type: EventType;
  round: string;
  heat: string;
  status: EventStatus;
  slots: number;
  progress: number;
};
type Mark = { value: number | null; code?: string; attempts?: (number | "FOUL")[] };
type AuditItem = { id: string; at: string; actor: string; action: string; detail: string };
type AppState = {
  teams: Team[];
  athletes: Athlete[];
  events: EventItem[];
  results: Record<string, Record<string, Mark>>;
  audit: AuditItem[];
  updatedAt: string;
};

const TEAMS: Team[] = [
  { id: "a", name: "紅チーム", short: "紅", color: "#d84845" },
  { id: "b", name: "蒼チーム", short: "蒼", color: "#2584c7" },
  { id: "c", name: "翠チーム", short: "翠", color: "#2f9b67" },
];

const NAMES = [
  ["青木 陽斗", "アオキ ハルト"], ["石川 結衣", "イシカワ ユイ"], ["上田 蒼真", "ウエダ ソウマ"],
  ["遠藤 美咲", "エンドウ ミサキ"], ["大西 蓮", "オオニシ レン"], ["加藤 凛", "カトウ リン"],
  ["木村 悠真", "キムラ ユウマ"], ["小林 彩花", "コバヤシ アヤカ"], ["斎藤 湊", "サイトウ ミナト"],
  ["佐々木 杏", "ササキ アン"], ["鈴木 大和", "スズキ ヤマト"], ["高橋 莉央", "タカハシ リオ"],
  ["田中 颯太", "タナカ ソウタ"], ["中村 心春", "ナカムラ コハル"], ["西村 伊織", "ニシムラ イオリ"],
  ["橋本 芽依", "ハシモト メイ"], ["林 陸", "ハヤシ リク"], ["藤田 葵", "フジタ アオイ"],
  ["前田 琉生", "マエダ ルイ"], ["松本 咲良", "マツモト サクラ"], ["三浦 朝陽", "ミウラ アサヒ"],
  ["宮本 澪", "ミヤモト ミオ"], ["村上 岳", "ムラカミ ガク"], ["森 七海", "モリ ナナミ"],
  ["山口 樹", "ヤマグチ イツキ"], ["山田 紬", "ヤマダ ツムギ"], ["吉田 翔", "ヨシダ ショウ"],
  ["渡辺 琴音", "ワタナベ コトネ"], ["井上 陽向", "イノウエ ヒナタ"], ["岡田 凪", "オカダ ナギ"],
  ["川口 新", "カワグチ アラタ"], ["近藤 花", "コンドウ ハナ"], ["坂本 奏太", "サカモト ソウタ"],
  ["清水 ひかり", "シミズ ヒカリ"], ["原田 翼", "ハラダ ツバサ"], ["福田 結月", "フクダ ユヅキ"],
];

const ATHLETES: Athlete[] = NAMES.map(([name, kana], i) => ({
  id: `p${i + 1}`,
  bib: 101 + i,
  name,
  kana,
  grade: (i % 3) + 1,
  sex: i % 2 ? "女子" : "男子",
  teamId: TEAMS[i % 3].id,
}));

const EVENTS: EventItem[] = [
  { id: "e60m", time: "13:50", name: "60m", category: "共通", type: "track", round: "タイムレース決勝", heat: "3組", status: "確定", slots: 3, progress: 100 },
  { id: "e250", time: "14:10", name: "250m（1周）", category: "共通", type: "track", round: "タイムレース決勝", heat: "3組", status: "確定", slots: 3, progress: 100 },
  { id: "elong", time: "14:35", name: "走幅跳", category: "共通", type: "field", round: "決勝", heat: "1組", status: "速報", slots: 3, progress: 82 },
  { id: "ehigh", time: "14:35", name: "走高跳", category: "共通", type: "highjump", round: "決勝", heat: "1組", status: "入力中", slots: 2, progress: 64 },
  { id: "eshot", time: "14:35", name: "砲丸投", category: "共通", type: "field", round: "決勝", heat: "1組", status: "速報", slots: 3, progress: 76 },
  { id: "e500", time: "15:45", name: "500m（2周）", category: "共通", type: "track", round: "タイムレース決勝", heat: "2組", status: "編成済み", slots: 2, progress: 0 },
  { id: "e1000", time: "16:05", name: "1000m（4周）", category: "共通", type: "track", round: "決勝", heat: "1組", status: "編成済み", slots: 2, progress: 0 },
  { id: "edeclare", time: "16:30", name: "申告タイム250m", category: "共通", type: "special", round: "特別競技", heat: "2組", status: "編成済み", slots: 2, progress: 0 },
  { id: "erelay", time: "16:55", name: "4×250mリレー", category: "共通", type: "relay", round: "決勝", heat: "1組", status: "編成済み", slots: 1, progress: 0 },
  { id: "eshuttle", time: "17:30", name: "12×50m全員シャトルR", category: "共通", type: "relay", round: "決勝", heat: "1組", status: "編成済み", slots: 1, progress: 0 },
];

const RESULT_SEEDS: Record<string, Record<string, Mark>> = {};
for (const event of EVENTS) {
  RESULT_SEEDS[event.id] = {};
  ATHLETES.slice(0, event.slots * 3).forEach((athlete, i) => {
    const base =
      event.id === "e60m" ? 7460 :
      event.id === "e250" ? 34280 :
      event.id === "elong" ? 5800 :
      event.id === "eshot" ? 11500 :
      event.id === "ehigh" ? 1700 : 0;
    RESULT_SEEDS[event.id][athlete.id] = event.type === "field"
      ? { value: base - i * 90, attempts: [base - i * 120, "FOUL", base - i * 90] }
      : { value: event.type === "track" ? base + i * 410 : base };
  });
}

const INITIAL: AppState = {
  teams: TEAMS,
  athletes: ATHLETES,
  events: EVENTS,
  results: RESULT_SEEDS,
  audit: [
    { id: "a1", at: "14:42:18", actor: "走幅跳記録係", action: "速報提出", detail: "走幅跳 9名・第2試技まで" },
    { id: "a2", at: "14:31:04", actor: "主任記録員", action: "結果確定", detail: "250m（1周） 全3組" },
    { id: "a3", at: "14:08:26", actor: "管理者", action: "結果確定", detail: "60m 全3組" },
  ],
  updatedAt: "14:42:18",
};

const TYPE_LABEL: Record<EventType, string> = {
  track: "トラック", field: "跳躍・投てき", highjump: "跳躍", relay: "リレー", special: "特別",
};

const statusOrder: Record<string, number> = { "": 0, NM: 1, DNF: 2, DNS: 3, DQ: 4 };
const isTrack = (event: EventItem) => event.type === "track" || event.type === "relay" || event.type === "special";
const formatTime = (ms: number | null) => {
  if (ms == null) return "—";
  if (ms >= 60000) {
    const min = Math.floor(ms / 60000);
    return `${min}:${((ms % 60000) / 1000).toFixed(2).padStart(5, "0")}`;
  }
  return (ms / 1000).toFixed(2);
};
const formatMark = (event: EventItem, mark?: Mark) => {
  if (!mark) return "—";
  if (mark.code) return mark.code;
  if (mark.value == null) return "—";
  return isTrack(event) ? formatTime(mark.value) : `${(mark.value / 1000).toFixed(2)}m`;
};
const parseDigits = (event: EventItem, raw: string) => {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  if (event.type === "field" || event.type === "highjump") return n * 10;
  if (event.name.startsWith("500") || event.name.startsWith("1000")) {
    const cs = n % 100;
    const totalSec = Math.floor(n / 100);
    return (Math.floor(totalSec / 100) * 60 + (totalSec % 100)) * 1000 + cs * 10;
  }
  return n * 10;
};

function rankedEntries(state: AppState, event: EventItem) {
  const marks = state.results[event.id] || {};
  const entries = Object.entries(marks).map(([athleteId, mark]) => ({
    athlete: state.athletes.find((a) => a.id === athleteId)!,
    mark,
  })).filter((x) => x.athlete);
  entries.sort((a, b) => {
    const ac = statusOrder[a.mark.code || ""] || 0;
    const bc = statusOrder[b.mark.code || ""] || 0;
    if (ac || bc) return ac - bc;
    if (a.mark.value == null) return 1;
    if (b.mark.value == null) return -1;
    return isTrack(event) ? a.mark.value - b.mark.value : b.mark.value - a.mark.value;
  });
  let last = "";
  let rank = 0;
  return entries.map((entry, i) => {
    const key = `${entry.mark.code || ""}-${entry.mark.value}`;
    if (key !== last) rank = i + 1;
    last = key;
    return { ...entry, rank };
  });
}

function teamScores(state: AppState) {
  const scores = state.teams.map((team) => ({ ...team, points: 0, wins: 0, seconds: 0, events: 0 }));
  state.events.filter((event) => ["速報", "確定"].includes(event.status) && event.type !== "special").forEach((event) => {
    const ranks = rankedEntries(state, event);
    const teamRanks = state.teams.map((team) => {
      const own = ranks.filter((r) => r.athlete.teamId === team.id).slice(0, event.slots);
      const penalty = event.slots * state.teams.length + 1;
      const values = own.map((r) => r.mark.code ? penalty : r.rank);
      while (values.length < event.slots) values.push(penalty);
      return { teamId: team.id, sum: values.reduce((a, b) => a + b, 0), values };
    }).sort((a, b) => a.sum - b.sum || a.values.join(",").localeCompare(b.values.join(",")));
    teamRanks.forEach((row, i) => {
      const team = scores.find((s) => s.id === row.teamId)!;
      const relayPoints = event.id === "eshuttle" ? [12, 8, 4] : [10, 6, 4];
      const points = event.type === "relay" ? relayPoints[i] : [6, 4, 2][i];
      team.points += points;
      team.events++;
      if (i === 0) team.wins++;
      if (i === 1) team.seconds++;
    });
  });
  return scores.sort((a, b) => b.points - a.points || b.wins - a.wins || b.seconds - a.seconds);
}

async function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("nans-kounai", 1);
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
async function idbGetState(): Promise<AppState | null> {
  const db = await openDb();
  return new Promise((resolve) => {
    const req = db.transaction("cache").objectStore("cache").get("state");
    req.onsuccess = () => { db.close(); resolve((req.result as AppState) || null); };
    req.onerror = () => { db.close(); resolve(null); };
  });
}

export default function Home() {
  const [state, setState] = useState<AppState>(INITIAL);
  const [tab, setTab] = useState<"schedule" | "results" | "input" | "admin">("schedule");
  const [kindFilter, setKindFilter] = useState("全て");
  const [sexFilter, setSexFilter] = useState("全て");
  const [selectedEventId, setSelectedEventId] = useState("elong");
  const [selectedAthleteId, setSelectedAthleteId] = useState("p1");
  const [draftValue, setDraftValue] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [sync, setSync] = useState<"同期済み" | "端末保存済み" | "同期中">("同期済み");
  const [toast, setToast] = useState("");
  const [adminSection, setAdminSection] = useState("進行");

  useEffect(() => {
    let active = true;
    (async () => {
      const local = await idbGetState();
      if (active && local) setState(local);
      try {
        const res = await fetch("/api/state");
        if (res.ok) {
          const data = await res.json() as { state?: AppState | null };
          if (active && data.state) {
            setState(data.state);
            await idbPut("cache", "state", data.state);
          }
        }
      } catch { /* offline: cached state remains active */ }
    })();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const online = () => setSync("同期済み");
    const offline = () => setSync("端末保存済み");
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => { active = false; window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, []);

  const selectedEvent = state.events.find((e) => e.id === selectedEventId) || state.events[0];
  const eventAthletes = state.athletes.slice(0, selectedEvent.slots * 3);
  const selectedAthlete = eventAthletes.find((a) => a.id === selectedAthleteId) || eventAthletes[0];
  const standings = useMemo(() => teamScores(state), [state]);
  const currentEvent = state.events.find((e) => e.status === "入力中") || state.events[2];
  const selectedRankings = useMemo(() => rankedEntries(state, selectedEvent), [state, selectedEvent]);
  const visibleEvents = state.events.filter((e) => {
    const kindOk = kindFilter === "全て" || TYPE_LABEL[e.type].includes(kindFilter);
    const sexOk = sexFilter === "全て" || e.category === sexFilter || e.category === "共通";
    return kindOk && sexOk;
  });

  const persist = async (next: AppState, action: string, detail: string) => {
    setState(next);
    setSync("同期中");
    await idbPut("cache", "state", next);
    try {
      const res = await fetch("/api/state", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: next, actor: "記録係端末", action, detail }),
      });
      if (!res.ok) throw new Error("sync failed");
      setSync("同期済み");
    } catch {
      await idbPut("queue", undefined, { state: next, action, detail, createdAt: Date.now() });
      setSync("端末保存済み");
    }
  };

  const stageMark = (code?: string) => {
    const value = code ? null : parseDigits(selectedEvent, draftValue);
    const results = { ...state.results, [selectedEvent.id]: { ...(state.results[selectedEvent.id] || {}) } };
    results[selectedEvent.id][selectedAthlete.id] = { value, code };
    setState({ ...state, results });
    setDraftValue("");
    setToast(`${selectedAthlete.name}の記録を仮保存しました`);
    window.setTimeout(() => setToast(""), 2400);
  };

  const submitReview = async () => {
    const time = new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const next: AppState = {
      ...state,
      events: state.events.map((e) => e.id === selectedEvent.id ? { ...e, status: "速報", progress: 100 } : e),
      updatedAt: time,
      audit: [{ id: crypto.randomUUID(), at: time, actor: "記録係端末", action: "速報提出", detail: `${selectedEvent.name} ${eventAthletes.length}名` }, ...state.audit],
    };
    await persist(next, "速報提出", `${selectedEvent.name} ${eventAthletes.length}名`);
    setReviewOpen(false);
    setToast("速報へ反映しました");
  };

  const updateEventStatus = async (eventId: string, status: EventStatus) => {
    const event = state.events.find((e) => e.id === eventId)!;
    const time = new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const next = {
      ...state,
      updatedAt: time,
      events: state.events.map((e) => e.id === eventId ? { ...e, status, progress: status === "確定" ? 100 : e.progress } : e),
      audit: [{ id: crypto.randomUUID(), at: time, actor: "主任記録員", action: `状態変更：${status}`, detail: event.name }, ...state.audit],
    };
    await persist(next, "状態変更", `${event.name} → ${status}`);
  };

  const exportData = (format: "csv" | "json") => {
    const body = format === "json"
      ? JSON.stringify(state, null, 2)
      : ["種目,順位,No,競技者名,チーム,記録", ...state.events.flatMap((event) =>
          rankedEntries(state, event).map((r) => `${event.name},${r.rank},${r.athlete.bib},${r.athlete.name},${state.teams.find((t) => t.id === r.athlete.teamId)?.name},${formatMark(event, r.mark)}`)
        )].join("\n");
    const blob = new Blob(["\uFEFF", body], { type: format === "json" ? "application/json" : "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `校内大会_全結果.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importAthletes = (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = String(reader.result).split(/\r?\n/).slice(1).filter(Boolean);
      if (!rows.length) return;
      const athletes = rows.map((row, i) => {
        const [bib, name, kana, grade, sex, team] = row.split(",");
        return { id: `import-${i}`, bib: Number(bib), name, kana, grade: Number(grade), sex: sex as "男子" | "女子", teamId: team };
      });
      setState({ ...state, athletes });
      setToast(`${athletes.length}名を取り込みました`);
    };
    reader.readAsText(file);
  };

  return (
    <main>
      <header className="site-header">
        <div className="header-inner">
          <button className="brand" onClick={() => setTab("schedule")} aria-label="トップへ">
            <span className="brand-mark">N</span>
            <span><b>NANS KOUNAI</b><small>ATHLETICS LIVE</small></span>
          </button>
          <div className="header-meta">
            <span className="live-dot" /> LIVE
            <button className="top-button" onClick={() => setTab("schedule")}>TOP</button>
          </div>
        </div>
      </header>

      <section className="meeting-band">
        <div>
          <p className="eyebrow">3年生引退試合</p>
          <h1>校内陸上競技大会</h1>
          <p>2026年7月23日（木・祝）　校内グラウンド・約250mトラック</p>
        </div>
        <div className="powered">Powered by <b>NANS KOUNAI</b></div>
      </section>

      <nav className="primary-tabs" aria-label="メインメニュー">
        {([
          ["schedule", "競技一覧"], ["results", "結果・速報"], ["input", "記録入力"], ["admin", "管理"],
        ] as const).map(([key, label]) => (
          <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>
        ))}
      </nav>

      <section className="live-summary">
        <article className="now-card">
          <div className="section-kicker"><span className="pulse" /> 現在競技</div>
          <div className="now-main">
            <div>
              <h2>{currentEvent.name}</h2>
              <p>{currentEvent.category}・{currentEvent.round}　<span className="status status-input">入力中</span></p>
            </div>
            <b className="progress-number">{currentEvent.progress}%</b>
          </div>
          <div className="progress"><i style={{ width: `${currentEvent.progress}%` }} /></div>
          <div className="now-foot"><span>開始 {currentEvent.time}</span><span>最終更新 {state.updatedAt}</span></div>
        </article>
        <article className="standing-card">
          <div className="section-kicker">チーム総合順位 <span className="provisional">暫定</span></div>
          <ol>
            {standings.map((team, i) => (
              <li key={team.id}>
                <span className={`medal medal-${i + 1}`}>{i + 1}</span>
                <span className="team-line" style={{ "--team": team.color } as React.CSSProperties}>{team.name}</span>
                <strong>{team.points}<small>点</small></strong>
              </li>
            ))}
          </ol>
        </article>
        <article className="ceremony-card">
          <div className="section-kicker">大会進行</div>
          <div className="ceremony-time">18:25</div>
          <h3>表彰・引退セレモニー</h3>
          <p>競技終了予定 17:50</p>
          <div className="timeline-mini"><i /><i /><i className="future" /><i className="future" /></div>
          <span>全体進行 48%</span>
        </article>
      </section>

      {tab === "schedule" && (
        <section className="content-panel">
          <div className="content-title">
            <div><p className="eyebrow blue">PROGRAM</p><h2>競技一覧－開始時刻別</h2></div>
            <div className="updated"><span>●</span> 自動更新　{state.updatedAt}</div>
          </div>
          <div className="filter-row">
            <div className="segmented">
              {["全て", "トラック", "跳躍", "投てき"].map((v) => <button key={v} className={kindFilter === v ? "on" : ""} onClick={() => setKindFilter(v)}>{v}</button>)}
            </div>
            <div className="segmented">
              {["全て", "男子", "女子", "共通"].map((v) => <button key={v} className={sexFilter === v ? "on" : ""} onClick={() => setSexFilter(v)}>{v}</button>)}
            </div>
            <button className="dark-button" onClick={() => setTab("results")}>総合得点・得点内訳</button>
          </div>
          <div className="table-wrap">
            <table className="nans-table schedule-table">
              <thead><tr><th>開始</th><th>競技</th><th>区分</th><th>ラウンド</th><th>組</th><th>状態</th></tr></thead>
              <tbody>
                {visibleEvents.map((event) => (
                  <tr key={event.id}>
                    <td className="time-cell">{event.time}</td>
                    <td><button className="event-link" onClick={() => { setSelectedEventId(event.id); setTab("results"); }}>{event.name}</button></td>
                    <td>{event.category}</td><td>{event.round}</td><td>{event.heat}</td>
                    <td><span className={`status status-${event.status}`}>{event.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="legend-row"><span><i className="legend live" />競技中</span><span><i className="legend final" />確定</span><span><i className="legend soon" />開始前</span></div>
        </section>
      )}

      {tab === "results" && (
        <section className="content-panel">
          <div className="content-title result-title">
            <div><p className="eyebrow blue">RESULTS</p><h2>競技結果・速報</h2></div>
            <select aria-label="表示する種目" value={selectedEvent.id} onChange={(e) => setSelectedEventId(e.target.value)}>
              {state.events.map((event) => <option key={event.id} value={event.id}>{event.time}　{event.name}</option>)}
            </select>
          </div>
          <div className="result-heading">
            <div><span className={`status status-${selectedEvent.status}`}>{selectedEvent.status}</span><h3>{selectedEvent.category} {selectedEvent.name}</h3><p>{selectedEvent.round}・{selectedEvent.heat}</p></div>
            <div className="lane-toggle"><button className="on">順位順</button><button>レーン順</button></div>
          </div>
          <div className="table-wrap">
            <table className="nans-table result-table">
              <thead><tr><th>順位</th><th>レーン</th><th>No.</th><th>競技者</th><th>チーム／学年</th><th>記録</th></tr></thead>
              <tbody>
                {selectedRankings.map(({ athlete, mark, rank }, i) => {
                  const team = state.teams.find((t) => t.id === athlete.teamId)!;
                  return (
                    <tr key={athlete.id} className={mark.code ? "invalid-row" : ""}>
                      <td className="rank-cell">{rank}</td><td>{(i % 6) + 1}</td><td>{athlete.bib}</td>
                      <td className="athlete-cell"><small>{athlete.kana}</small><b>{athlete.name}</b></td>
                      <td><span className="team-dot" style={{ background: team.color }} />{team.short}／{athlete.grade}年</td>
                      <td className="record-cell">{formatMark(selectedEvent, mark)}{i === 0 && !mark.code && <small>PB</small>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="score-explain">
            <div>
              <p className="eyebrow blue">SCORING BREAKDOWN</p><h3>この種目のチーム順位・獲得点</h3>
              <p>各チーム上位{selectedEvent.slots}名の個人順位合計で比較します。</p>
            </div>
            <div className="score-grid">
              {standings.map((team, i) => <div key={team.id}><span>{i + 1}位</span><b style={{ color: team.color }}>{team.name}</b><strong>{[6, 4, 2][i]}点</strong></div>)}
            </div>
          </div>
          <div className="codes">DNS：欠場　 DNF：途中棄権　 DQ：失格　 NM：記録なし　 PB：自己ベスト</div>
        </section>
      )}

      {tab === "input" && (
        <section className="input-shell">
          <div className="input-topbar">
            <div><p>記録入力ステーション</p><b>フィールドA・端末 03</b></div>
            <div className={`sync sync-${sync}`}><i />{sync}</div>
          </div>
          <div className="input-grid">
            <aside className="event-picker">
              <h2>担当競技</h2>
              {state.events.slice(0, 7).map((event) => (
                <button key={event.id} className={selectedEvent.id === event.id ? "selected" : ""} onClick={() => {
                  setSelectedEventId(event.id);
                  setSelectedAthleteId(state.athletes[0].id);
                }}>
                  <span>{event.time}</span><b>{event.name}</b><small>{event.status}</small>
                </button>
              ))}
            </aside>
            <div className="entry-panel">
              <div className="entry-head">
                <div><p>{selectedEvent.category}・{selectedEvent.round}</p><h2>{selectedEvent.name}</h2></div>
                <span>{eventAthletes.findIndex((a) => a.id === selectedAthlete.id) + 1} / {eventAthletes.length}名</span>
              </div>
              <div className="athlete-selector">
                <button aria-label="前の選手" onClick={() => {
                  const i = eventAthletes.findIndex((a) => a.id === selectedAthlete.id);
                  setSelectedAthleteId(eventAthletes[(i - 1 + eventAthletes.length) % eventAthletes.length].id);
                }}>‹</button>
                <div><small>No. {selectedAthlete.bib}　{state.teams.find((t) => t.id === selectedAthlete.teamId)?.name}／{selectedAthlete.grade}年</small><b>{selectedAthlete.name}</b><span>{selectedAthlete.kana}</span></div>
                <button aria-label="次の選手" onClick={() => {
                  const i = eventAthletes.findIndex((a) => a.id === selectedAthlete.id);
                  setSelectedAthleteId(eventAthletes[(i + 1) % eventAthletes.length].id);
                }}>›</button>
              </div>
              {selectedEvent.type === "highjump" ? (
                <div className="high-jump">
                  <h3>現在の高さ　1.60m</h3>
                  <div><button className="success" onClick={() => stageMark()}>○<small>成功</small></button><button className="failure" onClick={() => stageMark("NM")}>×<small>失敗</small></button><button className="pass" onClick={() => stageMark("PASS")}>－<small>パス</small></button></div>
                </div>
              ) : (
                <>
                  <label className="record-input">
                    <span>{selectedEvent.type === "field" ? "記録（cm）" : "記録"}</span>
                    <input inputMode="decimal" pattern="[0-9.]*" value={draftValue} onChange={(e) => setDraftValue(e.target.value.replace(/[^\d.]/g, ""))} placeholder={selectedEvent.type === "field" ? "例：542 → 5.42m" : "例：1234 → 12.34"} />
                    <b>{draftValue ? formatMark(selectedEvent, { value: parseDigits(selectedEvent, draftValue) }) : "—"}</b>
                  </label>
                  <div className="code-buttons">
                    {(selectedEvent.type === "field" ? ["FOUL", "NM"] : ["DNS", "DNF", "DQ"]).map((code) => <button key={code} onClick={() => stageMark(code)}>{code}</button>)}
                  </div>
                  <button className="save-draft" disabled={!draftValue} onClick={() => stageMark()}>この記録を仮保存</button>
                </>
              )}
              <div className="entry-progress">
                {eventAthletes.map((athlete) => <button key={athlete.id} onClick={() => setSelectedAthleteId(athlete.id)} className={state.results[selectedEvent.id]?.[athlete.id] ? "done" : ""} aria-label={`${athlete.name}${state.results[selectedEvent.id]?.[athlete.id] ? "入力済み" : "未入力"}`} />)}
              </div>
              <button className="review-button" onClick={() => setReviewOpen(true)}>全選手を確認して速報提出</button>
            </div>
          </div>
        </section>
      )}

      {tab === "admin" && (
        <section className="admin-shell">
          <aside className="admin-nav">
            <p>大会管理</p>
            {["進行", "選手・チーム", "種目・編成", "端末", "得点ルール", "監査ログ", "データ出力"].map((item) => <button key={item} className={adminSection === item ? "active" : ""} onClick={() => setAdminSection(item)}>{item}</button>)}
            <div className="admin-user"><span>管</span><div><b>大会管理者</b><small>管理者権限</small></div></div>
          </aside>
          <div className="admin-content">
            <div className="content-title"><div><p className="eyebrow blue">CONTROL CENTER</p><h2>{adminSection}</h2></div><span className="secure">● 管理者認証済み</span></div>
            {adminSection === "進行" && (
              <>
                <div className="admin-cards"><div><span>完了競技</span><b>2<small> / 10</small></b></div><div><span>速報競技</span><b>2</b></div><div><span>未同期端末</span><b className="ok">0</b></div><div><span>要確認</span><b className="warn">1</b></div></div>
                <div className="admin-box"><h3>競技進行ボード</h3>{state.events.map((event) => <div className="control-row" key={event.id}><time>{event.time}</time><b>{event.name}</b><span className={`status status-${event.status}`}>{event.status}</span><select aria-label={`${event.name}の状態`} value={event.status} onChange={(e) => updateEventStatus(event.id, e.target.value as EventStatus)}>{["未編成", "編成済み", "入力中", "速報", "確定", "訂正中"].map((s) => <option key={s}>{s}</option>)}</select></div>)}</div>
              </>
            )}
            {adminSection === "選手・チーム" && (
              <div className="admin-box">
                <div className="box-title"><div><h3>選手名簿</h3><p>36名・3チーム（各12名）</p></div><label className="upload-button">CSVを取り込む<input type="file" accept=".csv" onChange={importAthletes} /></label></div>
                <table className="nans-table"><thead><tr><th>No.</th><th>氏名</th><th>学年</th><th>区分</th><th>チーム</th></tr></thead><tbody>{state.athletes.slice(0, 12).map((a) => <tr key={a.id}><td>{a.bib}</td><td>{a.name}<small className="sub-kana">{a.kana}</small></td><td>{a.grade}年</td><td>{a.sex}</td><td>{state.teams.find((t) => t.id === a.teamId)?.name}</td></tr>)}</tbody></table>
              </div>
            )}
            {adminSection === "監査ログ" && <div className="admin-box"><h3>記録修正・操作履歴</h3>{state.audit.map((a) => <div className="audit-row" key={a.id}><time>{a.at}</time><div><b>{a.action}</b><span>{a.detail}</span></div><small>{a.actor}</small></div>)}</div>}
            {adminSection === "データ出力" && <div className="admin-box export-box"><h3>バックアップ・全結果出力</h3><p>確定済み・速報を含む大会データを出力します。</p><div><button onClick={() => exportData("csv")}>CSVをダウンロード</button><button onClick={() => exportData("json")}>JSONバックアップ</button></div></div>}
            {!["進行", "選手・チーム", "監査ログ", "データ出力"].includes(adminSection) && <div className="admin-box placeholder-admin"><span>設定</span><h3>{adminSection}の設定</h3><p>大会単位の設定を安全に管理できます。変更内容はすべて監査ログへ記録されます。</p><button>設定を編集</button></div>}
          </div>
        </section>
      )}

      <footer><span>NANS KOUNAI ATHLETICS LIVE</span><span>最終更新 {state.updatedAt}　／　自動更新中</span></footer>

      {reviewOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="review-title">
          <div className="review-modal">
            <div className="modal-head"><div><p className="eyebrow blue">FINAL CHECK</p><h2 id="review-title">速報提出前の確認</h2></div><button onClick={() => setReviewOpen(false)} aria-label="閉じる">×</button></div>
            <p>{selectedEvent.name}・{eventAthletes.length}名の記録を確認してください。未入力は「—」で表示されています。</p>
            <div className="review-list">{eventAthletes.map((a, i) => <div key={a.id}><span>{i + 1}</span><b>{a.name}</b><strong>{formatMark(selectedEvent, state.results[selectedEvent.id]?.[a.id])}</strong></div>)}</div>
            <div className="modal-actions"><button onClick={() => setReviewOpen(false)}>入力へ戻る</button><button className="confirm" onClick={submitReview}>速報として保存</button></div>
          </div>
        </div>
      )}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}
