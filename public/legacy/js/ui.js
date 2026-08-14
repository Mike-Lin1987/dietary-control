import {
  getAllMeals,
  getDatesWithData,
  getGoals,
  getMealsByDate,
  getSummaryForDate,
  getTodayKey,
  getTodaySummary,
  isCompleteDay,
  saveMeal,
  updateMeal,
  deleteMeal,
  addFavorite,
  deleteFavorite,
  getAllFavorites,
  updateFavorite,
} from './storage.js';
import { buildFavoriteItemFromForm } from './favorite-utils.js';
import { updateCalorieRing, updateMacroBars } from './charts.js';

export function showLoading(message = 'AI 分析中…') {
  const text = document.getElementById('loading-text');
  if (text) text.textContent = message;
  document.getElementById('loading-overlay')?.classList.remove('hidden');
}

export function hideLoading() {
  document.getElementById('loading-overlay')?.classList.add('hidden');
}

export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '!' : 'i'}</span><span class="toast-message">${_escapeHtml(message)}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-visible'));
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 500);
  }, 3000);
}

export function showUndoToast(message, undo) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast toast-info toast-with-action';
  toast.innerHTML = `<span class="toast-message">${_escapeHtml(message)}</span><button class="toast-action">復原</button>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-visible'));
  let used = false;
  toast.querySelector('.toast-action')?.addEventListener('click', async () => {
    if (used) return;
    used = true;
    try { await undo(); } catch (error) { showToast(error.message || '復原失敗', 'error'); } finally { toast.remove(); }
  });
  setTimeout(() => { if (!used) toast.remove(); }, 8000);
}

export function renderAnalysisResults(data, userNote = '') {
  const container = document.getElementById('results-container');
  if (!container) return null;
  const confidence = { high: '高信心', medium: '中信心', low: '低信心' }[data.confidence] || '中信心';
  const foods = Array.isArray(data.foods) ? data.foods : [];
  container.innerHTML = `
    <div class="results-card glass-card">
      <div class="results-header"><div><span class="section-kicker">AI 初步估算</span><h2>請確認餐點內容</h2></div><div class="results-badges"><span class="badge confidence-badge confidence-${_escapeHtml(data.confidence || 'medium')}">${confidence}</span><span class="badge meal-type-badge">${_escapeHtml(data.meal_type || '餐點')}</span></div></div>
      <p class="review-hint">數值是估算結果，儲存前可直接修改名稱、份量與營養資訊。</p>
      <div id="analysis-food-list" class="analysis-food-list">${foods.map((food, index) => _analysisFoodHtml(food, index)).join('')}</div>
      <button id="analysis-add-food-btn" class="text-btn add-inline-btn">＋ 新增食物項目</button>
      <div class="analysis-total"><span>目前合計</span><strong id="analysis-total-calories">${_number(data.total_calories)} kcal</strong><span id="analysis-total-macros">蛋白質 ${_number(data.total_protein_g)}g · 脂肪 ${_number(data.total_fat_g)}g · 碳水 ${_number(data.total_carbs_g)}g</span></div>
      <label class="analysis-notes-label" for="analysis-user-note">備註</label><textarea id="analysis-user-note" class="reanalyze-input" rows="2" placeholder="例如：飯吃一半、醬料少、炸皮沒吃">${_escapeHtml(data.notes || userNote)}</textarea>
      <p class="review-hint">如需重新辨識，請捨棄結果後重新選擇照片。</p>
      <div class="results-actions"><button id="favorite-result-btn" class="btn btn-secondary">加入常吃</button><button id="save-result-btn" class="btn btn-primary">確認並儲存</button><button id="discard-result-btn" class="btn btn-ghost">捨棄</button></div>
    </div>`;
  container.classList.remove('hidden');
  container.querySelector('#analysis-add-food-btn')?.addEventListener('click', () => {
    const list = container.querySelector('#analysis-food-list');
    if (list) list.insertAdjacentHTML('beforeend', _analysisFoodHtml({}, list.children.length));
  });
  container.oninput = _updateAnalysisTotal;
  container.addEventListener('change', (event) => { if (event.target.closest?.('.analysis-food-row')) { _scaleFoodNutrients(event.target, '.analysis-quantity', ['.analysis-calories', '.analysis-protein', '.analysis-fat', '.analysis-carbs']); _updateAnalysisTotal({ target: event.target }); } });
  container.querySelectorAll('.analysis-remove-food').forEach((button) => button.addEventListener('click', () => {
    const row = button.closest('.analysis-food-row');
    if (row && container.querySelectorAll('.analysis-food-row').length > 1) { row.remove(); _updateAnalysisTotal({ target: container.querySelector('#analysis-food-list') }); }
  }));
  container.querySelector('#discard-result-btn')?.addEventListener('click', () => { container.innerHTML = ''; container.classList.add('hidden'); });
  return container.querySelector('#save-result-btn');
}

export function getAnalysisDraft(fallback = {}) {
  const list = document.getElementById('analysis-food-list');
  const foods = list ? Array.from(list.querySelectorAll('.analysis-food-row')).map((row) => ({
    name: row.querySelector('.analysis-name')?.value.trim() || '未命名項目',
    portion: row.querySelector('.analysis-portion')?.value.trim() || '',
    quantity: _numberValue(row.querySelector('.analysis-quantity')?.value, 1),
    unit: row.querySelector('.analysis-unit')?.value.trim() || '',
    weight_grams: _numberValue(row.querySelector('.analysis-weight')?.value, 0),
    calories: _numberValue(row.querySelector('.analysis-calories')?.value, 0),
    protein_g: _numberValue(row.querySelector('.analysis-protein')?.value, 0),
    fat_g: _numberValue(row.querySelector('.analysis-fat')?.value, 0),
    carbs_g: _numberValue(row.querySelector('.analysis-carbs')?.value, 0),
    source: row.querySelector('.analysis-source')?.value.trim() || 'AI',
    confidence: row.querySelector('.analysis-confidence')?.value || fallback.confidence || 'medium',
  })) : (fallback.foods || []);
  const totals = foods.reduce((sum, food) => ({
    calories: sum.calories + Number(food.calories || 0), protein_g: sum.protein_g + Number(food.protein_g || 0),
    fat_g: sum.fat_g + Number(food.fat_g || 0), carbs_g: sum.carbs_g + Number(food.carbs_g || 0),
  }), { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 });
  return { ...fallback, foods, total_calories: _round(totals.calories), total_protein_g: _round(totals.protein_g), total_fat_g: _round(totals.fat_g), total_carbs_g: _round(totals.carbs_g), notes: document.getElementById('analysis-user-note')?.value.trim() || '' };
}

function _analysisFoodHtml(food = {}, index = 0) {
  return `<div class="analysis-food-row" data-index="${index}"><div class="analysis-food-heading"><input class="analysis-name" type="text" value="${_escapeHtml(food.name || '')}" placeholder="食物名稱"><button type="button" class="icon-btn analysis-remove-food" title="刪除此項" aria-label="刪除食物">×</button></div><div class="analysis-food-grid"><label>份量<input class="analysis-portion" type="text" value="${_escapeHtml(food.portion || '')}" placeholder="1 碗"></label><label>數量<input class="analysis-quantity" type="number" min="0" step="0.1" value="${_number(food.quantity, 1)}"></label><label>單位<input class="analysis-unit" type="text" value="${_escapeHtml(food.unit || '')}" placeholder="份"></label><label>重量 g<input class="analysis-weight" type="number" min="0" step="1" value="${_number(food.weight_grams, 0)}"></label></div><div class="analysis-food-grid nutrient-grid"><label>熱量<input class="analysis-calories" type="number" min="0" step="0.1" value="${_number(food.calories)}"></label><label>蛋白質<input class="analysis-protein" type="number" min="0" step="0.1" value="${_number(food.protein_g)}"></label><label>脂肪<input class="analysis-fat" type="number" min="0" step="0.1" value="${_number(food.fat_g)}"></label><label>碳水<input class="analysis-carbs" type="number" min="0" step="0.1" value="${_number(food.carbs_g)}"></label></div><div class="analysis-food-meta"><label>來源<input class="analysis-source" type="text" value="${_escapeHtml(food.source || 'AI')}" placeholder="AI／手動"></label><label>信心<select class="analysis-confidence"><option value="high" ${food.confidence === 'high' ? 'selected' : ''}>高</option><option value="medium" ${!food.confidence || food.confidence === 'medium' ? 'selected' : ''}>中</option><option value="low" ${food.confidence === 'low' ? 'selected' : ''}>低</option></select></label></div></div>`;
}

function _updateAnalysisTotal(event) {
  if (!event.target.closest?.('#analysis-food-list')) return;
  const draft = getAnalysisDraft({});
  const total = document.getElementById('analysis-total-calories');
  const macros = document.getElementById('analysis-total-macros');
  if (total) total.textContent = `${_number(draft.total_calories)} kcal`;
  if (macros) macros.textContent = `蛋白質 ${_number(draft.total_protein_g)}g · 脂肪 ${_number(draft.total_fat_g)}g · 碳水 ${_number(draft.total_carbs_g)}g`;
}

export function renderTodayMeals() {
  const list = document.getElementById('today-meals-list');
  if (!list) return;
  const date = getTodayKey();
  const meals = getMealsByDate(date);
  const dateLabel = document.getElementById('record-date-label');
  if (dateLabel) dateLabel.textContent = `${date} · ${_getWeekday(date)}`;
  if (!meals.length) { list.innerHTML = '<div class="empty-state"><span class="empty-icon">○</span><p>今天還沒有紀錄</p><p class="empty-hint">用下方「＋」新增第一餐。</p></div>'; return; }
  const order = ['早餐', '午餐', '晚餐', '點心', '其他'];
  const groups = new Map();
  for (const meal of meals) { const key = meal.meal_type || '其他'; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(meal); }
  list.innerHTML = Array.from(groups.entries()).sort(([a], [b]) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b))).map(([type, rows]) => `<section class="meal-group glass-card" data-meal-type="${_escapeHtml(type)}"><div class="meal-group-heading"><h2>${_escapeHtml(type)}</h2><span class="muted-label">${rows.length} 筆</span></div>${rows.map((meal) => _mealRowHtml(meal)).join('')}</section>`).join('');
  _bindMealActions(list);
}

function _mealRowHtml(meal) {
  const eatenAt = _formatTime(meal.eaten_at || meal.timestamp);
  const recordedAt = _formatTime(meal.timestamp);
  const recordNote = recordedAt && recordedAt !== eatenAt ? `<small class="record-time">紀錄於 ${recordedAt}</small>` : '';
  return `<article class="meal-item" data-meal-id="${_escapeHtml(meal.id)}"><div class="meal-item-header"><div><time class="meal-time">${eatenAt}</time>${recordNote}<strong class="meal-title">${_escapeHtml((meal.foods || []).map((food) => food.name).filter(Boolean).slice(0, 3).join('、') || '未命名餐點')}</strong></div><div class="meal-item-actions"><button class="icon-btn add-fav-btn" data-id="${_escapeHtml(meal.id)}" title="加入常吃" aria-label="加入常吃">☆</button><button class="icon-btn edit-meal-btn" data-id="${_escapeHtml(meal.id)}" title="編輯" aria-label="編輯">✎</button><button class="icon-btn delete-meal-btn" data-id="${_escapeHtml(meal.id)}" title="刪除" aria-label="刪除">⌫</button></div></div><div class="meal-food-list">${(meal.foods || []).map((food) => `<div class="meal-food-item"><span>${_escapeHtml(food.name || '未命名項目')} <small>${_escapeHtml(_foodPortion(food))}</small></span><span class="food-cal">${_number(food.calories)} kcal</span></div>`).join('')}</div><div class="meal-total">${_number(meal.total_calories)} kcal <span>·</span> 蛋白質 ${_number(meal.total_protein_g)}g <span>·</span> 脂肪 ${_number(meal.total_fat_g)}g <span>·</span> 碳水 ${_number(meal.total_carbs_g)}g</div></article>`;
}

function _bindMealActions(root) {
  root.querySelectorAll('.add-fav-btn').forEach((button) => button.addEventListener('click', async () => {
    const meal = getAllMeals().find((item) => item.id === button.dataset.id);
    if (!meal) return;
    try { await addFavorite({ name: meal.meal_type || '我的餐點', description: (meal.foods || []).map((food) => `${food.name} ${_foodPortion(food)}`).join('、'), foods: meal.foods || [], total_calories: meal.total_calories || 0, total_protein_g: meal.total_protein_g || 0, total_fat_g: meal.total_fat_g || 0, total_carbs_g: meal.total_carbs_g || 0 }); showToast('已加入常吃清單'); } catch (error) { showToast(error.message || '加入常吃失敗', 'error'); }
  }));
  root.querySelectorAll('.edit-meal-btn').forEach((button) => button.addEventListener('click', () => { const meal = getAllMeals().find((item) => item.id === button.dataset.id); if (meal) showEditModal(meal.meal_date, meal.id); }));
  root.querySelectorAll('.delete-meal-btn').forEach((button) => button.addEventListener('click', async () => {
    const meal = getAllMeals().find((item) => item.id === button.dataset.id);
    if (!meal || !await showConfirmModal('確定要刪除這筆餐點紀錄嗎？')) return;
     await deleteMeal(meal.id);
     renderTodayMeals(); updateTodaySummary();
     showUndoToast('已刪除餐點紀錄', async () => { await saveMeal({ ...meal, id: meal.id }); renderTodayMeals(); updateTodaySummary(); renderHistory(); });
  }));
}

export function renderHistory() {
  const list = document.getElementById('history-list');
  if (!list) return;
  const picker = document.getElementById('history-date-picker');
  const filterDate = picker?.value || '';
  const dates = getDatesWithData().filter((date) => !filterDate || date === filterDate).sort((a, b) => b.localeCompare(a));
  _renderTrendSummary();
  _renderTrendChart();
  _renderProteinTrendChart();
  if (!dates.length) { list.innerHTML = '<div class="empty-state"><span class="empty-icon">□</span><p>沒有符合條件的紀錄</p></div>'; return; }
  list.innerHTML = dates.map((date) => {
    const meals = getMealsByDate(date); const summary = getSummaryForDate(date);
    return `<article class="history-card glass-card"><button class="history-card-header" data-date="${date}"><span class="history-date-info"><strong>${date}</strong><span>${_getWeekday(date)} · ${meals.length} 筆</span></span><span class="history-summary-mini"><strong>${_number(summary.calories)} kcal</strong><span>蛋 ${_number(summary.protein_g)}g · 脂 ${_number(summary.fat_g)}g · 碳 ${_number(summary.carbs_g)}g</span></span><span class="history-expand-icon">⌄</span></button><div class="history-card-body hidden">${meals.map((meal) => `<div class="history-meal-item"><div class="history-meal-header"><span class="badge meal-type-badge">${_escapeHtml(meal.meal_type || '其他')}</span><span class="meal-time">${_formatTime(meal.eaten_at || meal.timestamp)}</span><div class="history-actions"><button class="icon-btn history-edit-btn" data-id="${_escapeHtml(meal.id)}" title="編輯" aria-label="編輯">✎</button><button class="icon-btn history-delete-btn" data-id="${_escapeHtml(meal.id)}" title="刪除" aria-label="刪除">⌫</button></div></div><div class="meal-food-list">${(meal.foods || []).map((food) => `<div class="meal-food-item"><span>${_escapeHtml(food.name || '未命名項目')} <small>${_escapeHtml(_foodPortion(food))}</small></span><span class="food-cal">${_number(food.calories)} kcal</span></div>`).join('')}</div><div class="meal-total">${_number(meal.total_calories)} kcal · 蛋白質 ${_number(meal.total_protein_g)}g · 脂肪 ${_number(meal.total_fat_g)}g · 碳水 ${_number(meal.total_carbs_g)}g</div></div>`).join('')}</div></article>`;
  }).join('');
  list.querySelectorAll('.history-card-header').forEach((header) => header.addEventListener('click', () => { const body = header.nextElementSibling; body?.classList.toggle('hidden'); header.querySelector('.history-expand-icon').textContent = body?.classList.contains('hidden') ? '⌄' : '⌃'; }));
  list.querySelectorAll('.history-edit-btn').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); const meal = getAllMeals().find((item) => item.id === button.dataset.id); if (meal) showEditModal(meal.meal_date, meal.id); }));
   list.querySelectorAll('.history-delete-btn').forEach((button) => button.addEventListener('click', async (event) => { event.stopPropagation(); const meal = getAllMeals().find((item) => item.id === button.dataset.id); if (!meal || !await showConfirmModal('確定要刪除這筆紀錄嗎？')) return; await deleteMeal(meal.id); renderHistory(); updateTodaySummary(); showUndoToast('已刪除紀錄', async () => { await saveMeal({ ...meal, id: meal.id }); renderHistory(); updateTodaySummary(); renderTodayMeals(); }); }));
}

function _renderTrendSummary() {
  const container = document.getElementById('trend-summary'); if (!container) return;
  const days = Number(document.getElementById('trend-range')?.value || 7); const dates = _getDateWindow(days); const recordedDates = dates.filter((date) => getMealsByDate(date).length); const summaries = recordedDates.map(getSummaryForDate); const goals = getGoals();
  const average = (key) => summaries.length ? summaries.reduce((sum, item) => sum + item[key], 0) / summaries.length : 0;
  const complete = recordedDates.filter(isCompleteDay).length; const caloriesMet = summaries.filter((item) => item.calories <= goals.calories).length; const proteinMet = summaries.filter((item) => item.protein_g >= goals.protein_g).length;
  const delta = average('calories') - goals.calories; const sentence = !summaries.length ? '先完成幾天記錄，趨勢會更有參考價值。未紀錄日期不會當成 0 kcal。' : `區間 ${days} 天中有紀錄 ${summaries.length} 天，其中 ${complete} 天完成早餐、午餐與晚餐。${delta > 0 ? `平均熱量高於目標 ${_number(delta)} kcal` : `平均熱量低於目標 ${_number(Math.abs(delta))} kcal`}。`;
  container.innerHTML = `<div class="trend-summary-grid"><div><span class="metric-label">平均熱量</span><strong>${_number(average('calories'))} <small>kcal</small></strong></div><div><span class="metric-label">平均蛋白質</span><strong>${_number(average('protein_g'))} <small>g</small></strong></div><div><span class="metric-label">平均脂肪</span><strong>${_number(average('fat_g'))} <small>g</small></strong></div><div><span class="metric-label">平均碳水</span><strong>${_number(average('carbs_g'))} <small>g</small></strong></div><div><span class="metric-label">完整紀錄</span><strong>${complete} <small>/ ${days} 天</small></strong></div><div><span class="metric-label">達標</span><strong>${caloriesMet} <small>熱量 · 蛋白質 ${proteinMet} 天</small></strong></div></div><p class="trend-summary-text">${sentence}</p>`;
}

function _renderTrendChart() {
  const container = document.getElementById('trend-chart'); if (!container) return;
  const days = Number(document.getElementById('trend-range')?.value || 7); const dates = _getDateWindow(days).reverse(); const goal = getGoals().calories; const max = Math.max(goal, ...dates.map((date) => getSummaryForDate(date).calories), 1);
  container.innerHTML = `<div class="trend-chart-header"><div><h2>每日熱量</h2><span class="muted-label">目標 ${_number(goal)} kcal</span></div><span class="trend-legend"><i></i>已記錄</span></div><div class="trend-bars">${dates.map((date) => { const recorded = getMealsByDate(date).length > 0; const value = getSummaryForDate(date).calories; return `<div class="trend-bar-column ${recorded ? '' : 'is-unrecorded'}"><span class="trend-bar-value">${recorded ? Math.round(value) : '—'}</span><div class="trend-bar-track"><div class="trend-bar-fill ${value > goal ? 'is-over' : ''}" style="height:${recorded ? Math.max(8, Math.round(value / max * 100)) : 0}%"></div><span class="trend-goal-line" style="bottom:${Math.round(goal / max * 100)}%"></span></div><span class="trend-bar-label">${date.slice(5)}</span></div>`; }).join('')}</div>`;
}

function _renderProteinTrendChart() {
  const container = document.getElementById('trend-protein-chart'); if (!container) return;
  const days = Number(document.getElementById('trend-range')?.value || 7); const dates = _getDateWindow(days).reverse(); const goal = getGoals().protein_g; const max = Math.max(goal, ...dates.map((date) => getSummaryForDate(date).protein_g), 1);
  container.innerHTML = `<div class="trend-chart-header"><div><h2>每日蛋白質</h2><span class="muted-label">目標 ${_number(goal)} g</span></div><span class="trend-legend"><i></i>已記錄</span></div><div class="trend-bars">${dates.map((date) => { const recorded = getMealsByDate(date).length > 0; const value = getSummaryForDate(date).protein_g; return `<div class="trend-bar-column ${recorded ? '' : 'is-unrecorded'}"><span class="trend-bar-value">${recorded ? _number(value) : '—'}</span><div class="trend-bar-track"><div class="trend-bar-fill ${value > goal ? 'is-over' : ''}" style="height:${recorded ? Math.max(8, Math.round(value / max * 100)) : 0}%"></div><span class="trend-goal-line" style="bottom:${Math.round(goal / max * 100)}%"></span></div><span class="trend-bar-label">${date.slice(5)}</span></div>`; }).join('')}</div>`;
}

export function updateTodaySummary() {
  const summary = getTodaySummary(); const goals = getGoals(); const remaining = goals.calories - summary.calories; const meals = getMealsByDate(getTodayKey());
  updateCalorieRing(summary.calories, goals.calories); updateMacroBars(summary.protein_g, summary.fat_g, summary.carbs_g, goals);
  const consumed = document.getElementById('summary-consumed-text'); const remainingEl = document.getElementById('summary-remaining-text'); const count = document.getElementById('today-meal-count'); const status = document.getElementById('today-status'); const insight = document.getElementById('today-insight');
  if (consumed) consumed.textContent = `${_number(summary.calories)} kcal`; if (remainingEl) remainingEl.textContent = remaining >= 0 ? `${_number(remaining)} kcal` : `已超出 ${_number(Math.abs(remaining))} kcal`;
  if (count) count.textContent = `${meals.length} 餐`;
  if (status) { status.textContent = summary.calories === 0 ? '尚未開始' : remaining >= 0 ? '目標內' : '已超過'; status.className = `status-pill ${summary.calories === 0 ? 'status-neutral' : remaining >= 0 ? 'status-good' : 'status-over'}`; }
  _setMacroStatus('protein', summary.protein_g, goals.protein_g); _setMacroStatus('fat', summary.fat_g, goals.fat_g); _setMacroStatus('carbs', summary.carbs_g, goals.carbs_g);
  if (insight) { const suggestions = _nextMealSuggestions(summary, goals); insight.innerHTML = `<span class="insight-icon" aria-hidden="true">i</span><span><strong>下一餐怎麼吃？</strong> ${suggestions.join(' ')}<small>一般飲食參考，不取代醫療或營養師建議。</small></span>`; }
  _renderTodayMealSummary(meals);
}

function _getDateWindow(days) {
  const end = new Date(`${getTodayKey()}T00:00:00Z`);
  return Array.from({ length: days }, (_, index) => { const date = new Date(end); date.setUTCDate(end.getUTCDate() - index); return date.toISOString().slice(0, 10); });
}

function _setMacroStatus(name, value, goal) {
  const element = document.getElementById(`summary-${name}-status`); if (!element) return;
  const difference = goal - value; const ratio = goal > 0 ? value / goal : 1;
  const status = difference < 0 ? { label: `已超出 ${_number(Math.abs(difference))}g`, className: 'is-over' } : ratio >= 0.95 ? { label: ratio >= 1 ? '已達標' : `接近目標，還差 ${_number(difference)}g`, className: 'is-good' } : { label: `尚不足 ${_number(difference)}g`, className: 'is-low' };
  element.textContent = status.label; element.className = `macro-status ${status.className}`;
}

function _nextMealSuggestions(summary, goals) {
  const suggestions = [];
  if (summary.fat_g > goals.fat_g) suggestions.push('今天脂肪已偏高，下一餐優先選低脂蛋白質，搭配兩份蔬菜，減少炸物、堅果、起司與額外醬汁。');
  if (goals.protein_g - summary.protein_g > 30) suggestions.push(`蛋白質仍不足，下一餐可補充約 30～40g，選雞胸、白肉魚、蝦、豆腐或無糖高蛋白飲。`);
  if (goals.calories - summary.calories < 400 && goals.calories - summary.calories >= 0) suggestions.push('今日剩餘熱量較少，建議選低油、足量蛋白質及蔬菜。');
  if (goals.carbs_g - summary.carbs_g > 30 && goals.calories - summary.calories >= 400) suggestions.push('碳水仍有空間，可補充半碗至一碗飯、地瓜或燕麥。');
  if (!suggestions.length) suggestions.push('目前分布穩定，下一餐依剩餘熱量搭配蛋白質與蔬菜即可。');
  return suggestions.slice(0, 3);
}

function _renderTodayMealSummary(meals) {
  const container = document.getElementById('today-meal-summary'); if (!container) return;
  const groups = ['早餐', '午餐', '晚餐', '點心'].map((type) => { const rows = meals.filter((meal) => meal.meal_type === type); return { type, rows, calories: rows.reduce((sum, meal) => sum + Number(meal.total_calories || 0), 0), foods: rows.reduce((sum, meal) => sum + (meal.foods || []).length, 0) }; });
  container.innerHTML = `<div class="today-meal-summary-header"><span class="section-kicker">今日餐別</span><span class="muted-label">快速查看</span></div><div class="today-meal-summary-grid">${groups.map((group) => `<button class="today-meal-card ${group.rows.length ? 'has-record' : ''}" data-meal-type="${group.type}"><span>${group.type}</span><strong>${group.rows.length ? `${_number(group.calories)} kcal` : '尚未記錄'}</strong><small>${group.rows.length ? `${group.foods} 個食物項目` : '點擊新增'}</small></button>`).join('')}</div>`;
  container.querySelectorAll('.today-meal-card').forEach((button) => button.addEventListener('click', () => { document.querySelector('[data-view="view-today"]')?.click(); setTimeout(() => document.querySelector(`.meal-group[data-meal-type="${button.dataset.mealType}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }));
}

