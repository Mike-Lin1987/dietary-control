import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { favorites, meals } from "../../../db/schema";
import { ensureSettings, errorResponse, getOwner, json, rowToFavorite, rowToMeal } from "../_lib";

export async function GET(request: Request) {
  try {
    const owner = await getOwner(request);
    const db = getDb();
    const settings = await ensureSettings(db, owner.ownerId);
    const [mealRows, favoriteRows] = await Promise.all([
      db.select().from(meals).where(eq(meals.ownerId, owner.ownerId)).orderBy(desc(meals.mealDate), desc(meals.timestamp)),
      db.select().from(favorites).where(eq(favorites.ownerId, owner.ownerId)).orderBy(desc(favorites.updatedAt)),
    ]);

    const groupedMeals: Record<string, ReturnType<typeof rowToMeal>[]> = {};
    for (const meal of mealRows.map(rowToMeal)) {
      (groupedMeals[meal.meal_date] ||= []).push(meal);
    }

    return json({
      owner: { email: owner.email },
      goals: {
        calories: settings?.calories ?? 1500,
        protein_g: settings?.proteinG ?? 120,
        fat_g: settings?.fatG ?? 50,
        carbs_g: settings?.carbsG ?? 200,
      },
      meals: groupedMeals,
      favorites: favoriteRows.map(rowToFavorite),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
