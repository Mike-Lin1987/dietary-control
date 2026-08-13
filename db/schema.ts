import { sql } from "drizzle-orm";
import {
  index,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const userSettings = sqliteTable("user_settings", {
  ownerId: text("owner_id").primaryKey(),
  calories: real("calories").notNull().default(1500),
  proteinG: real("protein_g").notNull().default(120),
  fatG: real("fat_g").notNull().default(50),
  carbsG: real("carbs_g").notNull().default(200),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const meals = sqliteTable(
  "meals",
  {
    ownerId: text("owner_id").notNull(),
    id: text("id").notNull(),
    mealDate: text("meal_date").notNull(),
    timestamp: text("timestamp").notNull(),
    mealType: text("meal_type").notNull().default("其他"),
    foodsJson: text("foods_json").notNull().default("[]"),
    totalCalories: real("total_calories").notNull().default(0),
    totalProteinG: real("total_protein_g").notNull().default(0),
    totalFatG: real("total_fat_g").notNull().default(0),
    totalCarbsG: real("total_carbs_g").notNull().default(0),
    confidence: text("confidence").notNull().default("medium"),
    notes: text("notes").notNull().default(""),
    photoKey: text("photo_key"),
    photoMimeType: text("photo_mime_type"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    primary: primaryKey({ columns: [table.ownerId, table.id] }),
    ownerDate: index("meals_owner_date_idx").on(table.ownerId, table.mealDate),
  }),
);

export const favorites = sqliteTable(
  "favorites",
  {
    ownerId: text("owner_id").notNull(),
    id: text("id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    foodsJson: text("foods_json").notNull().default("[]"),
    totalCalories: real("total_calories").notNull().default(0),
    totalProteinG: real("total_protein_g").notNull().default(0),
    totalFatG: real("total_fat_g").notNull().default(0),
    totalCarbsG: real("total_carbs_g").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    primary: primaryKey({ columns: [table.ownerId, table.id] }),
    ownerIndex: index("favorites_owner_idx").on(table.ownerId),
  }),
);

export const migrationState = sqliteTable("migration_state", {
  ownerId: text("owner_id").primaryKey(),
  snapshotHash: text("snapshot_hash").notNull(),
  countsJson: text("counts_json").notNull().default("{}"),
  importedAt: text("imported_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const schema = { userSettings, meals, favorites, migrationState };
