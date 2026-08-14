ALTER TABLE `user_settings` ADD `save_meal_photos` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `meals` ADD `eaten_at` text;
--> statement-breakpoint
ALTER TABLE `favorites` ADD `category` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `favorites` ADD `pinned` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `favorites` ADD `sort_order` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `favorites` ADD `last_used_at` text;
--> statement-breakpoint
CREATE INDEX `favorites_owner_sort_idx` ON `favorites` (`owner_id`,`pinned`,`sort_order`,`last_used_at`);
