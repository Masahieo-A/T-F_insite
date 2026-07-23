import { env } from "cloudflare:workers";

const schema = `
  CREATE TABLE IF NOT EXISTS meeting_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;
const auditSchema = `
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`;

async function ensureSchema() {
  if (!env.DB) return false;
  await env.DB.batch([
    env.DB.prepare(schema),
    env.DB.prepare(auditSchema),
  ]);
  return true;
}

export async function GET() {
  try {
    if (!(await ensureSchema())) return Response.json({ state: null, source: "demo" });
    const row = await env.DB.prepare("SELECT payload, updated_at FROM meeting_state WHERE id = 1").first<{ payload: string; updated_at: string }>();
    return Response.json({ state: row ? JSON.parse(row.payload) : null, updatedAt: row?.updated_at ?? null });
  } catch {
    return Response.json({ state: null, source: "offline" });
  }
}

export async function POST(request: Request) {
  const body = await request.json() as { state?: unknown; actor?: string; action?: string; detail?: string };
  if (!body.state) return Response.json({ error: "state is required" }, { status: 400 });
  try {
    if (!(await ensureSchema())) return Response.json({ saved: false, source: "device" }, { status: 503 });
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO meeting_state (id, payload, updated_at) VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
      `).bind(JSON.stringify(body.state), now),
      env.DB.prepare("INSERT INTO audit_logs (actor, action, detail, created_at) VALUES (?, ?, ?, ?)")
        .bind(body.actor || "unknown", body.action || "update", body.detail || "", now),
    ]);
    return Response.json({ saved: true, updatedAt: now });
  } catch {
    return Response.json({ saved: false, source: "device" }, { status: 503 });
  }
}
