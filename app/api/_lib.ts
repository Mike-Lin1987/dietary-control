/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../db";
import { favorites, meals, userSettings } from "../../db/schema";

export type Owner = { email: string; ownerId: string };
export type AppDb = ReturnType<typeof getDb>;

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    headers: { "cache-control": "no-store", ...(init?.headers ?? {}) },
    ...init,
  });
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }

  console.error(error);
  return json(
    { error: { code: "INTERNAL_ERROR", message: "服務暫時無法完成此操作。" } },
    { status: 500 },
  );
}

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getOwner(request: Request): Promise<Owner> {
  const headerEmail = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  const email = headerEmail || (isLocalRequest(request) ? "dev@local.invalid" : "");
  if (!email || !email.includes("@")) {
    throw new ApiError(401, "AUTH_REQUIRED", "請先以允許的 ChatGPT 帳號開啟網站。 ");
  }

  return { email, ownerId: await sha256Hex(email) };
}

export function runtimeValue(key: string) {
  const runtime = (env ?? {}) as unknown as Record<string, unknown>;
  const value = runtime[key];
  if (typeof value === "string" && value) return value;

  const processEnv = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return processEnv?.[key];
}

export function getPhotosBucket() {
  const runtime = (env ?? {}) as unknown as Record<string, unknown>;
  return runtime.PHOTOS as any;
}

export const DEFAULT_GOALS = { calories: 2000, protein_g: 130, fat_g: 60, carbs_g: 200 };

export function normalizeGoals(input: Record<string, unknown> | undefined) {
  return {
    calories: finiteNumber(input?.calories, DEFAULT_GOALS.calories),
    protein_g: finiteNumber(input?.protein_g, DEFAULT_GOALS.protein_g),
    fat_g: finiteNumber(input?.fat_g, DEFAULT_GOALS.fat_g),
    carbs_g: finiteNumber(input?.carbs_g, DEFAULT_GOALS.carbs_g),
    save_meal_photos: input?.save_meal_photos === true || input?.save_meal_photos === 1,
  };
}

export function assertValidGoals(goals: ReturnType<typeof normalizeGoals>) {
  const limits: Record<keyof typeof goals, [number, number]> = {
    calories: [500, 10000],
    protein_g: [0, 1000],
    fat_g: [0, 1000],
    carbs_g: [0, 2000],
    save_meal_photos: [0, 1],
  };
  for (const key of Object.keys(limits) as Array<keyof typeof goals>) {
    if (key === "save_meal_photos") continue;
    const [min, max] = limits[key];
    if (goals[key] < min || goals[key] > max) {
      throw new ApiError(400, "INVALID_GOAL", "每日目標必須落在合理範圍內。");
    }
  }
}

export function parseArray(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function finiteNumber(value: unknown, fallback = 0) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function inputNumber(input: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (input[key] !== undefined && input[key] !== null && input[key] !== "") return finiteNumber(input[key]);
  }
  return 0;
}

function normalizeFoods(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const food = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const quantity = food.quantity ?? food.amount;
    const unit = String(food.unit ?? "").trim();
    const portion = String(food.portion ?? food.serving ?? (quantity !== undefined && unit ? `${quantity}${unit}` : ""));
    return {
      ...food,
      name: String(food.name ?? food.food_name ?? "未命名項目"),
      portion,
      ...(quantity !== undefined ? { quantity: finiteNumber(quantity, 1) } : {}),
      ...(unit ? { unit } : {}),
      ...(food.weight_grams !== undefined || food.weight !== undefined ? { weight_grams: inputNumber(food, "weight_grams", "weight") } : {}),
      calories: inputNumber(food, "calories", "kcal"),
      protein_g: inputNumber(food, "protein_g", "protein"),
      fat_g: inputNumber(food, "fat_g", "fat"),
      carbs_g: inputNumber(food, "carbs_g", "carbs", "carbohydrates"),
      source: String(food.source ?? "import").trim() || "import",
      confidence: String(food.confidence ?? (food.uncertain === true ? "low" : "medium")),
    };
  });
}

export function rowToMeal(row: any) {
  const eatenAt = row.eatenAt || row.timestamp;
  return {
    id: row.id,
    meal_date: row.mealDate,
    timestamp: row.timestamp,
    eaten_at: eatenAt,
    meal_type: row.mealType,
    foods: normalizeFoods(parseArray(row.foodsJson)),
    total_calories: row.totalCalories,
    total_protein_g: row.totalProteinG,
    total_fat_g: row.totalFatG,
    total_carbs_g: row.totalCarbsG,
    confidence: row.confidence,
    notes: row.notes,
    photo_thumbnail: row.photoKey ? `/api/meals/${encodeURIComponent(row.id)}/photo` : null,
  };
}

