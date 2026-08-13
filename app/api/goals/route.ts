import { getDb } from "../../../db";
import { userSettings } from "../../../db/schema";
import { errorResponse, finiteNumber, getOwner, json } from "../_lib";

export async function PUT(request: Request) {
  try {
    const owner = await getOwner(request);
    const payload = (await request.json()) as Record<string, unknown>;
    const db = getDb();
    await db.insert(userSettings).values({
      ownerId: owner.ownerId,
      calories: finiteNumber(payload.calories, 1500),
      proteinG: finiteNumber(payload.protein_g, 120),
      fatG: finiteNumber(payload.fat_g, 50),
      carbsG: finiteNumber(payload.carbs_g, 200),
      updatedAt: new Date().toISOString(),
    }).onConflictDoUpdate({
      target: userSettings.ownerId,
      set: {
        calories: finiteNumber(payload.calories, 1500),
        proteinG: finiteNumber(payload.protein_g, 120),
        fatG: finiteNumber(payload.fat_g, 50),
        carbsG: finiteNumber(payload.carbs_g, 200),
        updatedAt: new Date().toISOString(),
      },
    }).run();
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
