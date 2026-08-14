const PHOTO_KEYS = new Set(['photo', 'photo_key', 'photo_url', 'photo_thumbnail', 'photo_mime_type', 'save_photo', 'save_meal_photos']);

function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !PHOTO_KEYS.has(key)).map(([key, child]) => [key, clean(child)]));
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function comparable(data) {
  return clean({
    goals: data?.goals || {},
    meals: [...(Array.isArray(data?.meals) ? data.meals : [])].sort((left, right) => String(left.id).localeCompare(String(right.id))),
    favorites: [...(Array.isArray(data?.favorites) ? data.favorites : [])].sort((left, right) => String(left.id).localeCompare(String(right.id))),
  });
}

function pickShape(shape, value) {
  if (Array.isArray(shape)) return shape.map((child, index) => pickShape(child, value?.[index]));
  if (!shape || typeof shape !== 'object') return value;
  return Object.fromEntries(Object.keys(shape).map((key) => [key, pickShape(shape[key], value?.[key])]));
}

async function fingerprint(data) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(comparable(data))));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function defaultDownload(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `nutrilens-cloud-migration-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function responseData(response, fallback) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || fallback);
  return data;
}

export function createCloudMigration({ deviceData, fetch: request = globalThis.fetch, downloadBackup = defaultDownload }) {
  if (!deviceData) throw new Error('此瀏覽器不支援本機資料庫');

  async function migrate() {
    const response = await request('/api/export', { method: 'GET', cache: 'no-store' });
    const snapshot = await responseData(response, '無法取得舊雲端資料，請先用原本的 ChatGPT 帳號開啟網站');
    const preview = deviceData.previewImport(snapshot);
    if (!preview.ok) throw new Error(preview.reason || '舊雲端資料格式無法搬移');

    const sourceData = comparable(snapshot.data);
    const sourceHash = await fingerprint(sourceData);
    await deviceData.importSnapshot(snapshot);

    const mealIds = new Set(sourceData.meals.map((meal) => meal.id));
    const favoriteIds = new Set(sourceData.favorites.map((favorite) => favorite.id));
    const localMeals = new Map(deviceData.getAllMeals().filter((meal) => mealIds.has(meal.id)).map((meal) => [meal.id, meal]));
    const localFavorites = new Map(deviceData.getAllFavorites().filter((favorite) => favoriteIds.has(favorite.id)).map((favorite) => [favorite.id, favorite]));
    const localData = {
      goals: pickShape(sourceData.goals, deviceData.getGoals()),
      meals: sourceData.meals.map((meal) => pickShape(meal, localMeals.get(meal.id))),
      favorites: sourceData.favorites.map((favorite) => pickShape(favorite, localFavorites.get(favorite.id))),
    };
    const localHash = await fingerprint(localData);
    if (localData.meals.length !== preview.meals || localData.favorites.length !== preview.favorites || sourceHash !== localHash) {
      throw new Error('搬移後內容驗證失敗，雲端資料尚未刪除');
    }

    const backup = deviceData.exportSnapshot();
    downloadBackup(backup);
    await deviceData.markBackupCreated();
    return { verified: true, snapshotHash: sourceHash, counts: snapshot.counts || { meals: preview.meals, favorites: preview.favorites } };
  }

  async function deleteCloudCopy({ confirmed }) {
    if (!confirmed) throw new Error('刪除雲端副本前需要明確確認');
    const deletion = await request('/api/data', {
      method: 'DELETE',
      headers: { 'x-nutrilens-confirm-cloud-delete': 'DELETE_MY_CLOUD_COPY' },
    });
    await responseData(deletion, '雲端副本刪除失敗');
    const verification = await responseData(await request('/api/export', { method: 'GET', cache: 'no-store' }), '無法確認雲端資料已刪除');
    const counts = verification.counts || {};
    const verifiedZero = ['meals', 'favorites', 'settings', 'photos'].every((key) => Number(counts[key] || 0) === 0);
    if (!verifiedZero) throw new Error('雲端仍有資料，請不要重複操作並聯絡管理者');
    return { verifiedZero, counts };
  }

  return { migrate, deleteCloudCopy };
}
