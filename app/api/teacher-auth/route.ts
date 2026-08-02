import { NextRequest, NextResponse } from "next/server";
import {
  createTeacherAuthToken,
  isSha256Hex,
  TEACHER_AUTH_COOKIE,
  TEACHER_AUTH_TTL_SECONDS,
  verifyTeacherAuthToken,
  verifyTeacherPassword,
} from "@/lib/teacherAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function passwordHash() {
  const value = process.env.TEACHER_PASSWORD_HASH?.trim() ?? "";
  return isSha256Hex(value) ? value.toLowerCase() : null;
}

function json(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function GET(request: NextRequest) {
  const hash = passwordHash();
  if (!hash) {
    return json({ authenticated: false, configured: false }, { status: 503 });
  }

  const token = request.cookies.get(TEACHER_AUTH_COOKIE)?.value;

  return json({
    authenticated: token ? verifyTeacherAuthToken(token, hash) : false,
    configured: true,
  });
}

export async function POST(request: Request) {
  const hash = passwordHash();
  if (!hash) {
    return json({ authenticated: false, error: "認証設定が完了していません。" }, { status: 503 });
  }

  let password = "";
  try {
    const body = await request.json() as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return json({ authenticated: false, error: "入力内容を確認してください。" }, { status: 400 });
  }

  if (!password || password.length > 128 || !verifyTeacherPassword(password, hash)) {
    return json({ authenticated: false, error: "パスワードが違います。" }, { status: 401 });
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = nowSeconds + TEACHER_AUTH_TTL_SECONDS;
  const response = json({ authenticated: true });
  response.cookies.set({
    name: TEACHER_AUTH_COOKIE,
    value: createTeacherAuthToken(expiresAtSeconds, hash),
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TEACHER_AUTH_TTL_SECONDS,
    expires: new Date(expiresAtSeconds * 1000),
  });
  return response;
}

export async function DELETE() {
  const response = json({ authenticated: false });
  response.cookies.set({
    name: TEACHER_AUTH_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}
