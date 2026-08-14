declare module "cloudflare:workers" {
  export const env: { [key: string]: unknown };
}

declare interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
