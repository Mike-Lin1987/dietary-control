let favoriteCache = [];
let onFavoritesChanged = () => {};

const DEFAULT_FAVORITES = [
  {
    id: "fav_yogurt_cup",
    name: "優格水果堅果杯",
    description: "希臘優格、燕麥、藍莓、核桃、奇亞籽",
    foods: [
      { name: "希臘優格", portion: "170g", calories: 102, protein_g: 10, fat_g: 5, carbs_g: 4 },
      { name: "燕麥", portion: "20g", calories: 75, protein_g: 2.5, fat_g: 1.5, carbs_g: 13 },
      { name: "藍莓", portion: "40g", calories: 22, protein_g: 0.4, fat_g: 0.2, carbs_g: 5 },
      { name: "核桃", portion: "15g", calories: 86, protein_g: 2.6, fat_g: 7, carbs_g: 4 },
      { name: "奇亞籽", portion: "15g", calories: 73, protein_g: 2.4, fat_g: 4.6, carbs_g: 6.3 },
    ],
    total_calories: 358,
    total_protein_g: 17.9,
    total_fat_g: 18.3,
    total_carbs_g: 32.9,
  },
  {
    id: "fav_boiled_egg",
    name: "水煮蛋",
    description: "水煮蛋 1 顆",
    foods: [{ name: "水煮蛋", portion: "1 顆（50g）", calories: 78, protein_g: 6, fat_g: 5, carbs_g: 0.6 }],
    total_calories: 78,
    total_protein_g: 6,
    total_fat_g: 5,
    total_carbs_g: 0.6,
  },
];

async function request(path, init = {}) {
  const response = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "常用餐點同步失敗。");
  return data;
}

export function setOnFavoritesChanged(callback) { onFavoritesChanged = typeof callback === "function" ? callback : () => {}; }
export function stopFavoritesSync() {}
export function getAllFavorites() { return [...favoriteCache]; }
export function getFavoriteById(id) { return favoriteCache.find((favorite) => favorite.id === id) || null; }

export async function startFavoritesSync() {
  const data = await request("/api/favorites", { method: "GET" });
  favoriteCache = Array.isArray(data.favorites) ? data.favorites : [];
  if (favoriteCache.length === 0) {
    const seeded = [];
    for (const favorite of DEFAULT_FAVORITES) {
      const created = await request("/api/favorites", { method: "POST", body: JSON.stringify(favorite) });
      seeded.push(created.favorite || favorite);
    }
    favoriteCache = seeded;
  }
  onFavoritesChanged();
  return favoriteCache;
}

export async function addFavorite(favorite) {
  const data = await request("/api/favorites", { method: "POST", body: JSON.stringify(favorite) });
  const saved = data.favorite || { ...favorite, id: favorite.id || crypto.randomUUID() };
  favoriteCache = [saved, ...favoriteCache.filter((item) => item.id !== saved.id)]; onFavoritesChanged(); return saved;
}

export async function updateFavorite(id, patch) {
  const data = await request(`/api/favorites/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
  const updated = data.favorite || { ...getFavoriteById(id), ...patch, id };
  favoriteCache = favoriteCache.map((item) => item.id === id ? updated : item); onFavoritesChanged(); return updated;
}

export async function deleteFavorite(id) {
  await request(`/api/favorites/${encodeURIComponent(id)}`, { method: "DELETE" });
  favoriteCache = favoriteCache.filter((item) => item.id !== id); onFavoritesChanged();
}