export function showEditModal(dateStr, mealId) {
  const meal = getMealsByDate(dateStr).find((item) => item.id === mealId) || getAllMeals().find((item) => item.id === mealId); if (meal) _showMealEditor({ meal });
}

export function showManualMealModal() { _showMealEditor({ meal: null }); }

function _showMealEditor({ meal }) {
  const modal = document.getElementById('edit-modal'); const body = document.getElementById('edit-modal-body'); if (!modal || !body) return;
  const foods = meal?.foods?.length ? meal.foods : [{}]; const time = _toDateTimeLocal(meal?.eaten_at || meal?.timestamp || new Date().toISOString());
  body.innerHTML = `<div class="modal-intro"><span class="section-kicker">${meal ? '編輯紀錄' : '手動新增'}</span><h2>${meal ? '調整這餐的內容' : '輸入一餐'}</h2></div><div class="edit-top-grid"><label>餐別<select id="edit-meal-type" class="setting-input"><option ${meal?.meal_type === '早餐' ? 'selected' : ''}>早餐</option><option ${meal?.meal_type === '午餐' ? 'selected' : ''}>午餐</option><option ${meal?.meal_type === '晚餐' ? 'selected' : ''}>晚餐</option><option ${meal?.meal_type === '點心' ? 'selected' : ''}>點心</option><option ${meal?.meal_type === '其他' ? 'selected' : ''}>其他</option></select></label><label>實際用餐時間<input id="edit-eaten-at" class="setting-input" type="datetime-local" value="${time}"></label></div><div id="edit-food-list" class="edit-food-list">${foods.map((food, index) => _editFoodHtml(food, index)).join('')}</div><button id="add-food-btn" class="text-btn add-inline-btn">＋ 新增食物項目</button>`;
  modal.classList.remove('hidden');
  const list = document.getElementById('edit-food-list'); list?.addEventListener('click', (event) => { if (event.target.closest('.btn-delete-food') && list.children.length > 1) event.target.closest('.edit-food-item')?.remove(); }); list?.addEventListener('change', (event) => { if (event.target.closest?.('.edit-food-item')) _scaleFoodNutrients(event.target, '.edit-quantity', ['.edit-cal', '.edit-pro', '.edit-fat', '.edit-carb']); });
  document.getElementById('add-food-btn')?.addEventListener('click', () => list?.insertAdjacentHTML('beforeend', _editFoodHtml({}, list.children.length)));
  _replaceModalButtons(async () => {
    const rows = list ? Array.from(list.querySelectorAll('.edit-food-item')) : []; const updatedFoods = rows.map((row) => ({ name: row.querySelector('.edit-name')?.value.trim() || '未命名項目', portion: row.querySelector('.edit-portion')?.value.trim() || '', quantity: _numberValue(row.querySelector('.edit-quantity')?.value, 1), unit: row.querySelector('.edit-unit')?.value.trim() || '', weight_grams: _numberValue(row.querySelector('.edit-weight')?.value, 0), calories: _numberValue(row.querySelector('.edit-cal')?.value), protein_g: _numberValue(row.querySelector('.edit-pro')?.value), fat_g: _numberValue(row.querySelector('.edit-fat')?.value), carbs_g: _numberValue(row.querySelector('.edit-carb')?.value), source: row.querySelector('.edit-source')?.value.trim() || '手動', confidence: row.querySelector('.edit-confidence')?.value || 'medium' }));
    if (!updatedFoods.some((food) => food.name && food.name !== '未命名項目')) { showToast('至少填寫一個食物名稱', 'error'); return; }
    const totals = updatedFoods.reduce((sum, food) => ({ calories: sum.calories + food.calories, protein_g: sum.protein_g + food.protein_g, fat_g: sum.fat_g + food.fat_g, carbs_g: sum.carbs_g + food.carbs_g }), { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 }); const eatenAt = new Date(document.getElementById('edit-eaten-at')?.value || new Date().toISOString()).toISOString(); const payload = { meal_type: document.getElementById('edit-meal-type')?.value || '其他', eaten_at: eatenAt, meal_date: eatenAt.slice(0, 10), foods: updatedFoods, total_calories: _round(totals.calories), total_protein_g: _round(totals.protein_g), total_fat_g: _round(totals.fat_g), total_carbs_g: _round(totals.carbs_g), confidence: updatedFoods.every((food) => food.confidence === 'high') ? 'high' : updatedFoods.some((food) => food.confidence === 'low') ? 'low' : 'medium', notes: meal?.notes || '' };
    try { if (meal) await updateMeal(meal.id, payload); else await saveMeal(payload); modal.classList.add('hidden'); renderTodayMeals(); updateTodaySummary(); renderHistory(); showToast(meal ? '餐點已更新' : '餐點已新增'); } catch (error) { showToast(error.message || '儲存失敗', 'error'); }
  }, meal ? '儲存修改' : '新增餐點');
}

