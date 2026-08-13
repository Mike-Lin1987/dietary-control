import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { favorites } from "../../../../db/schema";
import { errorResponse, getOwner, json, rowToFavorite, upsertFavorite } from "../../_lib";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const owner = await getOwner(request);
    const id = (await context.params).id;
    const existing = await getDb().select().from(favorites).where(and(eq(favorites.ownerId, owner.ownerId), eq(favorites.id, id))).get();
    if (!existing) return json({ error: { code: "NOT_FOUND", message: "找不到常吃項目。" } }, { status: 404 });
    const input = { ...rowToFavorite(existing), ...(await request.json() as Record<string, unknown>), id };
    const row = await upsertFavorite(getDb(), owner.ownerId, input);
    return json({ favorite: row ? rowToFavorite(row) : null });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const owner = await getOwner(request);
    const id = (await context.params).id;
    await getDb().delete(favorites).where(and(eq(favorites.ownerId, owner.ownerId), eq(favorites.id, id))).run();
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
