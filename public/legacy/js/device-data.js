const DEFAULT_DATABASE_NAME = 'nutrilens-device-v1';
const DATABASE_VERSION = 1;
const BACKUP_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_GOALS = { calories: 2000, protein_g: 130, fat_g: 60, carbs_g: 200 };
const PHOTO_FIELDS = new Set(['photo', 'photo_key', 'photo_url', 'photo_thumbnail', 'photo_mime_type', 'save_photo', 'save_meal_photos']);

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error || new Error('本機資料庫操作失敗')), { once: true });
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error || new Error('本機資料庫交易已取消')), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error || new Error('本機資料庫交易失敗')), { once: true });
  });
}

function openDatabase(indexedDBFactory, name) {
  return new Promise((resolve, reject) => {
    const request = indexedDBFactory.open(name, DATABASE_VERSION);
    request.addEventListener('upgradeneeded', () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('settings')) database.createObjectStore('settings', { keyPath: 'key' });
      if (!database.objectStoreNames.contains('meals')) {
        const meals = database.createObjectStore('meals', { keyPath: 'id' });
        meals.createIndex('meal_date', 'meal_date', { unique: false });
      }
      if (!database.objectStoreNames.contains('favorites')) database.createObjectStore('favorites', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('meta')) database.createObjectStore('meta', { keyPath: 'key' });
    });
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error || new Error('無法開啟本機資料庫')), { once: true });
    request.addEventListener('blocked', () => reject(new Error('請關閉其他 MealMori 分頁後再試一次')), { once: true });
  });
}

function withoutPhotoFields(value) {
  return Object.fromEntries(Object.entries(value || {}).filter(([key]) => !PHOTO_FIELDS.has(key)));
}

function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function normalizeGoals(value = {}) {
  const finite = (input, fallback) => Number.isFinite(Number(input)) ? Number(input) : fallback;
  return {
    calories: finite(value.calories, DEFAULT_GOALS.calories),
    protein_g: finite(value.protein_g ?? value.protein, DEFAULT_GOALS.protein_g),
    fat_g: finite(value.fat_g ?? value.fat, DEFAULT_GOALS.fat_g),
    carbs_g: finite(value.carbs_g ?? value.carbs, DEFAULT_GOALS.carbs_g),
  };
}

function normalizeMeal(value = {}, now = new Date()) {
  const clean = withoutPhotoFields(value);
  const timestamp = clean.timestamp || clean.eaten_at || now.toISOString();
  const date = clean.meal_date || clean.date || localDateKey(timestamp) || localDateKey(now);
  return {
    ...clean,
    id: clean.id || crypto.randomUUID(),
    meal_date: date,
    timestamp,
    eaten_at: clean.eaten_at || timestamp,
    meal_type: clean.meal_type || '其他',
    foods: Array.isArray(clean.foods) ? clean.foods.map(withoutPhotoFields) : [],
    total_calories: Number(clean.total_calories) || 0,
    total_protein_g: Number(clean.total_protein_g) || 0,
    total_fat_g: Number(clean.total_fat_g) || 0,
    total_carbs_g: Number(clean.total_carbs_g) || 0,
    notes: clean.notes || '',
  };
}

function normalizeFavorite(value = {}, now = new Date()) {
  const clean = withoutPhotoFields(value);
  return {
    ...clean,
    id: clean.id || crypto.randomUUID(),
    name: String(clean.name || '未命名常吃項目'),
    description: String(clean.description || ''),
    foods: Array.isArray(clean.foods) ? clean.foods.map(withoutPhotoFields) : [],
    total_calories: Number(clean.total_calories) || 0,
    total_protein_g: Number(clean.total_protein_g) || 0,
    total_fat_g: Number(clean.total_fat_g) || 0,
    total_carbs_g: Number(clean.total_carbs_g) || 0,
    category: String(clean.category || ''),
    pinned: clean.pinned === true,
    sort_order: Number(clean.sort_order) || 0,
    updated_at: clean.updated_at || now.toISOString(),
  };
}

function normalizeMealsInput(meals) {
  if (Array.isArray(meals)) return meals;
  if (meals && typeof meals === 'object') return Object.entries(meals).flatMap(([date, values]) => Array.isArray(values) ? values.map((meal) => ({ ...meal, meal_date: meal.meal_date || date })) : []);
  return [];
}

