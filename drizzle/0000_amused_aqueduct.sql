CREATE TABLE `favorites` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`foods_json` text DEFAULT '[]' NOT NULL,
	`total_calories` real DEFAULT 0 NOT NULL,
	`total_protein_g` real DEFAULT 0 NOT NULL,
	`total_fat_g` real DEFAULT 0 NOT NULL,
	`total_carbs_g` real DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `favorites_owner_idx` ON `favorites` (`owner_id`);--> statement-breakpoint
CREATE TABLE `meals` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`meal_date` text NOT NULL,
	`timestamp` text NOT NULL,
	`meal_type` text DEFAULT '其他' NOT NULL,
	`foods_json` text DEFAULT '[]' NOT NULL,
	`total_calories` real DEFAULT 0 NOT NULL,
	`total_protein_g` real DEFAULT 0 NOT NULL,
	`total_fat_g` real DEFAULT 0 NOT NULL,
	`total_carbs_g` real DEFAULT 0 NOT NULL,
	`confidence` text DEFAULT 'medium' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`photo_key` text,
	`photo_mime_type` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `meals_owner_date_idx` ON `meals` (`owner_id`,`meal_date`);--> statement-breakpoint
CREATE TABLE `migration_state` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`snapshot_hash` text NOT NULL,
	`counts_json` text DEFAULT '{}' NOT NULL,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`calories` real DEFAULT 1500 NOT NULL,
	`protein_g` real DEFAULT 120 NOT NULL,
	`fat_g` real DEFAULT 50 NOT NULL,
	`carbs_g` real DEFAULT 200 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
