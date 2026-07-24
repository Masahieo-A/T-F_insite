type AuditEntry = {
  actor: string;
  action: string;
  detail: string;
  createdAt: string;
};

type RuntimeStore = typeof globalThis & {
  __nansMeetingState?: unknown;
  __nansMeetingUpdatedAt?: string;
  __nansAuditLog?: AuditEntry[];
};

const runtimeStore = globalThis as RuntimeStore;

function googleStoreConfig() {
  const url = process.env.GOOGLE_APPS_SCRIPT_URL?.trim();
  const secret = process.env.GOOGLE_APPS_SCRIPT_SECRET?.trim();
  return url && secret ? { url, secret } : null;
}

export async function GET() {
  const config = googleStoreConfig();
  if (config) {
    try {
      const url = new URL(config.url);
      url.searchParams.set("secret", config.secret);
      const response = await fetch(url, {
        cache: "no-store",
        redirect: "follow",
      });
      const data = await response.json() as {
        ok?: boolean;
        state?: unknown;
        updatedAt?: string | null;
        error?: string;
      };
      if (!response.ok || data.ok === false) {
        throw new Error(data.error || `Google Sheets returned ${response.status}`);
      }
      return Response.json({
        state: data.state ?? null,
        updatedAt: data.updatedAt ?? null,
        source: "google-sheets",
      });
    } catch (error) {
      return Response.json({
        state: runtimeStore.__nansMeetingState ?? null,
        updatedAt: runtimeStore.__nansMeetingUpdatedAt ?? null,
        source: "runtime",
        warning: error instanceof Error ? error.message : "Google Sheets read failed",
      });
    }
  }

  return Response.json({
    state: runtimeStore.__nansMeetingState ?? null,
    updatedAt: runtimeStore.__nansMeetingUpdatedAt ?? null,
    source: "runtime",
  });
}

export async function POST(request: Request) {
  const body = await request.json() as {
    state?: unknown;
    actor?: string;
    action?: string;
    detail?: string;
  };
  if (!body.state) {
    return Response.json({ error: "state is required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const config = googleStoreConfig();
  if (config) {
    try {
      const response = await fetch(config.url, {
        method: "POST",
        headers: { "content-type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ ...body, secret: config.secret }),
        cache: "no-store",
        redirect: "follow",
      });
      const data = await response.json() as {
        ok?: boolean;
        saved?: boolean;
        updatedAt?: string;
        error?: string;
      };
      if (!response.ok || data.ok === false || !data.saved) {
        throw new Error(data.error || `Google Sheets returned ${response.status}`);
      }
      runtimeStore.__nansMeetingState = body.state;
      runtimeStore.__nansMeetingUpdatedAt = data.updatedAt || now;
      return Response.json({
        saved: true,
        updatedAt: data.updatedAt || now,
        source: "google-sheets",
      });
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : "Google Sheets write failed",
        source: "google-sheets",
      }, { status: 502 });
    }
  }

  runtimeStore.__nansMeetingState = body.state;
  runtimeStore.__nansMeetingUpdatedAt = now;
  runtimeStore.__nansAuditLog = [
    {
      actor: body.actor || "unknown",
      action: body.action || "update",
      detail: body.detail || "",
      createdAt: now,
    },
    ...(runtimeStore.__nansAuditLog || []),
  ].slice(0, 500);

  return Response.json({ saved: true, updatedAt: now, source: "runtime" });
}
