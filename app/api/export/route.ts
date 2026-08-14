import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { favorites, meals, userSettings } from "../../../db/schema";
import { DEFAULT_GOALS, errorResponse, getOwner, getPhotosBucket, json, rowToFavorite, rowToMeal } from "../_lib";

type PhotoListPage = { objects?: Array<{ key?: string }>; truncated?: boolean; cursor?: string };
type PhotosBucket = { list?: (options: Record<string, unknown>) => Promise<PhotoListPage> };

async function countOwnerPhotos(ownerId: string) {
  const bucket = getPhotosBucket() as PhotosBucket | undefined;
  if (!bucket?.list) return 0;
  let count = 0;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: `photos/${ownerId}/`, ...(cursor ? { cursor } : {}) });
    count += Array.isArray(page.objects) ? page.objects.length : 0;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return count;
}

export async function GET(request: Request) {
  try {
    const owner = await getOwner(request);
    const db = getDb();
    const [settings, mealRows, favoriteRows, photoCount] = await Promise.all([
      db.select().from(userSettings).where(eq(userSettings.ownerId, owner.ownerId)).get(),
      db.select().from(meals).where(eq(meals.ownerId, owner.ownerId)).orderBy(desc(meals.mealDate), desc(meals.eatenAt), desc(meals.timestamp)),
      db.select().from(favorites).where(eq(favorites.ownerId, owner.ownerId)).orderBy(desc(favorites.updatedAt)),
      countOwnerPhotos(owner.ownerId),
    ]);
    const goals = {
      calories: settings?.calories ?? DEFAULT_GOALS.calories,
      protein_g: settings?.proteinG ?? DEFAULT_GOALS.protein_g,
      fat_g: settings?.fatG ?? DEFAULT_GOALS.fat_g,
      carbs_g: settings?.carbsG ?? DEFAULT_GOALS.carbs_g,
      save_meal_photos: Boolean(settings?.saveMealPhotos),
    };
    const data = {
      goals,
      meals: mealRows.map(rowToMeal),
      favorites: favoriteRows.map(rowToFavorite),
    };
    return json({
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      data,
      counts: { meals: mealRows.length, favorites: favoriteRows.length, settings: settings ? 1 : 0, photos: photoCount },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
