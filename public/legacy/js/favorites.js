let favoriteCache = [];
let onFavoritesChanged = () => {};

window.addEventListener('nutrilens:data-cleared', () => {
  favoriteCache = [];
  onFavoritesChanged();
});

async function request(path, init = {}) {
  const response = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "常用餐點同步失敗。");
  return data;
}

export function setOnFavoritesChanged(callback) { onFavoritesChanged = typeof callback === "function" ? callback : () => {}; }
export function stopFavoritesSync() {}
export function getAllFavorites() { return [...favoriteCache]; }
export function clearFavoritesCache() { favoriteCache = []; onFavoritesChanged(); }
export function getFavoriteById(id) { return favoriteCache.find((favorite) => favorite.id === id) || null; }

export async function startFavoritesSync() {
  const data = await request("/api/favorites", { method: "GET" });
  favoriteCache = Array.isArray(data.favorites) ? data.favorites : [];
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
