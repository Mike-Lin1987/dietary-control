import {
  clearAllData,
  exportCsv,
  exportData,
  getGoals,
  getMealsByDate,
  getRecentMeals,
  importData,
  previewImport,
  saveMeal,
  setGoals,
  setOnDataChanged,
  startSync,
  stopSync,
} from './storage.js';
import { clearPhoto, getCurrentPhoto, initCamera } from './camera.js';
import { analyzeFood } from './analyzer.js';
import {
  getAnalysisDraft,
  hideLoading,
  renderAnalysisResults,
  renderFavorites,
  renderHistory,
  renderTodayMeals,
  showAddFavoriteModal,
  showConfirmModal,
  showLoading,
  showManualMealModal,
  showToast,
  updateTodaySummary,
} from './ui.js';
import { addFavorite, startFavoritesSync, stopFavoritesSync, setOnFavoritesChanged } from './favorites.js';
import { buildFavoriteFromAnalysis } from './favorite-utils.js';

let initialized = false;

function resolveMealType(value) {
  if (value && value !== '自動判斷') return value;
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return '早餐';
  if (hour >= 11 && hour < 14) return '午餐';
  if (hour >= 14 && hour < 17) return '點心';
  if (hour >= 17 && hour < 21) return '晚餐';
  return '點心';
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
  for (const [id, key] of [['goal-calories', 'calories'], ['goal-protein', 'protein_g'], ['goal-fat', 'fat_g'], ['goal-carbs', 'carbs_g']]) {
    const input = document.getElementById(id);
    if (input) input.value = goals[key];
  }
  const photos = document.getElementById('save-meal-photos');
  if (photos) photos.checked = goals.save_meal_photos === true;
}

function showView(target) {
  const views = document.querySelectorAll('.view');
  const tabs = document.querySelectorAll('.tab-item[data-view]');
  views.forEach((view) => view.classList.toggle('active', view.id === target));
  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.view === target));
  if (target === 'view-camera') updateTodaySummary();
  if (target === 'view-today') renderTodayMeals();
  if (target === 'view-history') renderHistory();
  if (target === 'view-favorites') renderFavorites();
  closeAddSheet();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setupNavigation() {
  document.querySelectorAll('.tab-item[data-view]').forEach((tab) => tab.addEventListener('click', () => showView(tab.dataset.view)));
  document.querySelectorAll('[data-action="go-today"]').forEach((button) => button.addEventListener('click', () => showView('view-camera')));
  document.querySelectorAll('[data-action="show-help"]').forEach((button) => button.addEventListener('click', () => showToast('資料會依登入帳號同步；AI 結果必須按「確認並儲存」才會寫入紀錄。', 'info')));
  document.querySelectorAll('[data-action="show-favorites"]').forEach((button) => button.addEventListener('click', () => showView('view-favorites')));
}

function openAddSheet() {
  const sheet = document.getElementById('add-sheet');
  if (!sheet) return;
  sheet.classList.remove('hidden'); sheet.setAttribute('aria-hidden', 'false');
}

function closeAddSheet() {
  const sheet = document.getElementById('add-sheet');
  if (!sheet) return;
  sheet.classList.add('hidden'); sheet.setAttribute('aria-hidden', 'true');
}

function setupAddSheet() {
  document.querySelectorAll('[data-action="open-add"]').forEach((button) => button.addEventListener('click', openAddSheet));
  document.querySelectorAll('[data-action="close-add"], .sheet-backdrop').forEach((button) => button.addEventListener('click', closeAddSheet));
  document.querySelectorAll('.add-option').forEach((button) => button.addEventListener('click', () => {
    const method = button.dataset.addMethod;
    closeAddSheet();
    if (method === 'camera') document.getElementById('capture-btn')?.click();
    if (method === 'gallery') document.getElementById('upload-btn')?.click();
    if (method === 'manual') showManualMealModal();
    if (method === 'favorite') showView('view-favorites');
    if (method === 'recent') addRecentMeal();
    if (method === 'previous') addPreviousMeal();
    if (method === 'yesterday') addYesterdayMeal();
  }));
}

