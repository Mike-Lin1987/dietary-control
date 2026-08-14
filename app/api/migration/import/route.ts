import { getDb } from "../../../../db";
import { migrationState, userSettings } from "../../../../db/schema";
import { ApiError, DEFAULT_GOALS, errorResponse, getOwner, json, normalizeGoals, upsertFavorite, upsertMeal } from "../../_lib";

function unwrapPayload(payload: Record<string, unknown>) {
  const schemaVersion = payload.schemaVersion ?? payload.version ?? 1;
  if (typeof schemaVersion === "number" && schemaVersion > 2) {
    throw new ApiError(400, "UNSUPPORTED_SCHEMA", "這份資料來自較新的 NutriLens 版本，請先更新網站。");
  }
  const data = payload.data;
  return data && typeof data === "object" ? data as Record<string, unknown> : payload;
}

function flattenMeals(value: unknown) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([date, meals]) =>
    Array.isArray(meals) ? meals.map((meal) => ({ ...(meal as Record<string, unknown>), meal_date: (meal as Record<string, unknown>).meal_date || date })) : [],
  );
}

export async function POST(request: Request) {
  try {
    const owner = await getOwner(request);
    const payload = (await request.json()) as Record<string, unknown>;
    const data = unwrapPayload(payload);
    const db = getDb();
    const rawGoals = data.goals as Record<string, unknown> | undefined;
    const goals = rawGoals ? normalizeGoals(rawGoals) : null;
    if (goals) {
      await db.insert(userSettings).values({
        ownerId: owner.ownerId,
        calories: goals.calories ?? DEFAULT_GOALS.calories,
        proteinG: goals.protein_g ?? DEFAULT_GOALS.protein_g,
        fatG: goals.fat_g ?? DEFAULT_GOALS.fat_g,
        carbsG: goals.carbs_g ?? DEFAULT_GOALS.carbs_g,
        saveMealPhotos: goals.save_meal_photos,
        updatedAt: new Date().toISOString(),
      }).onConflictDoUpdate({
        target: userSettings.ownerId,
        set: {
          calories: goals.calories ?? DEFAULT_GOALS.calories,
          proteinG: goals.protein_g ?? DEFAULT_GOALS.protein_g,
          fatG: goals.fat_g ?? DEFAULT_GOALS.fat_g,
          carbsG: goals.carbs_g ?? DEFAULT_GOALS.carbs_g,
          saveMealPhotos: goals.save_meal_photos,
          updatedAt: new Date().toISOString(),
        },
      }).run();
    }

    const mealInputs = flattenMeals(data.meals);
    const favoriteInputs = Array.isArray(data.favorites) ? data.favorites : [];
    if (mealInputs.length > 5000 || favoriteInputs.length > 1000) {
      throw new ApiError(400, "IMPORT_TOO_LARGE", "匯入資料筆數超過上限，請分批處理。");
    }
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
