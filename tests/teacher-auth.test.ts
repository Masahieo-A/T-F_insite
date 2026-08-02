import test from "node:test";
import assert from "node:assert/strict";
import {
  createTeacherAuthToken,
  isSha256Hex,
  sha256Hex,
  verifyTeacherAuthToken,
  verifyTeacherPassword,
} from "../lib/teacherAuth.ts";

const password = "teacher-test-password";
const passwordHash = sha256Hex(password);

test("教員パスワードはSHA-256ハッシュと定数時間比較する", () => {
  assert.equal(isSha256Hex(passwordHash), true);
  assert.equal(verifyTeacherPassword(password, passwordHash), true);
  assert.equal(verifyTeacherPassword("wrong-password", passwordHash), false);
  assert.equal(verifyTeacherPassword(password, "not-a-sha256-hash"), false);
});

test("署名付き認証トークンは有効期限内のみ有効", () => {
  const token = createTeacherAuthToken(10_000, passwordHash);

  assert.equal(verifyTeacherAuthToken(token, passwordHash, 9_999), true);
  assert.equal(verifyTeacherAuthToken(token, passwordHash, 10_000), false);
  assert.equal(verifyTeacherAuthToken(token, passwordHash, 10_001), false);
});

test("認証トークンの期限・署名・署名鍵の改ざんを拒否する", () => {
  const token = createTeacherAuthToken(10_000, passwordHash);
  const parts = token.split(".");
  const tamperedExpiry = `v1.10001.${parts[2]}`;
  const tamperedSignature = `${parts[0]}.${parts[1]}.${"A".repeat(43)}`;

  assert.equal(verifyTeacherAuthToken(tamperedExpiry, passwordHash, 9_000), false);
  assert.equal(verifyTeacherAuthToken(tamperedSignature, passwordHash, 9_000), false);
  assert.equal(verifyTeacherAuthToken(token, sha256Hex("another-secret"), 9_000), false);
  assert.equal(verifyTeacherAuthToken("invalid-token", passwordHash, 9_000), false);
});

test("トークン作成時に不正な期限とハッシュを拒否する", () => {
  assert.throws(() => createTeacherAuthToken(0, passwordHash), /positive integer/);
  assert.throws(() => createTeacherAuthToken(10_000, "invalid"), /SHA-256/);
});