async function addRecentMeal() {
  const recent = getRecentMeals(1)[0];
  if (!recent) { showToast('還沒有可以複製的最近紀錄', 'info'); return; }
  if (!await showConfirmModal(`複製「${(recent.foods || []).map((food) => food.name).filter(Boolean).join('、') || recent.meal_type}」到今天嗎？`)) return;
  await cloneMealToToday(recent, '最近紀錄');
}

async function addPreviousMeal() {
  const recent = getRecentMeals(2);
  const previous = recent[1] || recent[0];
  if (!previous) { showToast('還沒有可以複製的上一餐', 'info'); return; }
  if (!await showConfirmModal(`複製上一餐「${(previous.foods || []).map((food) => food.name).filter(Boolean).join('、') || previous.meal_type}」到今天嗎？`)) return;
  await cloneMealToToday(previous, '上一餐');
}

async function addYesterdayMeal() {
  const date = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const meal = getMealsByDate(date)[0];
  if (!meal) { showToast('昨天沒有可沿用的餐點', 'info'); return; }
  if (!await showConfirmModal(`沿用昨天的「${meal.meal_type || '餐點'}」到今天嗎？`)) return;
  await cloneMealToToday(meal, '昨天同餐');
}

async function cloneMealToToday(meal, sourceLabel) {
  try {
    const now = new Date().toISOString();
    await saveMeal({ ...meal, id: undefined, meal_date: undefined, eaten_at: now, timestamp: now, notes: `${meal.notes || ''}${meal.notes ? '；' : ''}由${sourceLabel}複製` });
    showToast(`${sourceLabel}已加入今天`);
  } catch (error) { showToast(error.message || '複製失敗', 'error'); }
}

function setupDate() {
  const date = document.getElementById('today-date');
  if (date) date.textContent = new Date().toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short' });
}

function setupHistoryFilter() {
  document.getElementById('history-date-picker')?.addEventListener('change', renderHistory);
  document.getElementById('trend-range')?.addEventListener('change', renderHistory);
  document.querySelector('[data-action="clear-history-filter"]')?.addEventListener('click', () => { const picker = document.getElementById('history-date-picker'); if (picker) picker.value = ''; renderHistory(); });
}

function setupFavoritesFilters() {
  document.getElementById('favorites-search')?.addEventListener('input', renderFavorites);
  document.getElementById('favorites-sort')?.addEventListener('change', renderFavorites);
}

function setupGoals() {
  document.getElementById('save-goal-btn')?.addEventListener('click', async () => {
    const value = (id, fallback) => { const parsed = Number.parseFloat(document.getElementById(id)?.value); return Number.isFinite(parsed) ? parsed : fallback; };
    try { await setGoals({ calories: value('goal-calories', 2000), protein_g: value('goal-protein', 130), fat_g: value('goal-fat', 60), carbs_g: value('goal-carbs', 200), save_meal_photos: document.getElementById('save-meal-photos')?.checked === true }); updateTodaySummary(); showToast('每日目標已儲存'); } catch (error) { showToast(error.message || '目標儲存失敗', 'error'); }
  });
}

function setupDataActions() {
  document.getElementById('export-btn')?.addEventListener('click', async () => { try { await exportData(); showToast('v2 JSON 已匯出'); } catch (error) { showToast(error.message || '匯出失敗', 'error'); } });
  document.getElementById('export-csv-btn')?.addEventListener('click', () => { try { exportCsv(); showToast('CSV 已匯出'); } catch (error) { showToast(error.message || 'CSV 匯出失敗', 'error'); } });
  document.getElementById('import-btn')?.addEventListener('click', () => document.getElementById('import-file-input')?.click());
  document.getElementById('import-file-input')?.addEventListener('change', async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const text = await file.text(); const preview = previewImport(text); if (!preview.ok) { showToast(preview.reason || '匯入檔案格式不正確', 'error'); return; } const confirmed = await showConfirmModal(`預覽：${preview.meals} 筆餐點、${preview.favorites} 個常吃項目${preview.hasGoals ? '與每日目標' : ''}。匯入前會先下載目前資料備份，繼續嗎？`); if (!confirmed) return; if (await importData(text)) { await startSync(); refreshAll(); showToast('資料已匯入，原資料備份也已下載'); } } catch (error) { showToast(error.message || '匯入失敗', 'error'); } finally { event.target.value = ''; } });
  document.getElementById('clear-data-btn')?.addEventListener('click', async () => {
    if (!await showConfirmModal('這會清除餐點、常吃清單、設定與照片，且無法復原。確定繼續嗎？')) return;
    if (window.prompt('請輸入「清除」確認') !== '清除') { showToast('已取消清除', 'info'); return; }
    try { await clearAllData(); refreshAll(); showToast('所有資料已清除'); } catch (error) { showToast(error.message || '清除失敗', 'error'); }
  });
  document.getElementById('add-favorite-btn')?.addEventListener('click', showAddFavoriteModal);
}