function _editFoodHtml(food = {}, index = 0) { return `<div class="edit-food-item" data-index="${index}"><div class="edit-food-header"><input class="edit-name" type="text" value="${_escapeHtml(food.name || '')}" placeholder="食物名稱"><button type="button" class="icon-btn btn-delete-food" title="刪除此項" aria-label="刪除食物">×</button></div><div class="edit-food-grid"><label>份量<input class="edit-portion" type="text" value="${_escapeHtml(food.portion || '')}" placeholder="1 碗"></label><label>數量<input class="edit-quantity" type="number" min="0" step="0.1" value="${_number(food.quantity, 1)}"></label><label>單位<input class="edit-unit" type="text" value="${_escapeHtml(food.unit || '')}" placeholder="份"></label><label>重量 g<input class="edit-weight" type="number" min="0" step="1" value="${_number(food.weight_grams, 0)}"></label></div><div class="edit-food-grid nutrient-grid"><label>熱量<input class="edit-cal" type="number" min="0" step="0.1" value="${_number(food.calories)}"></label><label>蛋白質<input class="edit-pro" type="number" min="0" step="0.1" value="${_number(food.protein_g)}"></label><label>脂肪<input class="edit-fat" type="number" min="0" step="0.1" value="${_number(food.fat_g)}"></label><label>碳水<input class="edit-carb" type="number" min="0" step="0.1" value="${_number(food.carbs_g)}"></label></div><div class="edit-food-meta"><label>來源<input class="edit-source" type="text" value="${_escapeHtml(food.source || '手動')}"></label><label>信心<select class="edit-confidence"><option value="high" ${food.confidence === 'high' ? 'selected' : ''}>高</option><option value="medium" ${!food.confidence || food.confidence === 'medium' ? 'selected' : ''}>中</option><option value="low" ${food.confidence === 'low' ? 'selected' : ''}>低</option></select></label></div></div>`; }

