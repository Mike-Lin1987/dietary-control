/**
 * charts.js - Visual chart updates for calorie ring and macro bars.
 */

/**
 * Updates the calorie ring (conic-gradient) and calorie text.
 *
 * @param {number} consumed - Calories consumed today.
 * @param {number} goal     - Calorie goal.
 */
export function updateCalorieRing(consumed, goal) {
  const ring = document.getElementById('calorie-ring');
  const consumedEl = document.getElementById('calories-consumed');
  const goalEl = document.getElementById('calories-goal');

  const rawProgress = goal > 0 ? (consumed / goal) * 100 : 0;
  const progress = Math.min(rawProgress, 100);

  if (ring) {
    ring.style.setProperty('--progress', `${progress}%`);

    // Apply colour based on progress
    if (rawProgress > 100) {
      ring.classList.add('over-budget');
    } else {
      ring.classList.remove('over-budget');
    }
  }

  if (consumedEl) animateNumber(consumedEl, Math.round(consumed));
  if (goalEl) goalEl.textContent = `/ ${Math.round(goal)}`;
}

/**
 * Updates the three macro nutrient progress bars.
 *
 * @param {number} protein - Protein consumed (g).
 * @param {number} fat     - Fat consumed (g).
 * @param {number} carbs   - Carbs consumed (g).
 * @param {object} goals   - { protein_g, fat_g, carbs_g }.
 */
export function updateMacroBars(protein, fat, carbs, goals) {
  _updateBar('protein', protein, goals.protein_g);
  _updateBar('fat', fat, goals.fat_g);
  _updateBar('carbs', carbs, goals.carbs_g);

  // Update text values
  const proteinEl = document.getElementById('summary-protein');
  const fatEl     = document.getElementById('summary-fat');
  const carbsEl   = document.getElementById('summary-carbs');

  if (proteinEl) animateNumber(proteinEl, Math.round(protein * 10) / 10);
  if (fatEl)     animateNumber(fatEl, Math.round(fat * 10) / 10);
  if (carbsEl)   animateNumber(carbsEl, Math.round(carbs * 10) / 10);
}

/**
 * Smoothly animates a number element from its current value to a target.
 *
 * @param {HTMLElement} element
 * @param {number}      targetValue
 * @param {number}      duration - Animation duration in ms.
 */
export function animateNumber(element, targetValue, duration = 800) {
  if (!element) return;

  const startValue = parseFloat(element.textContent) || 0;
  const diff = targetValue - startValue;

  if (diff === 0) {
    element.textContent = targetValue;
    return;
  }

  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    // ease-out cubic
    const eased = 1 - Math.pow(1 - t, 3);
    const current = startValue + diff * eased;

    element.textContent = Number.isInteger(targetValue)
      ? Math.round(current)
      : (Math.round(current * 10) / 10).toFixed(1);

    if (t < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

// ── Internal ────────────────────────────────────────────

function _updateBar(name, value, goal) {
  const bar = document.getElementById(`${name}-bar`);
  if (!bar) return;

  const pct = goal > 0 ? Math.min((value / goal) * 100, 100) : 0;

  // Trigger reflow for animation
  requestAnimationFrame(() => {
    bar.style.width = `${pct}%`;
  });
}
