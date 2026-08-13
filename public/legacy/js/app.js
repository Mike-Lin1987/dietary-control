import {
  saveMeal, getTodayKey, exportData, importData, clearAllData, getGoals,
  setGoals, startSync, stopSync, setOnDataChanged,
} from "./storage.js";
import { initCamera, getCurrentPhoto, clearPhoto } from "./camera.js";
import { analyzeFood } from "./analyzer.js";
import {
  showLoading, hideLoading, showToast, renderAnalysisResults, renderTodayMeals,
  renderHistory, updateTodaySummary, showConfirmModal, renderFavorites,
  showAddFavoriteModal,
} from "./ui.js";
import { startFavoritesSync, stopFavoritesSync, setOnFavoritesChanged, addFavorite } from "./favorites.js";
import { buildFavoriteFromAnalysis } from "./favorite-utils.js";

let initialized = false;

function resolveMealType(value) {
  if (value && value !== "自動判斷") return value;
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return "早餐";
  if (hour >= 11 && hour < 14) return "午餐";
  if (hour >= 14 && hour < 17) return "點心";
  if (hour >= 17 && hour < 21) return "晚餐";
  return "點心";
}

function refreshAll() {
  updateTodaySummary();
  renderTodayMeals();
  renderHistory();
  renderFavorites();
  loadGoals();
}

function loadGoals() {
  const goals = getGoals();
  for (const [id, key] of [["goal-calories", "calories"], ["goal-protein", "protein_g"], ["goal-fat", "fat_g"], ["goal-carbs", "carbs_g"]]) {
    const input = document.getElementById(id);
    if (input) input.value = goals[key];
  }
}

function setupNavigation() {
  const tabs = document.querySelectorAll(".tab-item");
  const views = document.querySelectorAll(".view");
  tabs.forEach((tab) => tab.addEventListener("click", () => {
    const target = tab.dataset.view;
    tabs.forEach((item) => item.classList.toggle("active", item === tab));
    views.forEach((view) => view.classList.toggle("active", view.id === target));
    if (target === "view-camera") updateTodaySummary();
    if (target === "view-today") renderTodayMeals();
    if (target === "view-history") renderHistory();
    if (target === "view-favorites") renderFavorites();
  }));
}

function setupDate() {
  const element = document.getElementById("today-date");
  if (element) element.textContent = getTodayKey();
}

function setupHistoryFilter() {
  document.getElementById("history-date-picker")?.addEventListener("change", renderHistory);
}

function setupGoals() {
  document.getElementById("save-goal-btn")?.addEventListener("click", async () => {
    const value = (id, fallback) => Number.parseInt(document.getElementById(id)?.value, 10) || fallback;
    try {
      await setGoals({ calories: value("goal-calories", 1500), protein_g: value("goal-protein", 120), fat_g: value("goal-fat", 50), carbs_g: value("goal-carbs", 200) });
      updateTodaySummary(); showToast("目標已儲存");
    } catch (error) { showToast(error.message || "目標儲存失敗", "error"); }
  });
}

function setupDataActions() {
  document.getElementById("export-btn")?.addEventListener("click", async () => {
    try { await exportData(); showToast("資料已匯出"); } catch (error) { showToast(error.message || "匯出失敗", "error"); }
  });
  document.getElementById("import-btn")?.addEventListener("click", () => document.getElementById("import-file-input")?.click());
  document.getElementById("import-file-input")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (await importData(await file.text())) { refreshAll(); showToast("資料已匯入"); }
      else showToast("匯入檔案格式不正確", "error");
    } catch (error) { showToast(error.message || "匯入失敗", "error"); }
    event.target.value = "";
  });
  document.getElementById("clear-data-btn")?.addEventListener("click", async () => {
    if (!await showConfirmModal("確定要清除所有餐點紀錄嗎？此動作無法復原。")) return;
    try { await clearAllData(); refreshAll(); showToast("餐點紀錄已清除"); }
    catch (error) { showToast(error.message || "清除失敗", "error"); }
  });
  document.getElementById("add-favorite-btn")?.addEventListener("click", () => showAddFavoriteModal());
}

function thumbnail(base64) {
  if (!base64) return null;
  return base64.length > 100000 ? base64.slice(0, 100000) : base64;
}

async function runAnalysis({ photo, mealType, userNote = "", previousResult = null }) {
  showLoading();
  try {
    const data = await analyzeFood(photo.base64, photo.mimeType, mealType, userNote, previousResult);
    const normalized = { ...data, meal_type: mealType };
    bindAnalysisActions({ data: normalized, photo, mealType, userNote });
  } catch (error) { showToast(error.message || "AI 分析失敗", "error"); }
  finally { hideLoading(); }
}

function bindAnalysisActions({ data, photo, mealType, userNote }) {
  const saveButton = renderAnalysisResults(data, photo.base64, userNote);
  document.getElementById("reanalyze-result-btn")?.addEventListener("click", async () => {
    const note = document.getElementById("analysis-user-note")?.value.trim() || "";
    if (!note) { showToast("請先輸入想修正的內容", "error"); return; }
    await runAnalysis({ photo, mealType, userNote: note, previousResult: data });
  });
  document.getElementById("favorite-result-btn")?.addEventListener("click", async () => {
    try { await addFavorite(buildFavoriteFromAnalysis(data)); showToast("已加入常吃清單"); }
    catch (error) { showToast(error.message || "加入常吃清單失敗", "error"); }
  });
  saveButton?.addEventListener("click", async () => {
    try {
      await saveMeal({ meal_type: data.meal_type || mealType, foods: data.foods || [], total_calories: data.total_calories || 0, total_protein_g: data.total_protein_g || 0, total_fat_g: data.total_fat_g || 0, total_carbs_g: data.total_carbs_g || 0, confidence: data.confidence || "medium", notes: data.notes || "", photo_thumbnail: thumbnail(photo.base64) });
      clearPhoto();
      const results = document.getElementById("results-container");
      if (results) { results.innerHTML = ""; results.classList.add("hidden"); }
      refreshAll(); showToast("餐點已儲存");
    } catch (error) { showToast(error.message || "餐點儲存失敗", "error"); }
  });
}

function setupAnalyze() {
  document.getElementById("analyze-btn")?.addEventListener("click", async () => {
    const photo = getCurrentPhoto();
    if (!photo) { showToast("請先拍照或上傳餐點照片", "error"); return; }
    const mealType = resolveMealType(document.getElementById("meal-type-select")?.value);
    await runAnalysis({ photo, mealType });
  });
}

async function initialize() {
  if (initialized) return;
  initialized = true;
  document.getElementById("api-key-settings")?.classList.add("hidden");

  const app = document.getElementById("app");
  try {
    await Promise.all([startSync(), startFavoritesSync()]);
    app?.classList.remove("hidden");
    initCamera(); setupDate(); setupNavigation(); setupHistoryFilter(); setupAnalyze(); setupGoals(); setupDataActions();
    setOnDataChanged(refreshAll); setOnFavoritesChanged(renderFavorites); refreshAll();
  } catch (error) {
    app?.classList.remove("hidden");
    showToast(error.message || "資料載入失敗，請重新整理", "error");
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
else initialize();

window.addEventListener("pagehide", () => { stopSync(); stopFavoritesSync(); });