export function showConfirmModal(message) { return new Promise((resolve) => { const modal = document.getElementById('confirm-modal'); if (!modal) { resolve(window.confirm(message)); return; } const body = modal.querySelector('.modal-body'); body.innerHTML = `<div class="confirm-content"><p class="confirm-message">${_escapeHtml(message)}</p><div class="modal-actions"><button id="confirm-yes-btn" class="btn btn-danger">確定</button><button id="confirm-no-btn" class="btn btn-secondary">取消</button></div></div>`; modal.classList.remove('hidden'); const close = (value) => { modal.classList.add('hidden'); resolve(value); }; document.getElementById('confirm-yes-btn')?.addEventListener('click', () => close(true), { once: true }); document.getElementById('confirm-no-btn')?.addEventListener('click', () => close(false), { once: true }); }); }

export function renderFavorites() {
  const list = document.getElementById('favorites-list'); if (!list) return; const query = document.getElementById('favorites-search')?.value.trim().toLowerCase() || ''; const sort = document.getElementById('favorites-sort')?.value || 'smart'; let items = getAllFavorites().filter((item) => !query || `${item.name} ${item.description} ${item.category || ''}`.toLowerCase().includes(query)); items.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'zh-Hant') : sort === 'recent' ? String(b.last_used_at || '').localeCompare(String(a.last_used_at || '')) : sort === 'custom' ? Number(a.sort_order || 0) - Number(b.sort_order || 0) : Number(b.pinned) - Number(a.pinned) || String(b.last_used_at || b.updated_at || '').localeCompare(String(a.last_used_at || a.updated_at || '')));
  if (!items.length) { list.innerHTML = `<div class="empty-state"><span class="empty-icon">☆</span><p>${query ? '找不到符合的常吃項目' : '還沒有常吃項目'}</p><p class="empty-hint">可從 AI 結果或今日紀錄加入。</p></div>`; return; }
  list.innerHTML = items.map((item) => `<article class="favorite-card glass-card" data-fav-id="${_escapeHtml(item.id)}"><div class="favorite-card-header"><div class="favorite-info"><div class="favorite-meta"><span class="favorite-category">${_escapeHtml(item.category || '未分類')}</span>${item.pinned ? '<span class="pin-badge">已釘選</span>' : ''}</div><h2 class="favorite-name">${_escapeHtml(item.name)}</h2><p class="favorite-desc">${_escapeHtml(item.description || '尚未填寫描述')}</p></div><div class="favorite-actions"><button class="icon-btn fav-pin-btn" data-id="${_escapeHtml(item.id)}" title="${item.pinned ? '取消釘選' : '釘選'}" aria-label="釘選">${item.pinned ? '★' : '☆'}</button><button class="icon-btn fav-edit-btn" data-id="${_escapeHtml(item.id)}" title="編輯" aria-label="編輯">✎</button><button class="icon-btn fav-add-today-btn" data-id="${_escapeHtml(item.id)}" title="加入今日" aria-label="加入今日">＋</button><button class="icon-btn fav-delete-btn" data-id="${_escapeHtml(item.id)}" title="刪除" aria-label="刪除">⌫</button></div></div><div class="favorite-nutrition"><strong>${_number(item.total_calories)} kcal</strong><span>蛋白質 ${_number(item.total_protein_g)}g</span><span>脂肪 ${_number(item.total_fat_g)}g</span><span>碳水 ${_number(item.total_carbs_g)}g</span></div></article>`).join('');
  list.querySelectorAll('.fav-pin-btn').forEach((button) => button.addEventListener('click', async () => { const item = getAllFavorites().find((favorite) => favorite.id === button.dataset.id); if (item) await updateFavorite(item.id, { ...item, pinned: !item.pinned }); renderFavorites(); }));
  list.querySelectorAll('.fav-edit-btn').forEach((button) => button.addEventListener('click', () => showEditFavoriteModal(button.dataset.id)));
  list.querySelectorAll('.fav-add-today-btn').forEach((button) => button.addEventListener('click', () => _addFavToToday(button.dataset.id)));
  list.querySelectorAll('.fav-delete-btn').forEach((button) => button.addEventListener('click', async () => { if (!await showConfirmModal('確定要從常吃清單刪除嗎？')) return; await deleteFavorite(button.dataset.id); renderFavorites(); showToast('已從常吃清單移除'); }));
}

