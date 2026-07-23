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

export async function GET() {
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

  return Response.json({ saved: true, updatedAt: now });
}
