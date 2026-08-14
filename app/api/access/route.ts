import { createAccessHandlers } from "../../access-api.js";
import { getAccessConfig } from "../../access-config";

const handlers = createAccessHandlers({ getConfig: getAccessConfig });

export const GET = handlers.GET;
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;
