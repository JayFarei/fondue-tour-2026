CREATE TABLE `cheese_media` (
	`id` text PRIMARY KEY NOT NULL,
	`object_key` text NOT NULL,
	`original_name` text NOT NULL,
	`media_kind` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`duration_seconds` real,
	`captured_at` text,
	`latitude` real,
	`longitude` real,
	`location_source` text,
	`caption` text,
	`credit` text,
	`uploaded_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cheese_media_object_key_unique` ON `cheese_media` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_cheese_media_uploaded_at` ON `cheese_media` (`uploaded_at`);--> statement-breakpoint
CREATE INDEX `idx_cheese_media_captured_at` ON `cheese_media` (`captured_at`);--> statement-breakpoint
CREATE TABLE `cheese_rate_limits` (
	`scope` text NOT NULL,
	`subject_hash` text NOT NULL,
	`window_start` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`scope`, `subject_hash`)
);
--> statement-breakpoint
CREATE INDEX `idx_cheese_rate_limits_window` ON `cheese_rate_limits` (`window_start`);--> statement-breakpoint
PRAGMA optimize;
