import assert from "node:assert/strict";
import test from "node:test";
import { indexedDB } from "fake-indexeddb";

import { createDeviceData } from "../public/legacy/js/device-data.js";

function uniqueDb(label) {
  return `nutrilens-test-${label}-${crypto.randomUUID()}`;
}

test("device data persists across reloads and stays isolated by browser database", async () => {
  const primaryName = uniqueDb("primary");
  const isolatedName = uniqueDb("isolated");
  const first = createDeviceData({ indexedDB, databaseName: primaryName });
  await first.init();

  await first.setGoals({ calories: 1850, protein_g: 125, fat_g: 55, carbs_g: 190 });
  await first.saveMeal({
    id: "meal-1",
    meal_date: "2026-08-14",
    eaten_at: "2026-08-14T12:30:00.000Z",
    meal_type: "午餐",
    foods: [{ name: "雞胸肉", calories: 220 }],
    total_calories: 220,
  });
  await first.addFavorite({ id: "favorite-1", name: "雞胸便當", total_calories: 520 });

  const reloaded = createDeviceData({ indexedDB, databaseName: primaryName });
  await reloaded.init();
  assert.equal(reloaded.getGoals().calories, 1850);
  assert.deepEqual(reloaded.getMealsByDate("2026-08-14").map((meal) => meal.id), ["meal-1"]);
  assert.deepEqual(reloaded.getAllFavorites().map((favorite) => favorite.id), ["favorite-1"]);

  const isolated = createDeviceData({ indexedDB, databaseName: isolatedName });
  await isolated.init();
  assert.equal(isolated.getAllMeals().length, 0);
  assert.equal(isolated.getAllFavorites().length, 0);
});

test("device data imports v2, exports v3, removes photo payloads, and merges duplicate ids", async () => {
  const store = createDeviceData({ indexedDB, databaseName: uniqueDb("import") });
  await store.init();

  const imported = await store.importSnapshot({
    schemaVersion: 2,
    data: {
      goals: { calories: 2100, protein_g: 140, fat_g: 65, carbs_g: 220, save_meal_photos: true },
      meals: [
        { id: "same-id", meal_date: "2026-08-13", total_calories: 300, photo_thumbnail: "secret", save_photo: true },
        { id: "same-id", meal_date: "2026-08-14", total_calories: 450 },
      ],
      favorites: [{ id: "fav-1", name: "水煮蛋", total_calories: 78 }],
    },
  });

  assert.deepEqual(imported, { meals: 1, favorites: 1, hasGoals: true });
  const snapshot = store.exportSnapshot();
  assert.equal(snapshot.schemaVersion, 3);
  assert.equal(snapshot.storage, "device");
  assert.equal(snapshot.data.meals.length, 1);
  assert.equal(snapshot.data.meals[0].meal_date, "2026-08-14");
  assert.equal("photo_thumbnail" in snapshot.data.meals[0], false);
  assert.equal("save_photo" in snapshot.data.meals[0], false);
  assert.equal("save_meal_photos" in snapshot.data.goals, false);
});

test("device data requests a backup after first data and again after thirty days", async () => {
  let now = new Date("2026-08-14T00:00:00.000Z");
  const store = createDeviceData({ indexedDB, databaseName: uniqueDb("backup"), now: () => now });
  await store.init();
  assert.equal(store.needsBackup(), false);

  await store.saveMeal({ id: "meal-1", meal_date: "2026-08-14", total_calories: 100 });
  assert.equal(store.needsBackup(), true);
  await store.markBackupCreated();
  assert.equal(store.needsBackup(), false);

  now = new Date("2026-09-14T00:00:01.000Z");
  assert.equal(store.needsBackup(), true);
});

test("device data requests a backup after goals change and rejects damaged or future backups", async () => {
  const store = createDeviceData({ indexedDB, databaseName: uniqueDb("validation") });
  await store.init();
  await store.setGoals({ calories: 1750 });
  assert.equal(store.needsBackup(), true);
  const damaged = store.previewImport("not-json");
  assert.equal(damaged.ok, false);
  assert.match(damaged.reason, /JSON|Unexpected token/);
  assert.deepEqual(store.previewImport({ schemaVersion: 4, data: { meals: [] } }), { ok: false, reason: "備份版本不支援" });
});
