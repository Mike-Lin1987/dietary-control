import assert from "node:assert/strict";
import test from "node:test";

import { createAccessHandlers } from "../app/access-api.js";
import { deriveAccessCodeHash } from "../app/access-session.js";

const issuedAt = Date.parse("2026-08-14T00:00:00.000Z");

async function configuredHandlers(version = "1") {
  const code = "NutriLens-Shared-2026";
  const salt = "configured-test-salt";
  const expectedHash = await deriveAccessCodeHash(code, salt);
  const handlers = createAccessHandlers({
    now: () => issuedAt,
    getConfig: () => ({
      expectedHash,
      salt,
      sessionSecret: "test-session-secret-that-is-long-enough",
      version,
    }),
  });
  return { code, handlers };
}

test("access handlers activate a device for one year and report authorization", async () => {
  const { code, handlers } = await configuredHandlers();
  const anonymous = await handlers.GET(new Request("https://app.test/api/access"));
  assert.deepEqual(await anonymous.json(), { authorized: false });

  const rejected = await handlers.POST(new Request("https://app.test/api/access", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "definitely-wrong" }),
  }));
  assert.equal(rejected.status, 401);

  const activated = await handlers.POST(new Request("https://app.test/api/access", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  }));
  assert.equal(activated.status, 200);
  const setCookie = activated.headers.get("set-cookie");
  assert.match(setCookie, /^nutrilens_access=/);
  assert.match(setCookie, /Max-Age=31536000/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Lax/);

  const cookie = setCookie.split(";")[0];
  const authorized = await handlers.GET(new Request("https://app.test/api/access", { headers: { cookie } }));
  const payload = await authorized.json();
  assert.equal(payload.authorized, true);
  assert.equal(payload.expiresAt, issuedAt + 365 * 24 * 60 * 60 * 1000);
});

test("access handlers revoke old code versions and can remove the device cookie", async () => {
  const { code, handlers } = await configuredHandlers("1");
  const activated = await handlers.POST(new Request("https://app.test/api/access", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  }));
  const cookie = activated.headers.get("set-cookie").split(";")[0];

  const { handlers: rotated } = await configuredHandlers("2");
  const status = await rotated.GET(new Request("https://app.test/api/access", { headers: { cookie } }));
  assert.deepEqual(await status.json(), { authorized: false });

  const removed = await handlers.DELETE(new Request("https://app.test/api/access", { method: "DELETE" }));
  assert.equal(removed.status, 200);
  assert.match(removed.headers.get("set-cookie"), /Max-Age=0/);
});
