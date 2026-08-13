import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { favorites } from "../../../db/schema";
import { errorResponse, getOwner, json, rowToFavorite, upsertFavorite } from "../_lib";

export async function GET(request: Request) {
  try {
    const owner = await getOwner(request);
    const rows = await getDb().select().from(favorites).where(eq(favorites.ownerId, owner.ownerId)).orderBy(desc(favorites.updatedAt));
    return json({ favorites: rows.map(rowToFavorite) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const owner = await getOwner(request);
    const row = await upsertFavorite(getDb(), owner.ownerId, (await request.json()) as Record<string, unknown>);
    return json({ favorite: row ? rowToFavorite(row) : null }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
