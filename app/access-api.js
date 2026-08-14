import {
  accessSessionConstants,
  createAccessToken,
  verifyAccessCode,
  verifyAccessToken,
} from "./access-session.js";

const ONE_YEAR_MS = accessSessionConstants.maxAgeSeconds * 1000;

function response(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });
}

function cookieValue(request, name) {
  const cookieHeader = request.headers.get("cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return "";
}

function activeConfig(getConfig) {
  const config = getConfig?.() || {};
  if (!config.expectedHash || !config.salt || !config.sessionSecret || !config.version) return null;
  return config;
}

export async function requestAccessStatus(request, { getConfig, now = () => Date.now() }) {
  const config = activeConfig(getConfig);
  if (!config) return { valid: false };
  const token = cookieValue(request, accessSessionConstants.cookieName);
  if (!token) return { valid: false };
  return verifyAccessToken(token, {
    version: config.version,
    now: now(),
    secret: config.sessionSecret,
  });
}

export function createAccessHandlers({ getConfig, now = () => Date.now() }) {
  return {
    async GET(request) {
      const status = await requestAccessStatus(request, { getConfig, now });
      return status.valid
        ? response({ authorized: true, expiresAt: status.expiresAt })
        : response({ authorized: false });
    },

    async POST(request) {
      const config = activeConfig(getConfig);
      if (!config) return response({ error: "允許碼服務尚未設定" }, 503);
      const payload = await request.json().catch(() => ({}));
      const valid = await verifyAccessCode(payload?.code, {
        expectedHash: config.expectedHash,
        salt: config.salt,
      });
      if (!valid) return response({ error: "允許碼不正確" }, 401);

      const expiresAt = now() + ONE_YEAR_MS;
      const token = await createAccessToken({ version: config.version, expiresAt }, config.sessionSecret);
      const cookie = [
        `${accessSessionConstants.cookieName}=${token}`,
        "Path=/",
        `Max-Age=${accessSessionConstants.maxAgeSeconds}`,
        "HttpOnly",
        "Secure",
        "SameSite=Lax",
      ].join("; ");
      return response({ authorized: true, expiresAt }, 200, { "set-cookie": cookie });
    },

    async DELETE() {
      const cookie = `${accessSessionConstants.cookieName}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
      return response({ authorized: false }, 200, { "set-cookie": cookie });
    },
  };
}
