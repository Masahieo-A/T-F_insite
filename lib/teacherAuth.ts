import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const TEACHER_AUTH_COOKIE = "teacher_auth";
export const TEACHER_AUTH_TTL_SECONDS = 12 * 60 * 60;

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;
const TOKEN_PATTERN = /^v1\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/;

function equalBuffers(left: Buffer, right: Buffer) {
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isSha256Hex(value: string) {
  return SHA256_HEX_PATTERN.test(value);
}

export function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function verifyTeacherPassword(password: string, expectedHash: string) {
  if (!isSha256Hex(expectedHash)) return false;

  const actual = Buffer.from(sha256Hex(password), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return equalBuffers(actual, expected);
}

function sessionSigningKey(passwordHash: string) {
  return createHash("sha256")
    .update("school-meet-teacher-session:v1:", "utf8")
    .update(passwordHash.toLowerCase(), "utf8")
    .digest();
}

function signatureFor(expiresAtSeconds: number, passwordHash: string) {
  return createHmac("sha256", sessionSigningKey(passwordHash))
    .update(`v1.${expiresAtSeconds}`, "utf8")
    .digest("base64url");
}

export function createTeacherAuthToken(expiresAtSeconds: number, passwordHash: string) {
  if (!Number.isSafeInteger(expiresAtSeconds) || expiresAtSeconds <= 0) {
    throw new Error("expiresAtSeconds must be a positive integer");
  }
  if (!isSha256Hex(passwordHash)) {
    throw new Error("passwordHash must be a SHA-256 hex digest");
  }

  return `v1.${expiresAtSeconds}.${signatureFor(expiresAtSeconds, passwordHash)}`;
}

export function verifyTeacherAuthToken(
  token: string,
  passwordHash: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (!isSha256Hex(passwordHash)) return false;

  const match = TOKEN_PATTERN.exec(token);
  if (!match) return false;

  const expiresAtSeconds = Number(match[1]);
  if (!Number.isSafeInteger(expiresAtSeconds) || expiresAtSeconds <= nowSeconds) return false;

  const actual = Buffer.from(match[2], "base64url");
  const expected = Buffer.from(signatureFor(expiresAtSeconds, passwordHash), "base64url");
  return equalBuffers(actual, expected);
}