function _addFavToToday(id) {
  const favorite = getAllFavorites().find((item) => item.id === id); const modal = document.getElementById('edit-modal'); const body = document.getElementById('edit-modal-body'); if (!favorite || !modal || !body) return;
  body.innerHTML = `<div class="modal-intro"><span class="section-kicker">常吃清單</span><h2>加入今日紀錄</h2></div><p class="modal-copy">${_escapeHtml(favorite.name)} · ${_number(favorite.total_calories)} kcal</p><div class="edit-top-grid"><label>餐別<select id="fav-meal-type-select" class="setting-input"><option>早餐</option><option>午餐</option><option>晚餐</option><option>點心</option></select></label><label>份量倍數<input id="fav-quantity-multiplier" class="setting-input" type="number" min="0.1" max="10" step="0.1" value="1"></label></div>`; modal.classList.remove('hidden');
  _replaceModalButtons(async () => { const multiplier = _numberValue(document.getElementById('fav-quantity-multiplier')?.value, 1); const now = new Date().toISOString(); try { await saveMeal({ meal_type: document.getElementById('fav-meal-type-select')?.value || '其他', eaten_at: now, foods: (favorite.foods || []).map((food) => ({ ...food, quantity: _numberValue(food.quantity, 1) * multiplier, calories: _numberValue(food.calories) * multiplier, protein_g: _numberValue(food.protein_g) * multiplier, fat_g: _numberValue(food.fat_g) * multiplier, carbs_g: _numberValue(food.carbs_g) * multiplier })), total_calories: _round(favorite.total_calories * multiplier), total_protein_g: _round(favorite.total_protein_g * multiplier), total_fat_g: _round(favorite.total_fat_g * multiplier), total_carbs_g: _round(favorite.total_carbs_g * multiplier), notes: `來自常吃清單：${favorite.name}` }); await updateFavorite(favorite.id, { ...favorite, last_used_at: now }); modal.classList.add('hidden'); renderFavorites(); showToast(`${favorite.name} 已加入今日`); } catch (error) { showToast(error.message || '新增失敗', 'error'); } }, '加入今日');
}

