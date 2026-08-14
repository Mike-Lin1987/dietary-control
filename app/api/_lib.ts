export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    headers: { "cache-control": "no-store", ...(init?.headers ?? {}) },
    ...init,
  });
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }

  console.error(error);
  return json(
    { error: { code: "INTERNAL_ERROR", message: "服務暫時無法完成此操作。" } },
    { status: 500 },
  );
}