function thumbnail(base64) { if (!base64) return null; return base64.length > 100000 ? base64.slice(0, 100000) : base64; }

async function runAnalysis({ photo, mealType, userNote = '', previousResult = null }) {
  showLoading('正在分析照片…');
  try { const data = await analyzeFood(photo.base64, photo.mimeType, mealType, userNote, previousResult); bindAnalysisActions({ data: { ...data, meal_type: mealType }, photo, mealType, userNote }); } catch (error) { showToast(error.message || 'AI 分析失敗', 'error'); } finally { hideLoading(); }
}

function bindAnalysisActions({ data, photo, mealType, userNote }) {
  const saveButton = renderAnalysisResults(data, photo.base64, userNote);
  document.getElementById('reanalyze-result-btn')?.addEventListener('click', async () => { const note = document.getElementById('analysis-recheck-note')?.value.trim() || ''; if (!note) { showToast('請先輸入想補充的內容', 'error'); return; } await runAnalysis({ photo, mealType, userNote: note, previousResult: data }); });
  document.getElementById('favorite-result-btn')?.addEventListener('click', async () => { try { await addFavorite(buildFavoriteFromAnalysis(getAnalysisDraft(data))); showToast('已加入常吃清單'); } catch (error) { showToast(error.message || '加入常吃清單失敗', 'error'); } });
  saveButton?.addEventListener('click', async () => {
    try {
      const draft = getAnalysisDraft(data); const now = new Date().toISOString(); const goals = getGoals();
      await saveMeal({ meal_type: draft.meal_type || mealType, eaten_at: now, foods: draft.foods || [], total_calories: draft.total_calories || 0, total_protein_g: draft.total_protein_g || 0, total_fat_g: draft.total_fat_g || 0, total_carbs_g: draft.total_carbs_g || 0, confidence: draft.confidence || 'medium', notes: draft.notes || '', ...(goals.save_meal_photos ? { photo_thumbnail: thumbnail(photo.base64), save_photo: true } : {}) });
      clearPhoto(); const results = document.getElementById('results-container'); if (results) { results.innerHTML = ''; results.classList.add('hidden'); } showToast('餐點已儲存');
    } catch (error) { showToast(error.message || '餐點儲存失敗', 'error'); }
  });
}

function setupAnalyze() {
  document.getElementById('analyze-btn')?.addEventListener('click', async () => { const photo = getCurrentPhoto(); if (!photo) { showToast('請先選擇餐點照片', 'error'); return; } await runAnalysis({ photo, mealType: resolveMealType(document.getElementById('meal-type-select')?.value) }); });
}

async function initialize() {
  if (initialized) return; initialized = true;
  const app = document.getElementById('app');
  app?.classList.remove('hidden');
  initCamera(); setupDate(); setupNavigation(); setupAddSheet(); setupHistoryFilter(); setupFavoritesFilters(); setupAnalyze(); setupGoals(); setupDataActions();
  setOnDataChanged(refreshAll); setOnFavoritesChanged(renderFavorites);
  try {
    await Promise.all([startSync(), startFavoritesSync()]);
    refreshAll();
  } catch (error) { app?.classList.remove('hidden'); showToast(error.message || '資料載入失敗，請重新整理', 'error'); }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true }); else initialize();
window.addEventListener('pagehide', () => { stopSync(); stopFavoritesSync(); });