export function showAddFavoriteModal() { showFavoriteEditorModal({ mode: 'add' }); }
function showEditFavoriteModal(id) { const favorite = getAllFavorites().find((item) => item.id === id); if (favorite) showFavoriteEditorModal({ mode: 'edit', favorite }); }

function showFavoriteEditorModal({ mode, favorite = null }) {
  const modal = document.getElementById('edit-modal'); const body = document.getElementById('edit-modal-body'); if (!modal || !body) return; const foods = favorite?.foods?.length ? favorite.foods : [{}]; const editing = mode === 'edit';
  body.innerHTML = `<div class="modal-intro"><span class="section-kicker">常吃清單</span><h2>${editing ? '編輯常吃項目' : '新增常吃項目'}</h2></div><div class="edit-top-grid"><label>名稱<input id="new-fav-name" class="setting-input" type="text" value="${_escapeHtml(favorite?.name || '')}" placeholder="例：水煮雞胸肉"></label><label>分類<input id="new-fav-category" class="setting-input" type="text" value="${_escapeHtml(favorite?.category || '')}" placeholder="早餐／午餐／自訂"></label></div><label class="modal-field">描述<textarea id="new-fav-description" class="setting-input favorite-description-input" rows="3" placeholder="例如：雞胸肉 120g、青菜">${_escapeHtml(favorite?.description || '')}</textarea></label><label class="switch-row modal-switch"><span><strong>釘選在最前</strong><small>常用項目可快速找到</small></span><input id="new-fav-pinned" type="checkbox" ${favorite?.pinned ? 'checked' : ''}><span class="switch-control" aria-hidden="true"></span></label><div id="new-fav-foods-list" class="edit-food-list">${foods.map((food, index) => _editFavoriteFoodHtml(food, index)).join('')}</div><button id="add-fav-row-btn" class="text-btn add-inline-btn">＋ 新增食物項目</button>`;
  modal.classList.remove('hidden'); const foodsList = document.getElementById('new-fav-foods-list'); foodsList?.addEventListener('click', (event) => { if (event.target.closest('.btn-delete-food') && foodsList.children.length > 1) event.target.closest('.edit-food-item')?.remove(); }); foodsList?.addEventListener('change', (event) => { if (event.target.closest?.('.edit-food-item')) _scaleFoodNutrients(event.target, '.nf-quantity', ['.nf-cal', '.nf-pro', '.nf-fat', '.nf-carb']); }); document.getElementById('add-fav-row-btn')?.addEventListener('click', () => foodsList?.insertAdjacentHTML('beforeend', _editFavoriteFoodHtml({}, foodsList.children.length)));
  _replaceModalButtons(async () => { const item = buildFavoriteItemFromForm(_readFavoriteFormData(foodsList)); const full = { ...item, category: document.getElementById('new-fav-category')?.value.trim() || '', pinned: document.getElementById('new-fav-pinned')?.checked || false }; try { if (editing) await updateFavorite(favorite.id, full); else await addFavorite(full); modal.classList.add('hidden'); renderFavorites(); showToast(editing ? '常吃項目已更新' : '已加入常吃清單'); } catch (error) { showToast(error.message || '常吃項目儲存失敗', 'error'); } }, editing ? '儲存修改' : '加入常吃');
}

