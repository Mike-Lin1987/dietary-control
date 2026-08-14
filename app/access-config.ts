import { runtimeValue } from "./runtime";

export type AccessConfig = {
  expectedHash: string;
  salt: string;
  sessionSecret: string;
  version: string;
};

export function getAccessConfig(): Partial<AccessConfig> {
  return {
    expectedHash: runtimeValue("NUTRILENS_ACCESS_CODE_HASH"),
    salt: runtimeValue("NUTRILENS_ACCESS_CODE_SALT"),
    sessionSecret: runtimeValue("NUTRILENS_ACCESS_SESSION_SECRET"),
    version: runtimeValue("NUTRILENS_ACCESS_CODE_VERSION") || "1",
  };
}
