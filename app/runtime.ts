import { env } from "cloudflare:workers";

export function runtimeValue(key: string): string | undefined {
  const runtime = (env ?? {}) as unknown as Record<string, unknown>;
  const value = runtime[key];
  if (typeof value === "string" && value) return value;

  const processEnv = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return processEnv?.[key];
}
