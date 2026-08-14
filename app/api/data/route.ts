import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { favorites, meals, migrationState, userSettings } from "../../../db/schema";
import { ApiError, errorResponse, getOwner, getPhotosBucket, json } from "../_lib";

type PhotoListPage = { objects?: Array<{ key?: string }>; truncated?: boolean; cursor?: string };
type PhotosBucket = { list?: (options: Record<string, unknown>) => Promise<PhotoListPage>; delete?: (keys: string[]) => Promise<void> };

export async function DELETE(request: Request) {
  try {
    if (request.headers.get("x-nutrilens-confirm-cloud-delete") !== "DELETE_MY_CLOUD_COPY") {
      throw new ApiError(400, "CONFIRMATION_REQUIRED", "刪除雲端副本前需要明確確認。 ");
    }
    const owner = await getOwner(request);
    const db = getDb();
    await db.delete(meals).where(eq(meals.ownerId, owner.ownerId)).run();
    await db.delete(favorites).where(eq(favorites.ownerId, owner.ownerId)).run();
    await db.delete(userSettings).where(eq(userSettings.ownerId, owner.ownerId)).run();
    await db.delete(migrationState).where(eq(migrationState.ownerId, owner.ownerId)).run();

    const bucket = getPhotosBucket() as PhotosBucket | undefined;
    if (bucket?.list && bucket.delete) {
      let cursor: string | undefined;
      do {
        const page = await bucket.list({ prefix: `photos/${owner.ownerId}/`, ...(cursor ? { cursor } : {}) });
        const keys = Array.isArray(page?.objects) ? page.objects.map((object) => object.key).filter((key): key is string => Boolean(key)) : [];
        if (keys.length) await bucket.delete(keys);
        cursor = page?.truncated ? page.cursor : undefined;
      } while (cursor);
    }

    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
