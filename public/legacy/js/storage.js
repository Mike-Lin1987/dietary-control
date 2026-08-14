import { deviceData } from './device-data.js';

const DEFAULT_GOALS = { calories: 2000, protein_g: 130, fat_g: 60, carbs_g: 200 };
let initialized = false;
let onDataChanged = () => {};

function store() {
  if (!deviceData) throw new Error('此瀏覽器不支援本機資料庫');
  return deviceData;
}

function notify() {
  onDataChanged();
  window.dispatchEvent(new CustomEvent('nutrilens:device-data-changed'));
}

function downloadJson(payload, prefix = 'nutrilens-device-backup') {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${prefix}-${getTodayKey()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

export function setOnDataChanged(callback) { onDataChanged = typeof callback === 'function' ? callback : () => {}; }
export function initStorage() { return startSync(); }
export function getApiKey() { return ''; }
export function saveApiKey() {}
export function clearApiKey() {}

export async function startSync() {
  if (!initialized) {
    store().setOnChanged(notify);
    await store().init();
    initialized = true;
  }
  return store().exportSnapshot().data;
}

export function stopSync() {}
export function getGoals() { return { ...DEFAULT_GOALS, ...store().getGoals() }; }
export function setGoals(goals) { return store().setGoals(goals); }
export function getTodayKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
export function getMealsByDate(date) { return store().getMealsByDate(date); }
export function getAllMeals() { return store().getAllMeals(); }
export function saveMeal(meal) { return store().saveMeal(meal); }
export function updateMeal(id, patch) { return store().updateMeal(id, patch); }
export function deleteMeal(id) { return store().deleteMeal(id); }
export function getRecentMeals(limit = 6) { return store().getRecentMeals(limit); }
export function getDatesWithData() { return [...new Set(getAllMeals().map((meal) => meal.meal_date).filter(Boolean))].sort().reverse(); }

export function getTodaySummary() { return getSummaryForDate(getTodayKey()); }
export function getSummaryForDate(date) {
  return getMealsByDate(date).reduce((summary, meal) => {
    summary.calories += Number(meal.total_calories) || 0;
    summary.protein_g += Number(meal.total_protein_g) || 0;
    summary.fat_g += Number(meal.total_fat_g) || 0;
    summary.carbs_g += Number(meal.total_carbs_g) || 0;
    return summary;
  }, { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 });
}

export function isCompleteDay(date) {
  const types = new Set(getMealsByDate(date).map((meal) => meal.meal_type));
  return ['早餐', '午餐', '晚餐'].every((type) => types.has(type));
}

export function getAllFavorites() { return store().getAllFavorites(); }
export function getFavoriteById(id) { return getAllFavorites().find((favorite) => favorite.id === id) || null; }
export function addFavorite(favorite) { return store().addFavorite(favorite); }
export function updateFavorite(id, patch) { return store().updateFavorite(id, patch); }
export function deleteFavorite(id) { return store().deleteFavorite(id); }

export async function exportData({ prefix } = {}) {
  const snapshot = store().exportSnapshot();
  downloadJson(snapshot, prefix);
  await store().markBackupCreated();
  return snapshot;
}

export function exportCsv() {
  const columns = ['日期', '餐別', '用餐時間', '紀錄時間', '食物名稱', '數量', '單位', '重量', '熱量', '蛋白質', '脂肪', '碳水', '資料來源', '可信度', '備註'];
  const rows = getAllMeals().flatMap((meal) => {
    const foods = Array.isArray(meal.foods) && meal.foods.length ? meal.foods : [{}];
    return foods.map((food) => [meal.meal_date || '', meal.meal_type || '', meal.eaten_at || '', meal.timestamp || '', food.name || '', food.quantity ?? '', food.unit || '', food.weight_grams ?? '', food.calories ?? '', food.protein_g ?? '', food.fat_g ?? '', food.carbs_g ?? '', food.source || '', food.confidence || '', meal.notes || '']);
  });
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [columns, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `nutrilens-meals-${getTodayKey()}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  return csv;
}

export function previewImport(payload) { return store().previewImport(payload); }

export async function importData(payload) {
  const current = store().exportSnapshot().data;
  if (current.meals.length || current.favorites.length) await exportData({ prefix: 'nutrilens-before-import' });
  const result = await store().importSnapshot(payload);
  const after = store().exportSnapshot().data;
  const expected = store().previewImport(payload);
  if (!expected.ok || after.meals.length < expected.meals || after.favorites.length < expected.favorites) {
    throw new Error('匯入後筆數驗證失敗，請保留自動下載的備份');
  }
  return result;
}

export function needsBackup() { return store().needsBackup(); }
export async function clearAllData() {
  await store().clearAll();
  window.dispatchEvent(new CustomEvent('nutrilens:data-cleared'));
}
