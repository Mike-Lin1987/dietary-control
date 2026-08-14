import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("defines the NutriLens homepage and loads its production shell", async () => {
  const [page, layout, legacyHome, legacyIndex] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/LegacyHome.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/legacy/index.html", import.meta.url), "utf8"),
  ]);

  assert.match(page, /title:\s*"NutriLens｜智慧飲食追蹤"/);
  assert.match(page, /description:\s*"使用 AI 協助記錄餐點與營養攝取。"/);
  assert.match(page, /return <LegacyHome \/>/);
  assert.match(layout, /title:\s*"NutriLens｜智慧飲食追蹤"/);
  assert.match(legacyHome, /fetch\("\/legacy\/index\.html"/);
  assert.match(legacyHome, /src = "\/legacy\/js\/app\.js"/);
  assert.match(legacyIndex, /id="app"/);
  assert.match(legacyIndex, /NutriLens/);
});

test("keeps the retired starter preview disconnected from NutriLens", async () => {
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