function parseSnapshot(payload) {
  const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const data = parsed?.data && typeof parsed.data === 'object' ? parsed.data : parsed;
  const schemaVersion = Number(parsed?.schemaVersion ?? parsed?.version ?? 1);
  if (!parsed || !data || !Number.isFinite(schemaVersion) || schemaVersion < 1 || schemaVersion > 3) throw new Error('備份版本不支援');
  if (!data.goals && !data.meals && !data.favorites) throw new Error('備份中沒有可匯入的資料');
  return { data, schemaVersion };
}

export function createDeviceData({ indexedDB: indexedDBFactory = globalThis.indexedDB, databaseName = DEFAULT_DATABASE_NAME, now = () => new Date() } = {}) {
  if (!indexedDBFactory) throw new Error('此瀏覽器不支援本機資料庫');
  let database;
  let goals = { ...DEFAULT_GOALS };
  let hasStoredGoals = false;
  let meals = new Map();
  let favorites = new Map();
  let meta = new Map();
  let onChanged = () => {};

  async function init() {
    database ||= await openDatabase(indexedDBFactory, databaseName);
    const transaction = database.transaction(['settings', 'meals', 'favorites', 'meta'], 'readonly');
    const [settingRows, mealRows, favoriteRows, metaRows] = await Promise.all([
      requestResult(transaction.objectStore('settings').getAll()),
      requestResult(transaction.objectStore('meals').getAll()),
      requestResult(transaction.objectStore('favorites').getAll()),
      requestResult(transaction.objectStore('meta').getAll()),
    ]);
    await transactionDone(transaction);
    const storedGoals = settingRows.find((row) => row.key === 'goals');
    hasStoredGoals = Boolean(storedGoals);
    goals = normalizeGoals(storedGoals?.value);
    meals = new Map(mealRows.map((meal) => [meal.id, meal]));
    favorites = new Map(favoriteRows.map((favorite) => [favorite.id, favorite]));
    meta = new Map(metaRows.map((entry) => [entry.key, entry.value]));
    onChanged();
    return getSnapshot();
  }

  function requireDatabase() {
    if (!database) throw new Error('本機資料尚未初始化');
    return database;
  }

  function getSnapshot() {
    return { goals: { ...goals }, meals: getAllMeals(), favorites: getAllFavorites() };
  }

  async function put(storeName, value) {
    const transaction = requireDatabase().transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value);
    await transactionDone(transaction);
  }

  async function remove(storeName, key) {
    const transaction = requireDatabase().transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(key);
    await transactionDone(transaction);
  }

  function getGoals() { return { ...goals }; }
  async function setGoals(value) {
    const next = normalizeGoals({ ...goals, ...value });
    await put('settings', { key: 'goals', value: next });
    goals = next; hasStoredGoals = true; onChanged(); return getGoals();
  }
  function getAllMeals() { return [...meals.values()].map((meal) => ({ ...meal })).sort((left, right) => String(right.eaten_at || right.timestamp).localeCompare(String(left.eaten_at || left.timestamp))); }
  function getMealsByDate(date) { return getAllMeals().filter((meal) => meal.meal_date === date).sort((left, right) => String(left.eaten_at || left.timestamp).localeCompare(String(right.eaten_at || right.timestamp))); }
  function getRecentMeals(limit = 6) { return getAllMeals().slice(0, limit); }
  async function saveMeal(value) {
    const meal = normalizeMeal(value, now());
    await put('meals', meal); meals.set(meal.id, meal); onChanged(); return { ...meal };
  }
  async function updateMeal(id, patch) {
    const current = meals.get(id);
    if (!current) throw new Error('找不到餐點紀錄');
    return saveMeal({ ...current, ...patch, id });
  }
  async function deleteMeal(id) { await remove('meals', id); meals.delete(id); onChanged(); }
  function getAllFavorites() { return [...favorites.values()].map((favorite) => ({ ...favorite })); }
  async function addFavorite(value) {
    const favorite = normalizeFavorite(value, now());
    await put('favorites', favorite); favorites.set(favorite.id, favorite); onChanged(); return { ...favorite };
  }
  async function updateFavorite(id, patch) {
    const current = favorites.get(id);
    if (!current) throw new Error('找不到常吃項目');
    return addFavorite({ ...current, ...patch, id, updated_at: now().toISOString() });
  }
  async function deleteFavorite(id) { await remove('favorites', id); favorites.delete(id); onChanged(); }

  function exportSnapshot() {
    return {
      schemaVersion: 3,
      storage: 'device',
      exportedAt: now().toISOString(),
      data: { goals: getGoals(), meals: getAllMeals(), favorites: getAllFavorites() },
    };
  }

  function previewImport(payload) {
    try {
      const { data, schemaVersion } = parseSnapshot(payload);
      const mealCount = new Set(normalizeMealsInput(data.meals).map((meal) => meal.id).filter(Boolean)).size;
      const favoriteCount = new Set((Array.isArray(data.favorites) ? data.favorites : []).map((favorite) => favorite.id).filter(Boolean)).size;
      return { ok: true, schemaVersion, meals: mealCount, favorites: favoriteCount, hasGoals: Boolean(data.goals) };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : '備份格式無法讀取' };
    }
  }

  async function importSnapshot(payload) {
    const { data } = parseSnapshot(payload);
    const importedMeals = new Map(normalizeMealsInput(data.meals).map((meal) => {
      const normalized = normalizeMeal(meal, now());
      return [normalized.id, normalized];
    }));
    const importedFavorites = new Map((Array.isArray(data.favorites) ? data.favorites : []).map((favorite) => {
      const normalized = normalizeFavorite(favorite, now());
      return [normalized.id, normalized];
    }));
    const importedGoals = data.goals ? normalizeGoals(data.goals) : null;
    const transaction = requireDatabase().transaction(['settings', 'meals', 'favorites', 'meta'], 'readwrite');
    if (importedGoals) transaction.objectStore('settings').put({ key: 'goals', value: importedGoals });
    for (const meal of importedMeals.values()) transaction.objectStore('meals').put(meal);
    for (const favorite of importedFavorites.values()) transaction.objectStore('favorites').put(favorite);
    transaction.objectStore('meta').put({ key: 'lastImportAt', value: now().toISOString() });
    await transactionDone(transaction);
    if (importedGoals) { goals = importedGoals; hasStoredGoals = true; }
    for (const [id, meal] of importedMeals) meals.set(id, meal);
    for (const [id, favorite] of importedFavorites) favorites.set(id, favorite);
    meta.set('lastImportAt', now().toISOString());
    onChanged();
    return { meals: importedMeals.size, favorites: importedFavorites.size, hasGoals: Boolean(importedGoals) };
  }

  function needsBackup() {
    if (!meals.size && !favorites.size && !hasStoredGoals) return false;
    const lastBackupAt = meta.get('lastBackupAt');
    if (!lastBackupAt) return true;
    return now().getTime() - new Date(lastBackupAt).getTime() >= BACKUP_INTERVAL_MS;
  }

  async function markBackupCreated() {
    const value = now().toISOString();
    await put('meta', { key: 'lastBackupAt', value });
    meta.set('lastBackupAt', value); onChanged();
  }

  async function clearAll() {
    const transaction = requireDatabase().transaction(['settings', 'meals', 'favorites', 'meta'], 'readwrite');
    for (const name of ['settings', 'meals', 'favorites', 'meta']) transaction.objectStore(name).clear();
    await transactionDone(transaction);
    goals = { ...DEFAULT_GOALS }; hasStoredGoals = false; meals.clear(); favorites.clear(); meta.clear(); onChanged();
  }

  return {
    init,
    getGoals,
    setGoals,
    getAllMeals,
    getMealsByDate,
    getRecentMeals,
    saveMeal,
    updateMeal,
    deleteMeal,
    getAllFavorites,
    addFavorite,
    updateFavorite,
    deleteFavorite,
    exportSnapshot,
    previewImport,
    importSnapshot,
    needsBackup,
    markBackupCreated,
    clearAll,
    setOnChanged(callback) { onChanged = typeof callback === 'function' ? callback : () => {}; },
  };
}

export const deviceData = globalThis.indexedDB ? createDeviceData() : null;
