const DEFAULT_GOALS = { calories: 1500, protein_g: 120, fat_g: 50, carbs_g: 200 };

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
  localData.goals = { ...getGoals(), ...goals };
  onDataChanged();
  await api("/api/goals", { method: "PUT", body: JSON.stringify(localData.goals) });
  return getGoals();
}

export function getTodayKey() { return new Date().toISOString().slice(0, 10); }
export function getMealsByDate(date) { return [...(localData.meals[date] || [])].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp))); }
export function getAllMeals() { return Object.values(localData.meals).flat(); }

function cacheMeal(meal) {
  const key = meal.meal_date || getTodayKey();
  const list = localData.meals[key] || [];
  const index = list.findIndex((item) => item.id === meal.id);
  if (index >= 0) list[index] = meal; else list.push(meal);
  localData.meals[key] = list;
}

export async function saveMeal(meal) {
  const payload = { ...meal, id: meal.id || crypto.randomUUID(), meal_date: meal.meal_date || getTodayKey(), timestamp: meal.timestamp || new Date().toISOString() };
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

export async function exportData() {
  const data = await api("/api/export", { method: "GET" });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `nutrilens-export-${getTodayKey()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  return data;
}

export async function importData(text) {
  let payload;
  try { payload = typeof text === "string" ? JSON.parse(text) : text; } catch { return false; }
  if (!payload || (!Array.isArray(payload.meals) && !Array.isArray(payload.favorites))) return false;
  await api("/api/migration/import", { method: "POST", body: JSON.stringify({ ...payload, complete: true }) });
  await startSync();
  return true;
}

export async function clearAllData() {
  await api("/api/meals", { method: "DELETE" });
  localData.meals = {}; onDataChanged();
}
