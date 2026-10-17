CREATE TABLE `follows` (
	`wallet` text NOT NULL,
	`agent_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`wallet`, `agent_id`)
);
--> statement-breakpoint
CREATE INDEX `follows_agent` ON `follows` (`agent_id`);--> statement-breakpoint
CREATE TABLE `push_subs` (
	`endpoint` text PRIMARY KEY NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`wallet` text,
	`created_at` integer NOT NULL,
	`failed_at` integer
);
--> statement-breakpoint
CREATE TABLE `watches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel` text NOT NULL,
	`address` text NOT NULL,
	`target` text NOT NULL,
	`target_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`done_at` integer
);
--> statement-breakpoint
CREATE INDEX `watches_target` ON `watches` (`target`,`target_id`);--> statement-breakpoint
ALTER TABLE `oracle_requests` ADD `asker_call` text;