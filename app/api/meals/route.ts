import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { meals } from "../../../db/schema";
import { errorResponse, getOwner, json, rowToMeal, upsertMeal } from "../_lib";

export async function GET(request: Request) {
  try {
    const owner = await getOwner(request);
    const rows = await getDb().select().from(meals).where(eq(meals.ownerId, owner.ownerId));
    return json({ meals: rows.map(rowToMeal) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const owner = await getOwner(request);
    const row = await upsertMeal(getDb(), owner.ownerId, (await request.json()) as Record<string, unknown>);
    return json({ meal: row ? rowToMeal(row) : null }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const owner = await getOwner(request);
    await getDb().delete(meals).where(eq(meals.ownerId, owner.ownerId)).run();
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
