import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("renders the NouriLens shell", async () => {
  const bundle = await readFile(new URL("../dist/server/index.js", import.meta.url), "utf8");
  assert.match(bundle, /NouriLens/);
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
  assert.match(app, /getElementById\(['"]history-date-picker['"]\)\?\.addEventListener\(['"]change['"], renderHistory\);/);
  assert.match(ui, /getMealsByDate\(date\)/);
  assert.doesNotMatch(ui, /const allMeals = getAllMeals\(\);[\s\S]*const dayMeals = allMeals\[date\] \?\? \[\];/);
});

test("keeps v3 local backup and retires the completed cloud migration panel", async () => {
  const [storage, deviceData, index, app] = await Promise.all([
    readFile(new URL("../public/legacy/js/storage.js", import.meta.url), "utf8"),
    readFile(new URL("../public/legacy/js/device-data.js", import.meta.url), "utf8"),
    readFile(new URL("../public/legacy/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/legacy/js/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(deviceData, /schemaVersion:\s*3/);
  assert.match(deviceData, /schemaVersion > 3/);
  assert.match(storage, /nutrilens-before-import/);
  assert.match(index, /data-add-method="manual"/);
  assert.doesNotMatch(index, /id="save-meal-photos"/);
  assert.doesNotMatch(index, /cloud-migration|舊雲端資料搬移/);
  assert.doesNotMatch(app, /cloud-migration|createCloudMigration|cloudMigration/);
});

test("removes legacy D1, R2, and Drizzle runtime access", async () => {
  const [hosting, packageJson, worker, buildPlugin, viteConfig] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../build/sites-vite-plugin.ts", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(hosting, /"d1"|"r2"|"DB"|"PHOTOS"/);
  assert.doesNotMatch(packageJson, /drizzle|db:generate/);
  assert.doesNotMatch(worker, /D1Database|R2Bucket|\bDB\b|PHOTOS/);
  assert.doesNotMatch(buildPlugin, /drizzle|migrations/i);
  assert.doesNotMatch(viteConfig, /d1_databases|r2_buckets|site-creator-d1|site-creator-r2/);
  await Promise.all([
    assert.rejects(access(new URL("../app/api/data/route.ts", import.meta.url))),
    assert.rejects(access(new URL("../app/api/export/route.ts", import.meta.url))),
    assert.rejects(access(new URL("../app/api/bootstrap/route.ts", import.meta.url))),
    assert.rejects(access(new URL("../app/api/migration/import/route.ts", import.meta.url))),
    assert.rejects(access(new URL("../app/api/meals/route.ts", import.meta.url))),
    assert.rejects(access(new URL("../app/api/favorites/route.ts", import.meta.url))),
    assert.rejects(access(new URL("../app/api/goals/route.ts", import.meta.url))),
    assert.rejects(access(new URL("../db/index.ts", import.meta.url))),
    assert.rejects(access(new URL("../drizzle.config.ts", import.meta.url))),
  ]);
});

test("keeps v2 quick-add, CSV export, nutrition status, and undo affordances", async () => {
  const [storage, app, ui, index] = await Promise.all([
    readFile(new URL("../public/legacy/js/storage.js", import.meta.url), "utf8"),
    readFile(new URL("../public/legacy/js/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/legacy/js/ui.js", import.meta.url), "utf8"),
    readFile(new URL("../public/legacy/index.html", import.meta.url), "utf8"),
  ]);
  assert.match(storage, /export function exportCsv/);
  assert.match(storage, /\\uFEFF/);
  assert.match(app, /addPreviousMeal/);
  assert.match(ui, /showUndoToast/);
  assert.match(ui, /_nextMealSuggestions/);
  assert.match(index, /id="export-csv-btn"/);
  assert.match(index, /data-add-method="previous"/);
  assert.match(index, /id="today-meal-summary"/);
  assert.match(index, /id="trend-protein-chart"/);
  assert.match(ui, /_renderProteinTrendChart/);
});
