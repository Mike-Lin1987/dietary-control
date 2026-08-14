import assert from "node:assert/strict";
import test from "node:test";
import { indexedDB } from "fake-indexeddb";

import { createCloudMigration } from "../public/legacy/js/cloud-migration.js";
import { createDeviceData } from "../public/legacy/js/device-data.js";

test("cloud migration verifies imported content, downloads backup, and deletes only after confirmation", async () => {
  const deviceData = createDeviceData({ indexedDB, databaseName: `migration-${crypto.randomUUID()}` });
  await deviceData.init();
  const snapshot = {
    schemaVersion: 2,
    data: {
      goals: { calories: 1800, protein_g: 120, fat_g: 55, carbs_g: 190 },
      meals: [{ id: "meal-cloud", meal_date: "2026-08-13", total_calories: 420 }],
      favorites: [{ id: "fav-cloud", name: "水煮蛋", total_calories: 78 }],
    },
    counts: { meals: 1, favorites: 1, settings: 1, photos: 0 },
  };
  let deleted = false;
  let backup;
  const fetch = async (path, init = {}) => {
    if (path === "/api/export" && !deleted) return Response.json(snapshot);
    if (path === "/api/data" && init.method === "DELETE") {
      assert.equal(init.headers["x-nutrilens-confirm-cloud-delete"], "DELETE_MY_CLOUD_COPY");
      deleted = true;
      return Response.json({ ok: true });
    }
    if (path === "/api/export" && deleted) return Response.json({ schemaVersion: 2, data: { meals: [], favorites: [] }, counts: { meals: 0, favorites: 0, settings: 0, photos: 0 } });
    return Response.json({ error: { message: "unexpected request" } }, { status: 500 });
  };
  const migration = createCloudMigration({ deviceData, fetch, downloadBackup: (value) => { backup = value; } });

  const result = await migration.migrate();
  assert.equal(result.verified, true);
  assert.deepEqual(result.counts, { meals: 1, favorites: 1, settings: 1, photos: 0 });
  assert.equal(deviceData.getAllMeals()[0].id, "meal-cloud");
  assert.equal(deviceData.getAllFavorites()[0].id, "fav-cloud");
  assert.equal(backup.schemaVersion, 3);

  await assert.rejects(() => migration.deleteCloudCopy({ confirmed: false }), /明確確認/);
  const deletion = await migration.deleteCloudCopy({ confirmed: true });
  assert.equal(deletion.verifiedZero, true);
});
