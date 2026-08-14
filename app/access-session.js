const encoder = new TextEncoder();
const decoder = new TextDecoder();
const PBKDF2_ITERATIONS = 210_000;

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function equalBytes(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export async function deriveAccessCodeHash(code, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(code), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return bytesToBase64Url(new Uint8Array(bits));
}

export async function verifyAccessCode(code, { expectedHash, salt }) {
  if (typeof code !== "string" || code.length < 12 || typeof expectedHash !== "string" || !expectedHash || typeof salt !== "string" || !salt) return false;
  try {
    const actual = base64UrlToBytes(await deriveAccessCodeHash(code, salt));
    return equalBytes(actual, base64UrlToBytes(expectedHash));
  } catch {
    return false;
  }
}

export async function createAccessToken({ version, expiresAt }, secret) {
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify({ v: String(version), exp: Number(expiresAt) })));
  const signature = bytesToBase64Url(await hmac(payload, secret));
  return `${payload}.${signature}`;
}

export async function verifyAccessToken(token, { version, now = Date.now(), secret }) {
  const invalid = { valid: false };
  if (typeof token !== "string" || typeof secret !== "string" || !secret) return invalid;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return invalid;

  try {
    const expectedSignature = await hmac(parts[0], secret);
    if (!equalBytes(expectedSignature, base64UrlToBytes(parts[1]))) return invalid;
    const payload = JSON.parse(decoder.decode(base64UrlToBytes(parts[0])));
    const expiresAt = Number(payload.exp);
    if (payload.v !== String(version) || !Number.isFinite(expiresAt) || expiresAt <= Number(now)) return invalid;
    return { valid: true, expiresAt };
  } catch {
    return invalid;
  }
}

export const accessSessionConstants = {
  cookieName: "nutrilens_access",
  maxAgeSeconds: 365 * 24 * 60 * 60,
  pbkdf2Iterations: PBKDF2_ITERATIONS,
};
