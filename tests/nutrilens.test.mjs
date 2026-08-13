import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("renders the NutriLens shell", async () => {
  const bundle = await readFile(new URL("../dist/server/index.js", import.meta.url), "utf8");
  assert.match(bundle, /NutriLens/);
  assert.match(bundle, /legacy\/index\.html/);
});

test("keeps the server-side AI boundary and legacy assets present", async () => {
  const [analyzer, legacyIndex] = await Promise.all([
    readFile(new URL("../app/api/analyze/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/legacy/index.html", import.meta.url), "utf8"),
  ]);
  assert.match(analyzer, /OPENAI_API_KEY/);
  assert.match(analyzer, /store:\s*false/);
  assert.match(analyzer, /json_schema/);
  assert.match(legacyIndex, /id="app"/);
  await assert.rejects(access(new URL("../public/legacy/js/firebase.js", import.meta.url)));
});
test("maps the stored nutrition summary fields into the dashboard charts", async () => {
  const ui = await readFile(new URL("../public/legacy/js/ui.js", import.meta.url), "utf8");
  assert.match(ui, /updateCalorieRing\(summary\.calories, goals\.calories\)/);
  assert.match(ui, /updateMacroBars\(summary\.protein_g, summary\.fat_g, summary\.carbs_g, goals\)/);
  assert.doesNotMatch(ui, /summary\.totalCalories|summary\.totalProtein|summary\.totalFat|summary\.totalCarbs/);
});

test("opens history without a date filter and renders each saved day from its own meals", async () => {
  const [app, ui] = await Promise.all([
    readFile(new URL("../public/legacy/js/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/legacy/js/ui.js", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(app, /picker\) picker\.value = getTodayKey\(\);/);
  assert.match(app, /getElementById\("history-date-picker"\)\?\.addEventListener\("change", renderHistory\);/);
  assert.match(ui, /const dayMeals = getMealsByDate\(date\);/);
  assert.doesNotMatch(ui, /const allMeals = getAllMeals\(\);[\s\S]*const dayMeals = allMeals\[date\] \?\? \[\];/);
});
