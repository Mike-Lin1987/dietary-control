import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { meals } from "../../../../db/schema";
import { errorResponse, getOwner, json, rowToMeal, upsertMeal } from "../../_lib";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const owner = await getOwner(request);
    const id = (await context.params).id;
    const existing = await getDb().select().from(meals).where(and(eq(meals.ownerId, owner.ownerId), eq(meals.id, id))).get();
    if (!existing) return json({ error: { code: "NOT_FOUND", message: "找不到餐點紀錄。" } }, { status: 404 });
    const input = { ...rowToMeal(existing), ...(await request.json() as Record<string, unknown>), id };
    const row = await upsertMeal(getDb(), owner.ownerId, input);
    return json({ meal: row ? rowToMeal(row) : null });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const owner = await getOwner(request);
    const id = (await context.params).id;
    await getDb().delete(meals).where(and(eq(meals.ownerId, owner.ownerId), eq(meals.id, id))).run();
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
