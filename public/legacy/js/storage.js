const DEFAULT_GOALS = { calories: 2000, protein_g: 130, fat_g: 60, carbs_g: 200, save_meal_photos: false };

let localData = { goals: { ...DEFAULT_GOALS }, meals: {} };
let onDataChanged = () => {};

async function api(path, init = {}) {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "資料同步失敗，請稍後再試。");
  return data;
}

function normalizeMeals(meals) {
  if (!meals) return {};
  if (Array.isArray(meals)) return meals.reduce((groups, meal) => {
    const key = meal.meal_date || meal.date || getTodayKey();
    (groups[key] ||= []).push(meal);
    return groups;
  }, {});
  return meals;
}

function applyBootstrap(payload) {
  localData = {
    goals: { ...DEFAULT_GOALS, ...(payload?.goals || {}) },
    meals: normalizeMeals(payload?.meals),
  };
  onDataChanged();
}

export function setOnDataChanged(callback) { onDataChanged = typeof callback === "function" ? callback : () => {}; }
export function initStorage() { return startSync(); }
export function getApiKey() { return ""; }
export function saveApiKey() {}
export function clearApiKey() {}

export async function startSync() {
  const payload = await api("/api/bootstrap", { method: "GET" });
  applyBootstrap(payload);
  return payload;
}

export function stopSync() {}
export function getGoals() { return { ...DEFAULT_GOALS, ...localData.goals }; }

export async function setGoals(goals) {
  const previous = getGoals();
  localData.goals = { ...previous, ...goals };
  onDataChanged();
  try {
    await api("/api/goals", { method: "PUT", body: JSON.stringify(localData.goals) });
  } catch (error) {
    localData.goals = previous;
    onDataChanged();
    throw error;
  }
  return getGoals();
}

export function getTodayKey() { return new Date().toISOString().slice(0, 10); }
export function getMealsByDate(date) {
  return [...(localData.meals[date] || [])].sort((a, b) => String(a.eaten_at || a.timestamp).localeCompare(String(b.eaten_at || b.timestamp)));
}
export function getAllMeals() { return Object.values(localData.meals).flat(); }

function cacheMeal(meal) {
  const key = meal.meal_date || getTodayKey();
  const list = localData.meals[key] || [];
  const index = list.findIndex((item) => item.id === meal.id);
  if (index >= 0) list[index] = meal; else list.push(meal);
  localData.meals[key] = list;
}

export async function saveMeal(meal) {
  const eatenAt = meal.eaten_at || meal.timestamp || new Date().toISOString();
  const payload = {
    ...meal,
    id: meal.id || crypto.randomUUID(),
    meal_date: meal.meal_date || eatenAt.slice(0, 10) || getTodayKey(),
    timestamp: meal.timestamp || eatenAt,
    eaten_at: eatenAt,
    save_photo: meal.save_photo === true || getGoals().save_meal_photos === true,
  };
  const result = await api("/api/meals", { method: "POST", body: JSON.stringify(payload) });
  const saved = result.meal || payload;
  cacheMeal(saved); onDataChanged();
  return saved;
}