export function rowToFavorite(row: any) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    foods: normalizeFoods(parseArray(row.foodsJson)),
    total_calories: row.totalCalories,
    total_protein_g: row.totalProteinG,
    total_fat_g: row.totalFatG,
    total_carbs_g: row.totalCarbsG,
    category: row.category || "",
    pinned: Boolean(row.pinned),
    sort_order: row.sortOrder || 0,
    last_used_at: row.lastUsedAt || null,
    updated_at: row.updatedAt || null,
  };
}

export async function ensureSettings(db: AppDb, ownerId: string) {
  await db.insert(userSettings).values({
    ownerId,
    calories: DEFAULT_GOALS.calories,
    proteinG: DEFAULT_GOALS.protein_g,
    fatG: DEFAULT_GOALS.fat_g,
    carbsG: DEFAULT_GOALS.carbs_g,
  }).onConflictDoNothing().run();
  return db.select().from(userSettings).where(eq(userSettings.ownerId, ownerId)).get();
}

function parseDataUrl(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("data:")) return null;
  const match = value.match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) return null;
  try {
    return { mimeType: match[1], bytes: Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0)) };
  } catch {
    return null;
  }
}

export async function putPhoto(ownerId: string, mealId: string, value: unknown) {
  const parsed = parseDataUrl(value);
  const bucket = getPhotosBucket();
  if (!parsed || !bucket) return { photoKey: null, photoMimeType: null };

  const photoKey = `photos/${ownerId}/${mealId}.jpg`;
  await bucket.put(photoKey, parsed.bytes, { httpMetadata: { contentType: parsed.mimeType } });
  return { photoKey, photoMimeType: parsed.mimeType };
}

export async function upsertMeal(db: AppDb, ownerId: string, input: Record<string, unknown>) {
  const id = String(input.id || crypto.randomUUID());
  const now = new Date().toISOString();
  const eatenAt = String(input.eaten_at || input.eatenAt || input.timestamp || input.created_at || now);
  const mealDate = String(input.meal_date || input.date || input.mealDate || eatenAt.slice(0, 10));
  const photo = input.save_photo === true ? await putPhoto(ownerId, id, input.photo_thumbnail) : { photoKey: null, photoMimeType: null };
  const row = {
    ownerId,
    id,
    mealDate,
    timestamp: String(input.timestamp || eatenAt || now),
    eatenAt,
    mealType: String(input.meal_type || input.mealType || "其他"),
    foodsJson: JSON.stringify(normalizeFoods(input.foods)),
    totalCalories: inputNumber(input, "total_calories", "totalCalories", "calories"),
    totalProteinG: inputNumber(input, "total_protein_g", "totalProteinG", "protein_g"),
    totalFatG: inputNumber(input, "total_fat_g", "totalFatG", "fat_g"),
    totalCarbsG: inputNumber(input, "total_carbs_g", "totalCarbsG", "carbs_g"),
    confidence: String(input.confidence || "medium"),
    notes: String(input.notes || ""),
    ...(photo.photoKey ? photo : {}),
    updatedAt: now,
  };

  await db.insert(meals).values(row).onConflictDoUpdate({
    target: [meals.ownerId, meals.id],
    set: row,
  }).run();

  return db.select().from(meals).where(and(eq(meals.ownerId, ownerId), eq(meals.id, id))).get();
}

export async function upsertFavorite(db: AppDb, ownerId: string, input: Record<string, unknown>) {
  const id = String(input.id || `fav_${crypto.randomUUID()}`);
  const row = {
    ownerId,
    id,
    name: String(input.name || "未命名餐點"),
    description: String(input.description || ""),
    foodsJson: JSON.stringify(normalizeFoods(input.foods)),
    totalCalories: inputNumber(input, "total_calories", "totalCalories", "calories"),
    totalProteinG: inputNumber(input, "total_protein_g", "totalProteinG", "protein_g"),
    totalFatG: inputNumber(input, "total_fat_g", "totalFatG", "fat_g"),
    totalCarbsG: inputNumber(input, "total_carbs_g", "totalCarbsG", "carbs_g"),
    category: String(input.category || ""),
    pinned: input.pinned === true || input.pinned === 1,
    sortOrder: Math.max(0, Math.trunc(finiteNumber(input.sort_order))),
    lastUsedAt: typeof input.last_used_at === "string" && input.last_used_at ? input.last_used_at : null,
    updatedAt: new Date().toISOString(),
  };

  await db.insert(favorites).values(row).onConflictDoUpdate({
    target: [favorites.ownerId, favorites.id],
    set: row,
  }).run();

  return db.select().from(favorites).where(and(eq(favorites.ownerId, ownerId), eq(favorites.id, id))).get();
}
