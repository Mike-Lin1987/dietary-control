export function buildFavoriteFromAnalysis(data = {}) {
  const foods = Array.isArray(data.foods)
    ? data.foods.map((food) => ({ ...food }))
    : [];

  const foodNames = foods
    .map((food) => food.name)
    .filter(Boolean);

  const description = foods
    .map((food) => [food.name, food.portion].filter(Boolean).join(' '))
    .filter(Boolean)
    .join('、');

  return {
    name: foodNames.join('、') || data.meal_type || '我的餐點',
    description,
    foods,
    total_calories: data.total_calories || 0,
    total_protein_g: data.total_protein_g || 0,
    total_fat_g: data.total_fat_g || 0,
    total_carbs_g: data.total_carbs_g || 0,
  };
}

export function buildFavoriteItemFromForm(formData = {}) {
  const foods = Array.isArray(formData.foods)
    ? formData.foods
        .map((food) => ({
          name: String(food.name ?? '').trim(),
          portion: String(food.portion ?? '').trim(),
          calories: toNumber(food.calories),
          protein_g: toNumber(food.protein_g),
          fat_g: toNumber(food.fat_g),
          carbs_g: toNumber(food.carbs_g),
        }))
        .filter((food) => food.name || food.portion)
    : [];

  const generatedDescription = foods
    .map((food) => [food.name, food.portion].filter(Boolean).join(' '))
    .filter(Boolean)
    .join('、');

  return {
    name: String(formData.name ?? '').trim() || foods[0]?.name || '未命名',
    description: String(formData.description ?? '').trim() || generatedDescription,
    foods,
    total_calories: roundOne(foods.reduce((sum, food) => sum + food.calories, 0)),
    total_protein_g: roundOne(foods.reduce((sum, food) => sum + food.protein_g, 0)),
    total_fat_g: roundOne(foods.reduce((sum, food) => sum + food.fat_g, 0)),
    total_carbs_g: roundOne(foods.reduce((sum, food) => sum + food.carbs_g, 0)),
  };
}

function toNumber(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

function roundOne(value) {
  return Math.round(value * 10) / 10;
}