function _editFavoriteFoodHtml(food = {}, index = 0) { return `<div class="edit-food-item" data-index="${index}"><div class="edit-food-header"><input class="edit-name nf-name" type="text" value="${_escapeHtml(food.name || '')}" placeholder="食物名稱"><button type="button" class="icon-btn btn-delete-food" title="刪除此項" aria-label="刪除食物">×</button></div><div class="edit-food-grid"><label>份量<input class="edit-portion nf-portion" type="text" value="${_escapeHtml(food.portion || '')}" placeholder="1 碗"></label><label>數量<input class="edit-quantity nf-quantity" type="number" min="0" step="0.1" value="${_number(food.quantity, 1)}"></label><label>單位<input class="edit-unit nf-unit" type="text" value="${_escapeHtml(food.unit || '')}" placeholder="份"></label><label>重量 g<input class="edit-weight nf-weight" type="number" min="0" step="1" value="${_number(food.weight_grams, 0)}"></label></div><div class="edit-food-grid nutrient-grid"><label>熱量<input class="edit-cal nf-cal" type="number" min="0" step="0.1" value="${_number(food.calories)}"></label><label>蛋白質<input class="edit-pro nf-pro" type="number" min="0" step="0.1" value="${_number(food.protein_g)}"></label><label>脂肪<input class="edit-fat nf-fat" type="number" min="0" step="0.1" value="${_number(food.fat_g)}"></label><label>碳水<input class="edit-carb nf-carb" type="number" min="0" step="0.1" value="${_number(food.carbs_g)}"></label></div><div class="edit-food-meta"><label>來源<input class="edit-source nf-source" type="text" value="${_escapeHtml(food.source || '手動')}"></label><label>信心<select class="edit-confidence nf-confidence"><option value="high" ${food.confidence === 'high' ? 'selected' : ''}>高</option><option value="medium" ${!food.confidence || food.confidence === 'medium' ? 'selected' : ''}>中</option><option value="low" ${food.confidence === 'low' ? 'selected' : ''}>低</option></select></label></div></div>`; }

