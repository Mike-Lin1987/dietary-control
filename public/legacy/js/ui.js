/**
 * ui.js - UI rendering and interaction layer.
 */

import {
  getGoals,
  getMealsByDate,
  getTodayKey,
  getTodaySummary,
  getDatesWithData,
  updateMeal,
  deleteMeal,
  saveMeal,
} from './storage.js';

import {
  getAllFavorites,
  addFavorite,
  deleteFavorite,
  updateFavorite,
} from './favorites.js';
import { buildFavoriteItemFromForm } from './favorite-utils.js';

import { updateCalorieRing, updateMacroBars } from './charts.js';

// ── Loading ─────────────────────────────────────────────

export function showLoading() {
  document.getElementById('loading-overlay')?.classList.remove('hidden');
}

export function hideLoading() {
  document.getElementById('loading-overlay')?.classList.add('hidden');
}

// ── Toast ───────────────────────────────────────────────

/**
 * Shows a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 */
export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
  };

  toast.innerHTML = `
    <span class="toast-icon">${iconMap[type] ?? ''}</span>
    <span class="toast-message">${_escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  // Trigger enter animation
  requestAnimationFrame(() => toast.classList.add('toast-visible'));

  setTimeout(() => {
    toast.classList.remove('toast-visible');
    toast.classList.add('toast-exit');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    // Fallback removal
    setTimeout(() => toast.remove(), 500);
  }, 3000);
}

// ── Analysis Results ────────────────────────────────────

/**
 * Renders analysis results into #results-container.
 * @param {object} data        - Analysis response from backend.
 * @param {string} photoBase64 - The photo base64 string.
 * @param {string} userNote    - User note used for the current estimate.
 * @returns {HTMLElement}      - The save button element for event binding.
 */
export function renderAnalysisResults(data, photoBase64, userNote = '') {
  const container = document.getElementById('results-container');
  if (!container) return null;

  const confidenceColors = {
    high: { bg: 'var(--color-success)', label: '高' },
    medium: { bg: 'var(--color-warning)', label: '中' },
    low: { bg: 'var(--color-error)', label: '低' },
  };

  const conf = confidenceColors[data.confidence] ?? confidenceColors.medium;

  const foodRows = (data.foods ?? [])
    .map(
      (f) => `
      <div class="food-row">
        <div class="food-name">
          ${_escapeHtml(f.name)}
          ${f.uncertain ? '<span class="uncertain-badge">不確定</span>' : ''}
        </div>
        <div class="food-portion">${_escapeHtml(f.portion)}</div>
        <div class="food-nutrients">
          <span class="nutrient cal">${f.calories} kcal</span>
          <span class="nutrient pro">蛋白質 ${f.protein_g}g</span>
          <span class="nutrient fat">脂肪 ${f.fat_g}g</span>
          <span class="nutrient carb">碳水 ${f.carbs_g}g</span>
        </div>
      </div>
    `
    )
    .join('');

  container.innerHTML = `
    <div class="results-card glass-card">
      <div class="results-header">
        <span class="badge confidence-badge" style="background:${conf.bg}">
          信心度：${conf.label}
        </span>
        <span class="badge meal-type-badge">${_escapeHtml(data.meal_type ?? '餐點')}</span>
        ${data.model ? `<span class="badge model-badge">${_escapeHtml(data.model)}</span>` : ''}
      </div>

      <div class="food-list">
        ${foodRows}
      </div>

      <div class="results-total">
        <span class="total-label">合計</span>
        <div class="food-nutrients">
          <span class="nutrient cal">${data.total_calories ?? 0} kcal</span>
          <span class="nutrient pro">蛋白質 ${data.total_protein_g ?? 0}g</span>
          <span class="nutrient fat">脂肪 ${data.total_fat_g ?? 0}g</span>
          <span class="nutrient carb">碳水 ${data.total_carbs_g ?? 0}g</span>
        </div>
      </div>

      ${data.notes ? `<div class="results-notes"><strong>備註：</strong>${_escapeHtml(data.notes)}</div>` : ''}

      <div class="reanalyze-panel">
        <label for="analysis-user-note">補充後重新估算</label>
        <textarea
          id="analysis-user-note"
          class="reanalyze-input"
          rows="3"
          placeholder="例如：飯吃一半、湯沒喝、醬料少、炸皮沒吃"
        >${_escapeHtml(userNote)}</textarea>
      </div>

      <div class="results-actions">
        <button id="reanalyze-result-btn" class="btn btn-secondary">重新估算</button>
        <button id="favorite-result-btn" class="btn btn-secondary">加入常吃</button>
        <button id="save-result-btn" class="btn btn-primary">儲存此餐</button>
        <button id="discard-result-btn" class="btn btn-ghost">捨棄</button>
      </div>
    </div>
  `;

  container.classList.remove('hidden');

  // Discard handler
  document.getElementById('discard-result-btn')?.addEventListener('click', () => {
    container.innerHTML = '';
    container.classList.add('hidden');
  });

  return document.getElementById('save-result-btn');
}

// ── Today's Meals ───────────────────────────────────────

/**
 * Renders today's meals grouped by meal_type.
 */
export function renderTodayMeals() {
  const list = document.getElementById('today-meals-list');
  if (!list) return;

  const meals = getMealsByDate(getTodayKey());

  if (!meals.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🍽️</div>
        <p>今天還沒有記錄任何餐點</p>
        <p class="empty-hint">切換到拍照分頁來新增吧！</p>
      </div>
    `;
    return;
  }

  // Group by meal_type
  const groups = {};
  const ORDER = ['早餐', '午餐', '晚餐', '點心'];

  for (const meal of meals) {
    const type = meal.meal_type ?? '其他';
    if (!groups[type]) groups[type] = [];
    groups[type].push(meal);
  }

  // Sort groups by predefined order
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    const ai = ORDER.indexOf(a);
    const bi = ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  let html = '';
  const todayKey = getTodayKey();

  for (const type of sortedKeys) {
    const mealGroup = groups[type];
    html += `
      <div class="meal-group glass-card">
        <h3 class="meal-group-title">${_escapeHtml(type)}</h3>
        ${mealGroup
          .map(
            (meal) => `
          <div class="meal-item" data-meal-id="${meal.id}">
            <div class="meal-item-header">
              <span class="meal-time">${_formatTime(meal.timestamp)}</span>
              <div class="meal-item-actions">
                <button class="icon-btn add-fav-btn" data-meal-id="${meal.id}" data-date="${todayKey}" title="加入常吃">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                </button>
                <button class="icon-btn edit-meal-btn" data-date="${todayKey}" data-id="${meal.id}" title="編輯">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="icon-btn delete-meal-btn" data-date="${todayKey}" data-id="${meal.id}" title="刪除">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            </div>
            <div class="meal-food-list">
              ${(meal.foods ?? [])
                .map(
                  (f) =>
                    `<div class="meal-food-item">${_escapeHtml(f.name)} <span class="food-cal">${f.calories} kcal</span></div>`
                )
                .join('')}
            </div>
            <div class="meal-total">
              合計 ${meal.total_calories ?? 0} kcal ｜
              蛋白質 ${meal.total_protein_g ?? 0}g ｜
              脂肪 ${meal.total_fat_g ?? 0}g ｜
              碳水 ${meal.total_carbs_g ?? 0}g
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  list.innerHTML = html;

  // Bind add-to-favorites buttons
  list.querySelectorAll('.add-fav-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const meal = getMealsByDate(btn.dataset.date).find(m => m.id === btn.dataset.mealId);
      if (!meal) return;
      try {
        btn.disabled = true;
        await addFavorite({
          name: meal.meal_type || '我的餐點',
          description: (meal.foods ?? []).map(f => `${f.name} ${f.portion}`).join('、'),
          foods: meal.foods ?? [],
          total_calories: meal.total_calories ?? 0,
          total_protein_g: meal.total_protein_g ?? 0,
          total_fat_g: meal.total_fat_g ?? 0,
          total_carbs_g: meal.total_carbs_g ?? 0,
        });
        showToast('已加入常吃清單 ⭐');
      } catch (err) {
        showToast('加入常吃失敗：' + (err.message || '請稍後再試'), 'error');
      } finally {
        btn.disabled = false;
      }
    });
  });

  // Bind edit buttons
  list.querySelectorAll('.edit-meal-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      showEditModal(btn.dataset.date, btn.dataset.id);
    });
  });

  // Bind delete buttons
  list.querySelectorAll('.delete-meal-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const yes = await showConfirmModal('確定要刪除這筆餐點紀錄嗎？');
      if (yes) {
        deleteMeal(btn.dataset.date, btn.dataset.id);
        renderTodayMeals();
        updateTodaySummary();
        showToast('已刪除餐點紀錄');
      }
    });
  });
}

