import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../../db";
import { meals } from "../../../../../db/schema";
import { ApiError, errorResponse, getOwner } from "../../../_lib";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const owner = await getOwner(request);
    const id = (await context.params).id;
    const row = await getDb().select().from(meals).where(and(eq(meals.ownerId, owner.ownerId), eq(meals.id, id))).get();
    if (!row?.photoKey) throw new ApiError(404, "PHOTO_NOT_FOUND", "找不到餐點照片。");
    const bucket = (env as unknown as { PHOTOS?: R2Bucket }).PHOTOS;
    if (!bucket) throw new ApiError(503, "PHOTO_STORAGE_UNAVAILABLE", "照片儲存服務尚未啟用。");
    const object = await bucket.get(row.photoKey);
    if (!object) throw new ApiError(404, "PHOTO_NOT_FOUND", "找不到餐點照片。");
    return new Response(object.body, {
      headers: {
        "cache-control": "private, max-age=3600",
        "content-type": row.photoMimeType || "image/jpeg",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