function _readFavoriteFormData(list) { return { name: document.getElementById('new-fav-name')?.value || '', description: document.getElementById('new-fav-description')?.value || '', foods: list ? Array.from(list.querySelectorAll('.edit-food-item')).map((row) => ({ name: row.querySelector('.nf-name')?.value || '', portion: row.querySelector('.nf-portion')?.value || '', quantity: _numberValue(row.querySelector('.nf-quantity')?.value, 1), unit: row.querySelector('.nf-unit')?.value || '', weight_grams: _numberValue(row.querySelector('.nf-weight')?.value, 0), calories: _numberValue(row.querySelector('.nf-cal')?.value), protein_g: _numberValue(row.querySelector('.nf-pro')?.value), fat_g: _numberValue(row.querySelector('.nf-fat')?.value), carbs_g: _numberValue(row.querySelector('.nf-carb')?.value), source: row.querySelector('.nf-source')?.value || '手動', confidence: row.querySelector('.nf-confidence')?.value || 'medium' })) : [] }; }

function _replaceModalButtons(onSave, saveLabel) { const save = document.getElementById('edit-save-btn'); const cancel = document.getElementById('edit-cancel-btn'); if (!save || !cancel) return; const newSave = save.cloneNode(true); const newCancel = cancel.cloneNode(true); newSave.textContent = saveLabel; save.replaceWith(newSave); cancel.replaceWith(newCancel); newSave.addEventListener('click', onSave); newCancel.addEventListener('click', () => document.getElementById('edit-modal')?.classList.add('hidden')); document.querySelector('#edit-modal [data-action="close-modal"]')?.addEventListener('click', () => document.getElementById('edit-modal')?.classList.add('hidden')); }

function _foodPortion(food) { return food.quantity && food.unit ? `${food.quantity}${food.unit}` : food.portion || (food.weight_grams ? `${food.weight_grams}g` : ''); }
function _escapeHtml(value) { const div = document.createElement('div'); div.textContent = value == null ? '' : String(value); return div.innerHTML; }
function _formatTime(value) { if (!value) return ''; const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }); }
function _getWeekday(date) { const day = new Date(`${date}T00:00:00`).getDay(); return `週${['日', '一', '二', '三', '四', '五', '六'][day]}`; }
function _toDateTimeLocal(value) { const date = new Date(value); if (Number.isNaN(date.getTime())) return ''; const pad = (number) => String(number).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }
function _number(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? (Number.isInteger(number) ? String(number) : String(Math.round(number * 10) / 10)) : String(fallback); }
function _numberValue(value, fallback = 0) { const number = Number.parseFloat(value); return Number.isFinite(number) ? number : fallback; }
function _round(value) { return Math.round((Number(value) || 0) * 10) / 10; }

function _scaleFoodNutrients(target, quantitySelector, nutrientSelectors) {
  if (!target.matches?.(quantitySelector)) return;
  const row = target.closest('.analysis-food-row, .edit-food-item'); if (!row) return;
  const next = _numberValue(target.value, 1); const previous = _numberValue(row.dataset.previousQuantity || target.defaultValue, 1);
  if (previous > 0 && next >= 0) nutrientSelectors.forEach((selector) => { const input = row.querySelector(selector); if (input) input.value = _round(_numberValue(input.value) * next / previous); });
  row.dataset.previousQuantity = String(next);
}
