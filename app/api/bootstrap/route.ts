import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { favorites, meals } from "../../../db/schema";
import { DEFAULT_GOALS, ensureSettings, errorResponse, getOwner, json, rowToFavorite, rowToMeal } from "../_lib";

export async function GET(request: Request) {
  try {
    const owner = await getOwner(request);
    const db = getDb();
    const settings = await ensureSettings(db, owner.ownerId);
    const [mealRows, favoriteRows] = await Promise.all([
      db.select().from(meals).where(eq(meals.ownerId, owner.ownerId)).orderBy(desc(meals.mealDate), desc(meals.eatenAt), desc(meals.timestamp)),
      db.select().from(favorites).where(eq(favorites.ownerId, owner.ownerId)).orderBy(desc(favorites.pinned), asc(favorites.sortOrder), desc(favorites.lastUsedAt), desc(favorites.updatedAt)),
    ]);

    const groupedMeals: Record<string, ReturnType<typeof rowToMeal>[]> = {};
    for (const meal of mealRows.map(rowToMeal)) {
      (groupedMeals[meal.meal_date] ||= []).push(meal);
    }

    return json({
      owner: { email: owner.email },
      goals: {
        calories: settings?.calories ?? DEFAULT_GOALS.calories,
        protein_g: settings?.proteinG ?? DEFAULT_GOALS.protein_g,
        fat_g: settings?.fatG ?? DEFAULT_GOALS.fat_g,
        carbs_g: settings?.carbsG ?? DEFAULT_GOALS.carbs_g,
        save_meal_photos: Boolean(settings?.saveMealPhotos),
      },
      meals: groupedMeals,
      favorites: favoriteRows.map(rowToFavorite),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