// ── History ─────────────────────────────────────────────

/**
 * Renders history list with expandable date cards.
 */
export function renderHistory() {
  const list = document.getElementById('history-list');
  if (!list) return;

  const datePicker = document.getElementById('history-date-picker');
  const filterDate = datePicker?.value || '';

  let dates = getDatesWithData();

  // Filter if a specific date is chosen
  if (filterDate) {
    dates = dates.filter((d) => d === filterDate);
  }

  // Most recent first
  dates.sort((a, b) => b.localeCompare(a));

  if (!dates.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>沒有歷史紀錄</p>
      </div>
    `;
    return;
  }

  let html = '';

  for (const date of dates) {
    const dayMeals = getMealsByDate(date);
    let dayCal = 0, dayPro = 0, dayFat = 0, dayCarb = 0;

    for (const m of dayMeals) {
      dayCal  += m.total_calories ?? 0;
      dayPro  += m.total_protein_g ?? 0;
      dayFat  += m.total_fat_g ?? 0;
      dayCarb += m.total_carbs_g ?? 0;
    }

    const weekday = _getWeekday(date);

    html += `
      <div class="history-card glass-card">
        <div class="history-card-header" data-date="${date}">
          <div class="history-date-info">
            <span class="history-date">${date}</span>
            <span class="history-weekday">${weekday}</span>
          </div>
          <div class="history-summary-mini">
            <span class="history-cal">${Math.round(dayCal)} kcal</span>
            <span class="history-macro">蛋 ${Math.round(dayPro)}g ｜ 脂 ${Math.round(dayFat)}g ｜ 碳 ${Math.round(dayCarb)}g</span>
          </div>
          <span class="history-expand-icon">▼</span>
        </div>
        <div class="history-card-body hidden">
          ${dayMeals
            .map(
              (meal) => `
            <div class="history-meal-item">
              <div class="history-meal-header">
                <span class="badge meal-type-badge">${_escapeHtml(meal.meal_type ?? '其他')}</span>
                <span class="meal-time">${_formatTime(meal.timestamp)}</span>
              </div>
              <div class="meal-food-list">
                ${(meal.foods ?? [])
                  .map(
                    (f) =>
                      `<div class="meal-food-item">${_escapeHtml(f.name)} (${_escapeHtml(f.portion)}) <span class="food-cal">${f.calories} kcal</span></div>`
                  )
                  .join('')}
              </div>
              <div class="meal-total">
                合計 ${meal.total_calories ?? 0} kcal ｜
                蛋白質 ${meal.total_protein_g ?? 0}g ｜
                脂肪 ${meal.total_fat_g ?? 0}g ｜
                碳水 ${meal.total_carbs_g ?? 0}g
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;
  }

  list.innerHTML = html;

  // Bind expand / collapse
  list.querySelectorAll('.history-card-header').forEach((header) => {
    header.addEventListener('click', () => {
      const body = header.nextElementSibling;
      const icon = header.querySelector('.history-expand-icon');
      body.classList.toggle('hidden');
      if (icon) icon.textContent = body.classList.contains('hidden') ? '▼' : '▲';
    });
  });
}

// ── Summary ─────────────────────────────────────────────

/**
 * Reads today's summary and updates the dashboard charts.
 */
export function updateTodaySummary() {
  const summary = getTodaySummary();
  const goals = getGoals();

  updateCalorieRing(summary.calories, goals.calories);
  updateMacroBars(summary.protein_g, summary.fat_g, summary.carbs_g, goals);
}

// ── Edit Modal ──────────────────────────────────────────

/**
 * Shows the edit modal for a specific meal.
 */
export function showEditModal(dateStr, mealId) {
  const meals = getMealsByDate(dateStr);
  const meal = meals.find((m) => m.id === mealId);
  if (!meal) return;

  const modal = document.getElementById('edit-modal');
  if (!modal) return;

  const body = modal.querySelector('.modal-body') ?? modal;

  const getFoodItemHtml = (f, index) => `
    <div class="edit-food-item" data-index="${index}">
      <div class="edit-food-header">
        <input type="text" class="edit-name" value="${_escapeHtml(f.name || '')}" placeholder="食物名稱">
        <input type="text" class="edit-portion" value="${_escapeHtml(f.portion || '')}" placeholder="份量 (例: 1碗)">
        <button type="button" class="btn-delete-food" title="刪除此項">🗑️</button>
      </div>
      <div class="edit-fields">
        <label>熱量 <input type="number" class="edit-cal" value="${f.calories || 0}" min="0" step="1"></label>
        <label>蛋白質 <input type="number" class="edit-pro" value="${f.protein_g || 0}" min="0" step="0.1"></label>
        <label>脂肪 <input type="number" class="edit-fat" value="${f.fat_g || 0}" min="0" step="0.1"></label>
        <label>碳水 <input type="number" class="edit-carb" value="${f.carbs_g || 0}" min="0" step="0.1"></label>
      </div>
    </div>
  `;

  let foodFieldsHtml = (meal.foods ?? []).map((f, i) => getFoodItemHtml(f, i)).join('');

  body.innerHTML = `
    <h3>編輯餐點</h3>
    <div class="edit-food-list" id="edit-food-list">${foodFieldsHtml}</div>
    <button id="add-food-btn" class="btn btn-secondary btn-sm" style="margin-bottom: 1rem;">+ 新增項目</button>
  `;

  modal.classList.remove('hidden');

  const listContainer = document.getElementById('edit-food-list');

  // Delete handler
  listContainer.addEventListener('click', (e) => {
    if (e.target.closest('.btn-delete-food')) {
      const item = e.target.closest('.edit-food-item');
      if (item) item.remove();
    }
  });

  // Add handler
  document.getElementById('add-food-btn')?.addEventListener('click', () => {
    const emptyFood = { name: '', portion: '1份', calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };
    listContainer.insertAdjacentHTML('beforeend', getFoodItemHtml(emptyFood, Date.now()));
  });

  // Prevent multiple listeners
  const oldSaveBtn = document.getElementById('edit-save-btn');
  const saveBtn = oldSaveBtn.cloneNode(true);
  oldSaveBtn.parentNode.replaceChild(saveBtn, oldSaveBtn);

  const oldCancelBtn = document.getElementById('edit-cancel-btn');
  const cancelBtn = oldCancelBtn.cloneNode(true);
  oldCancelBtn.parentNode.replaceChild(cancelBtn, oldCancelBtn);

  // Save handler
  saveBtn.addEventListener('click', () => {
    const items = listContainer.querySelectorAll('.edit-food-item');
    const updatedFoods = [];
    let totalCal = 0, totalPro = 0, totalFat = 0, totalCarb = 0;

    items.forEach((item) => {
      const name = item.querySelector('.edit-name')?.value || '未命名項目';
      const portion = item.querySelector('.edit-portion')?.value || '';
      const cal  = parseFloat(item.querySelector('.edit-cal')?.value)  || 0;
      const pro  = parseFloat(item.querySelector('.edit-pro')?.value)  || 0;
      const fat  = parseFloat(item.querySelector('.edit-fat')?.value)  || 0;
      const carb = parseFloat(item.querySelector('.edit-carb')?.value) || 0;

      updatedFoods.push({
        name,
        portion,
        calories: cal,
        protein_g: pro,
        fat_g: fat,
        carbs_g: carb,
      });

      totalCal  += cal;
      totalPro  += pro;
      totalFat  += fat;
      totalCarb += carb;
    });

    const updatedMeal = {
      ...meal,
      foods: updatedFoods,
      total_calories: Math.round(totalCal * 10) / 10,
      total_protein_g: Math.round(totalPro * 10) / 10,
      total_fat_g: Math.round(totalFat * 10) / 10,
      total_carbs_g: Math.round(totalCarb * 10) / 10,
    };

    updateMeal(dateStr, mealId, updatedMeal);
    modal.classList.add('hidden');
    renderTodayMeals();
    updateTodaySummary();
    showToast('餐點已更新');
  });

  // Cancel handler
  cancelBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  // Close on backdrop click
  const backdropHandler = (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
      modal.removeEventListener('click', backdropHandler);
    }
  };
  modal.addEventListener('click', backdropHandler);
}

// ── Confirm Modal ───────────────────────────────────────

/**
 * Shows a confirm dialog and returns a Promise<boolean>.
 */
export function showConfirmModal(message) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    if (!modal) {
      resolve(window.confirm(message));
      return;
    }

    const body = modal.querySelector('.modal-body') ?? modal;

    body.innerHTML = `
      <div class="confirm-content">
        <p class="confirm-message">${_escapeHtml(message)}</p>
        <div class="modal-actions">
          <button id="confirm-yes-btn" class="btn btn-primary">確定</button>
          <button id="confirm-no-btn" class="btn btn-ghost">取消</button>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');

    const cleanup = () => {
      modal.classList.add('hidden');
      modal.removeEventListener('click', backdropHandler);
    };

    const backdropHandler = (e) => {
      if (e.target === modal) {
        cleanup();
        resolve(false);
      }
    };

    document.getElementById('confirm-yes-btn')?.addEventListener(
      'click',
      () => { cleanup(); resolve(true); },
      { once: true }
    );

    document.getElementById('confirm-no-btn')?.addEventListener(
      'click',
      () => { cleanup(); resolve(false); },
      { once: true }
    );

    modal.addEventListener('click', backdropHandler);
  });
}

// ── Helpers ─────────────────────────────────────────────

function _escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function _formatTime(timestamp) {
  if (!timestamp) return '';
  try {
    const d = new Date(timestamp);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

function _getWeekday(dateStr) {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    return `週${days[d.getDay()]}`;
  } catch {
    return '';
  }
}

// ── Favorites ────────────────────────────────────────────

/**
 * Renders the favorites list.
 */
export function renderFavorites() {
  const list = document.getElementById('favorites-list');
  if (!list) return;

  const items = getAllFavorites();

  if (!items.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⭐</div>
        <p>還沒有常吃的食物</p>
        <p class="empty-hint">點擊右上角「+ 新增」或在今日清單按 ⭐ 加入！</p>
      </div>
    `;
    return;
  }

  list.innerHTML = items.map((item) => `
    <div class="favorite-card glass-card" data-fav-id="${item.id}">
      <div class="favorite-card-header">
        <div class="favorite-info">
          <h3 class="favorite-name">${_escapeHtml(item.name)}</h3>
          <p class="favorite-desc">${_escapeHtml(item.description)}</p>
        </div>
        <div class="favorite-actions">
          <button class="icon-btn fav-edit-btn" data-fav-id="${item.id}" title="編輯">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn fav-add-today-btn" data-fav-id="${item.id}" title="加入今日">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button class="icon-btn fav-delete-btn" data-fav-id="${item.id}" title="刪除">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
      <div class="favorite-nutrition">
        <span class="fav-cal">🔥 ${item.total_calories} kcal</span>
        <span>蛋白質 ${item.total_protein_g}g</span>
        <span>脂肪 ${item.total_fat_g}g</span>
        <span>碳水 ${item.total_carbs_g}g</span>
      </div>
    </div>
  `).join('');

  // Bind "Add to Today" buttons
  list.querySelectorAll('.fav-add-today-btn').forEach((btn) => {
    btn.addEventListener('click', () => _addFavToToday(btn.dataset.favId));
  });

  // Bind edit buttons
  list.querySelectorAll('.fav-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => showEditFavoriteModal(btn.dataset.favId));
  });

  // Bind delete buttons
  list.querySelectorAll('.fav-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const yes = await showConfirmModal('確定要從常吃清單刪除嗎？');
      if (yes) {
        deleteFavorite(btn.dataset.favId);
        renderFavorites();
        showToast('已從常吃清單移除');
      }
    });
  });
}

function _addFavToToday(favId) {
  const { getFavoriteById } = _getFavModule();
  const fav = getFavoriteById(favId);
  if (!fav) return;

  // Ask which meal type via a simple select modal
  const mealTypes = ['早餐', '午餐', '晚餐', '點心'];
  const select = document.createElement('select');
  select.innerHTML = mealTypes.map(t => `<option value="${t}">${t}</option>`).join('');

  const modal = document.getElementById('edit-modal');
  const body = document.getElementById('edit-modal-body');
  if (!modal || !body) return;

  body.innerHTML = `
    <h3>🍽️ 加入今日紀錄</h3>
    <p style="margin-bottom: 1rem; color: var(--text-secondary);">選擇這餐要加到哪個時段：</p>
    <select id="fav-meal-type-select" style="width:100%; padding:10px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); font-size: 1rem; margin-bottom: 1.5rem;">
      <option value="早餐">🌅 早餐</option>
      <option value="午餐">☀️ 午餐</option>
      <option value="晚餐">🌙 晚餐</option>
      <option value="點心">🍩 點心</option>
    </select>
  `;
  modal.classList.remove('hidden');

  const oldSave = document.getElementById('edit-save-btn');
  const saveBtn = oldSave.cloneNode(true);
  saveBtn.textContent = '✅ 加入今日';
  oldSave.parentNode.replaceChild(saveBtn, oldSave);

  const oldCancel = document.getElementById('edit-cancel-btn');
  const cancelBtn = oldCancel.cloneNode(true);
  oldCancel.parentNode.replaceChild(cancelBtn, oldCancel);

  saveBtn.addEventListener('click', async () => {
    const mealType = document.getElementById('fav-meal-type-select')?.value || '其他';
    try {
      await saveMeal({
        meal_type: mealType,
        foods: fav.foods,
        total_calories: fav.total_calories,
        total_protein_g: fav.total_protein_g,
        total_fat_g: fav.total_fat_g,
        total_carbs_g: fav.total_carbs_g,
        notes: `來自常吃清單：${fav.name}`,
      });
      modal.classList.add('hidden');
      showToast(`${fav.name} 已加入今日${mealType}！`);
      if (typeof updateTodaySummary === 'function') updateTodaySummary();
      renderTodayMeals();
    } catch (err) {
      showToast('新增失敗：' + (err.message || '請稍後再試'), 'error');
    }
  });

  cancelBtn.addEventListener('click', () => modal.classList.add('hidden'));
}

// Lazy import to avoid circular dep
function _getFavModule() {
  return { getFavoriteById: (id) => getAllFavorites().find(f => f.id === id) ?? null };
}

/**
 * Shows the add-favorite modal for manually adding a new favorite food.
 */
export function showAddFavoriteModal() {
  showFavoriteEditorModal({ mode: 'add' });
}

function showEditFavoriteModal(favId) {
  const { getFavoriteById } = _getFavModule();
  const favorite = getFavoriteById(favId);
  if (!favorite) return;

  showFavoriteEditorModal({ mode: 'edit', favorite });
}

function showFavoriteEditorModal({ mode, favorite = null }) {
  const modal = document.getElementById('edit-modal');
  const body = document.getElementById('edit-modal-body');
  if (!modal || !body) return;

  const isEditing = mode === 'edit';
  const foods = favorite?.foods?.length ? favorite.foods : [{}];

  body.innerHTML = `
    <h3>${isEditing ? '編輯常吃項目' : '新增常吃項目'}</h3>
    <div class="nf-field" style="margin-bottom: 1rem;">
      <label>名稱（整道餐點的名稱）</label>
      <input id="new-fav-name" type="text" placeholder="例：水煮雞胸肉" value="${_escapeHtml(favorite?.name ?? '')}">
    </div>
    <div class="nf-field" style="margin-bottom: 1rem;">
      <label>描述</label>
      <textarea id="new-fav-description" rows="3" placeholder="例：雞胸肉 120g、白飯半碗">${_escapeHtml(favorite?.description ?? '')}</textarea>
    </div>
    <div id="new-fav-foods-list">
      ${foods.map((food) => _getFavoriteFoodRowHtml(food)).join('')}
    </div>
    <button id="add-fav-row-btn" class="btn btn-secondary btn-sm" style="margin-bottom: 1rem;">+ 新增食物項目</button>
  `;

  modal.classList.remove('hidden');

  const foodsList = document.getElementById('new-fav-foods-list');

  foodsList.addEventListener('click', (e) => {
    if (e.target.closest('.btn-delete-food')) {
      const row = e.target.closest('.new-fav-food-row');
      if (row && foodsList.children.length > 1) row.remove();
    }
  });

  document.getElementById('add-fav-row-btn')?.addEventListener('click', () => {
    foodsList.insertAdjacentHTML('beforeend', _getFavoriteFoodRowHtml());
  });

  const oldSave = document.getElementById('edit-save-btn');
  const saveBtn = oldSave.cloneNode(true);
  saveBtn.textContent = isEditing ? '儲存修改' : '儲存到常吃清單';
  oldSave.parentNode.replaceChild(saveBtn, oldSave);

  const oldCancel = document.getElementById('edit-cancel-btn');
  const cancelBtn = oldCancel.cloneNode(true);
  oldCancel.parentNode.replaceChild(cancelBtn, oldCancel);

  saveBtn.addEventListener('click', async () => {
    const item = buildFavoriteItemFromForm(_readFavoriteFormData(foodsList));

    try {
      saveBtn.disabled = true;
      if (isEditing) {
        await updateFavorite(favorite.id, item);
      } else {
        await addFavorite(item);
      }
      modal.classList.add('hidden');
      renderFavorites();
      showToast(isEditing ? `${item.name} 已更新` : `${item.name} 已加入常吃清單`);
    } catch (err) {
      showToast((isEditing ? '修改常吃失敗：' : '新增常吃失敗：') + (err.message || '請稍後再試'), 'error');
    } finally {
      saveBtn.disabled = false;
    }
  });

  cancelBtn.addEventListener('click', () => modal.classList.add('hidden'));
}

function _getFavoriteFoodRowHtml(food = {}) {
  return `
    <div class="new-fav-food-row">
      <div class="nf-row-header">
        <span class="nf-row-label">食物項目</span>
        <button type="button" class="btn-delete-food" title="刪除此項">刪除</button>
      </div>
      <div class="nf-field">
        <label>食物名稱</label>
        <input type="text" class="nf-name" placeholder="例：白飯" value="${_escapeHtml(food.name ?? '')}">
      </div>
      <div class="nf-field">
        <label>份量</label>
        <input type="text" class="nf-portion" placeholder="例：1碗 (150g)" value="${_escapeHtml(food.portion ?? '')}">
      </div>
      <div class="nf-fields-grid">
        <div class="nf-field">
          <label>熱量 (kcal)</label>
          <input type="number" class="nf-cal" placeholder="0" min="0" step="1" value="${_escapeHtml(food.calories ?? '')}">
        </div>
        <div class="nf-field">
          <label>蛋白質 (g)</label>
          <input type="number" class="nf-pro" placeholder="0" min="0" step="0.1" value="${_escapeHtml(food.protein_g ?? '')}">
        </div>
        <div class="nf-field">
          <label>脂肪 (g)</label>
          <input type="number" class="nf-fat" placeholder="0" min="0" step="0.1" value="${_escapeHtml(food.fat_g ?? '')}">
        </div>
        <div class="nf-field">
          <label>碳水 (g)</label>
          <input type="number" class="nf-carb" placeholder="0" min="0" step="0.1" value="${_escapeHtml(food.carbs_g ?? '')}">
        </div>
      </div>
    </div>
  `;
}

function _readFavoriteFormData(foodsList) {
  return {
    name: document.getElementById('new-fav-name')?.value ?? '',
    description: document.getElementById('new-fav-description')?.value ?? '',
    foods: Array.from(foodsList.querySelectorAll('.new-fav-food-row')).map((row) => ({
      name: row.querySelector('.nf-name')?.value ?? '',
      portion: row.querySelector('.nf-portion')?.value ?? '',
      calories: row.querySelector('.nf-cal')?.value ?? 0,
      protein_g: row.querySelector('.nf-pro')?.value ?? 0,
      fat_g: row.querySelector('.nf-fat')?.value ?? 0,
      carbs_g: row.querySelector('.nf-carb')?.value ?? 0,
    })),
  };
}
