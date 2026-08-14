import { getDb } from "../../../db";
import { userSettings } from "../../../db/schema";
import { assertValidGoals, errorResponse, getOwner, json, normalizeGoals } from "../_lib";

export async function PUT(request: Request) {
  try {
    const owner = await getOwner(request);
    const payload = (await request.json()) as Record<string, unknown>;
    const goals = normalizeGoals(payload);
    assertValidGoals(goals);
    const db = getDb();
    await db.insert(userSettings).values({
      ownerId: owner.ownerId,
      calories: goals.calories,
      proteinG: goals.protein_g,
      fatG: goals.fat_g,
      carbsG: goals.carbs_g,
      saveMealPhotos: goals.save_meal_photos,
      updatedAt: new Date().toISOString(),
    }).onConflictDoUpdate({
      target: userSettings.ownerId,
      set: {
        calories: goals.calories,
        proteinG: goals.protein_g,
        fatG: goals.fat_g,
        carbsG: goals.carbs_g,
        saveMealPhotos: goals.save_meal_photos,
        updatedAt: new Date().toISOString(),
      },
    }).run();
    return json({ ok: true, goals });
  } catch (error) {
    return errorResponse(error);
  }
}
