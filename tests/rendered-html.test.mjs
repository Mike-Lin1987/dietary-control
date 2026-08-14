import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("defines the MealMori homepage and loads its production shell", async () => {
  const [page, layout, legacyHome, legacyIndex] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/LegacyHome.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/legacy/index.html", import.meta.url), "utf8"),
  ]);

  assert.match(page, /title:\s*"MealMori｜智慧飲食追蹤"/);
  assert.match(page, /description:\s*"使用 AI 協助記錄餐點與營養攝取。"/);
  assert.match(page, /return <LegacyHome \/>/);
  assert.match(layout, /title:\s*"MealMori｜智慧飲食追蹤"/);
  assert.match(layout, /icon:\s*"\/mealmori-mark\.png"/);
  assert.match(legacyHome, /fetch\("\/legacy\/index\.html"/);
  assert.match(legacyHome, /src = "\/legacy\/js\/app\.js"/);
  assert.match(legacyIndex, /id="app"/);
  assert.match(legacyHome, /<img[^>]+src="\/mealmori-mark\.webp"[^>]+alt=""/);
  assert.match(legacyIndex, /<img[^>]+class="brand-mark"[^>]+src="\/mealmori-mark\.webp"[^>]+alt=""/);
  assert.match(legacyIndex, /<div class="brand-name">MealMori<\/div>/);
  assert.match(legacyIndex, /<div class="app-subtitle">智慧飲食追蹤<\/div>/);
});

test("keeps the retired starter preview disconnected from MealMori", async () => {
  const [page, legacyHome, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/LegacyHome.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /SkeletonPreview|codex-preview|Your site is taking shape/);
  assert.match(page, /<LegacyHome \/>/);
  assert.match(legacyHome, /id="legacy-root"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(packageJson, /node --test tests\/\*\.test\.mjs/);
  await Promise.all([
    assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url))),
    assert.rejects(access(new URL("../app/_sites-preview/preview.css", import.meta.url))),
  ]);
});

test("gates the site with a device access code and protects AI without account-owned storage", async () => {
  const [legacyHome, analyzeRoute, app, legacyIndex] = await Promise.all([
    readFile(new URL("../app/LegacyHome.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/analyze/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/legacy/js/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/legacy/index.html", import.meta.url), "utf8"),
  ]);

  assert.match(legacyHome, /fetch\("\/api\/access"/);
  assert.match(legacyHome, /id="access-gate"/);
  assert.match(legacyHome, /type="password"/);
  assert.match(analyzeRoute, /requestAccessStatus/);
  assert.doesNotMatch(analyzeRoute, /getOwner/);
  assert.match(app, /\/api\/access/);
  assert.match(legacyIndex, /id="remove-device-access-btn"/);
  assert.doesNotMatch(legacyIndex, /id="save-meal-photos"/);
  assert.match(app, /await analyzeFood[\s\S]*clearPhoto\(\)[\s\S]*bindAnalysisActions/);
  assert.doesNotMatch(app, /photo_thumbnail|save_photo/);
});
