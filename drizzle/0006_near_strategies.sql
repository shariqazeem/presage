CREATE TABLE `near_member_strategy` (
	`account_id` text PRIMARY KEY NOT NULL,
	`strategy_id` text NOT NULL,
	`set_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `near_strategies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner` text NOT NULL,
	`blocks` text NOT NULL,
	`hash` text NOT NULL,
	`words` text,
	`public` integer DEFAULT 0 NOT NULL,
	`adopted` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `near_strategies_owner` ON `near_strategies` (`owner`);--> statement-breakpoint
CREATE INDEX `near_strategies_hash` ON `near_strategies` (`hash`);