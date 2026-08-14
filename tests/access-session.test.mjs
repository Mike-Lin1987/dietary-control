import assert from "node:assert/strict";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import test from "node:test";

import {
  createAccessToken,
  deriveAccessCodeHash,
  verifyAccessCode,
  verifyAccessToken,
} from "../app/access-session.js";

test("access code verification uses the configured PBKDF2 hash", async () => {
  const code = "NutriLens-Trusted-2026";
  const salt = "nutrilens-test-salt";
  const expected = pbkdf2Sync(code, salt, 100_000, 32, "sha256").toString("base64url");

  assert.equal(await deriveAccessCodeHash(code, salt), expected);
  assert.equal(await verifyAccessCode(code, { expectedHash: expected, salt }), true);
  assert.equal(await verifyAccessCode("wrong-code-value", { expectedHash: expected, salt }), false);
  assert.equal(await verifyAccessCode("short", { expectedHash: expected, salt }), false);
});

test("access code verification does not depend on base64 decoding globals", async () => {
  const code = "NutriLens-Edge-Compatible-2026";
  const salt = "nutrilens-edge-test-salt";
  const expected = pbkdf2Sync(code, salt, 100_000, 32, "sha256").toString("base64url");
  const originalAtob = globalThis.atob;

  globalThis.atob = undefined;
  try {
    assert.equal(await verifyAccessCode(code, { expectedHash: expected, salt }), true);
  } finally {
    globalThis.atob = originalAtob;
  }
});

test("access token rejects expiration, tampering, and an old access-code version", async () => {
  const secret = randomBytes(32).toString("base64url");
  const issuedAt = Date.parse("2026-08-14T00:00:00.000Z");
  const expiresAt = issuedAt + 365 * 24 * 60 * 60 * 1000;
  const token = await createAccessToken({ version: "4", expiresAt }, secret);

  assert.deepEqual(await verifyAccessToken(token, { version: "4", now: issuedAt, secret }), {
    valid: true,
    expiresAt,
  });
  assert.equal((await verifyAccessToken(token, { version: "5", now: issuedAt, secret })).valid, false);
  assert.equal((await verifyAccessToken(token, { version: "4", now: expiresAt + 1, secret })).valid, false);
  assert.equal((await verifyAccessToken(`${token}x`, { version: "4", now: issuedAt, secret })).valid, false);
});
