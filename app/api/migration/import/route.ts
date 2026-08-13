import { getDb } from "../../../../db";
import { migrationState, userSettings } from "../../../../db/schema";
import { errorResponse, finiteNumber, getOwner, json, upsertFavorite, upsertMeal } from "../../_lib";

export async function POST(request: Request) {
  try {
    const owner = await getOwner(request);
    const payload = (await request.json()) as Record<string, unknown>;
    const db = getDb();
    const goals = payload.goals as Record<string, unknown> | undefined;
    if (goals) {
      await db.insert(userSettings).values({
        ownerId: owner.ownerId,
        calories: finiteNumber(goals.calories, 1500),
        proteinG: finiteNumber(goals.protein_g, 120),
        fatG: finiteNumber(goals.fat_g, 50),
        carbsG: finiteNumber(goals.carbs_g, 200),
        updatedAt: new Date().toISOString(),
      }).onConflictDoUpdate({
        target: userSettings.ownerId,
        set: {
          calories: finiteNumber(goals.calories, 1500),
          proteinG: finiteNumber(goals.protein_g, 120),
          fatG: finiteNumber(goals.fat_g, 50),
          carbsG: finiteNumber(goals.carbs_g, 200),
          updatedAt: new Date().toISOString(),
        },
      }).run();
    }

    const mealInputs = Array.isArray(payload.meals) ? payload.meals : [];
    const favoriteInputs = Array.isArray(payload.favorites) ? payload.favorites : [];
    for (const meal of mealInputs) await upsertMeal(db, owner.ownerId, meal as Record<string, unknown>);
    for (const favorite of favoriteInputs) await upsertFavorite(db, owner.ownerId, favorite as Record<string, unknown>);

    if (payload.complete && typeof payload.snapshotHash === "string") {
      await db.insert(migrationState).values({
        ownerId: owner.ownerId,
        snapshotHash: payload.snapshotHash,
        countsJson: JSON.stringify({ meals: mealInputs.length, favorites: favoriteInputs.length }),
        importedAt: new Date().toISOString(),
      }).onConflictDoUpdate({
        target: migrationState.ownerId,
        set: {
          snapshotHash: payload.snapshotHash,
          countsJson: JSON.stringify({ meals: mealInputs.length, favorites: favoriteInputs.length }),
          importedAt: new Date().toISOString(),
        },
      }).run();
    }

    return json({ ok: true, imported: { meals: mealInputs.length, favorites: favoriteInputs.length } });
  } catch (error) {
    return errorResponse(error);
  }
}