export async function updateMeal(id, patch) {
  const result = await api(`/api/meals/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
  const updated = result.meal || { ...getAllMeals().find((meal) => meal.id === id), ...patch, id };
  for (const [date, list] of Object.entries(localData.meals)) {
    const index = list.findIndex((meal) => meal.id === id);
    if (index >= 0) { list.splice(index, 1); if (list.length === 0) delete localData.meals[date]; }
  }
  cacheMeal(updated); onDataChanged(); return updated;
}

export async function deleteMeal(id) {
  await api(`/api/meals/${encodeURIComponent(id)}`, { method: "DELETE" });
  for (const [date, list] of Object.entries(localData.meals)) {
    localData.meals[date] = list.filter((meal) => meal.id !== id);
    if (!localData.meals[date].length) delete localData.meals[date];
  }
  onDataChanged();
}

export function getDatesWithData() { return Object.keys(localData.meals).sort().reverse(); }
export function getTodaySummary() {
  return getMealsByDate(getTodayKey()).reduce((summary, meal) => {
    summary.calories += Number(meal.total_calories) || 0;
    summary.protein_g += Number(meal.total_protein_g) || 0;
    summary.fat_g += Number(meal.total_fat_g) || 0;
    summary.carbs_g += Number(meal.total_carbs_g) || 0;
    return summary;
  }, { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 });
}

export function getSummaryForDate(date) {
  return getMealsByDate(date).reduce((summary, meal) => {
    summary.calories += Number(meal.total_calories) || 0;
    summary.protein_g += Number(meal.total_protein_g) || 0;
    summary.fat_g += Number(meal.total_fat_g) || 0;
    summary.carbs_g += Number(meal.total_carbs_g) || 0;
    return summary;
  }, { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 });
}

export function getRecentMeals(limit = 6) {
  return getAllMeals().sort((a, b) => String(b.eaten_at || b.timestamp).localeCompare(String(a.eaten_at || a.timestamp))).slice(0, limit);
}

export function isCompleteDay(date) {
  const types = new Set(getMealsByDate(date).map((meal) => meal.meal_type));
  return ['早餐', '午餐', '晚餐'].every((type) => types.has(type));
}

export async function exportData() {
  const data = await api("/api/export", { method: "GET" });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `nutrilens-export-${getTodayKey()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  return data;
}

export function exportCsv() {
  const columns = ['日期', '餐別', '用餐時間', '紀錄時間', '食物名稱', '數量', '單位', '重量', '熱量', '蛋白質', '脂肪', '碳水', '資料來源', '可信度', '備註'];
  const rows = getAllMeals().flatMap((meal) => {
    const foods = Array.isArray(meal.foods) && meal.foods.length ? meal.foods : [{}];
    return foods.map((food) => [
      meal.meal_date || '',
      meal.meal_type || '',
      meal.eaten_at || '',
      meal.timestamp || '',
      food.name || '',
      food.quantity ?? '',
      food.unit || '',
      food.weight_grams ?? '',
      food.calories ?? '',
      food.protein_g ?? '',
      food.fat_g ?? '',
      food.carbs_g ?? '',
      food.source || '',
      food.confidence || '',
      meal.notes || '',
    ]);
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

export function previewImport(text) {
  let payload;
  try { payload = typeof text === "string" ? JSON.parse(text) : text; } catch { return { ok: false, reason: "JSON 格式無法讀取" }; }
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  const schemaVersion = payload?.schemaVersion ?? payload?.version ?? 1;
  if (!payload || !data || (typeof schemaVersion === "number" && schemaVersion > 2)) return { ok: false, reason: "版本不支援" };
  const meals = Array.isArray(data.meals) ? data.meals.length : data.meals && typeof data.meals === "object" ? Object.values(data.meals).reduce((count, group) => count + (Array.isArray(group) ? group.length : 0), 0) : 0;
  const favorites = Array.isArray(data.favorites) ? data.favorites.length : 0;
  if (!meals && !favorites && !data.goals) return { ok: false, reason: "找不到餐點、常吃清單或目標資料" };
  return { ok: true, schemaVersion, meals, favorites, hasGoals: Boolean(data.goals) };
}

export async function importData(text) {
  let payload;
  try { payload = typeof text === "string" ? JSON.parse(text) : text; } catch { return false; }
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  if (!payload || !data || (!Array.isArray(data.meals) && !data.meals && !Array.isArray(data.favorites) && !data.goals)) return false;
  if (typeof payload.schemaVersion === "number" && payload.schemaVersion > 2) return false;
  await exportData();
  await api("/api/migration/import", { method: "POST", body: JSON.stringify({ ...payload, complete: true }) });
  await startSync();
  return true;
}

export async function clearAllData() {
  await api("/api/data", { method: "DELETE" });
  localData.meals = {}; onDataChanged();
  window.dispatchEvent(new CustomEvent('nutrilens:data-cleared'));
}
