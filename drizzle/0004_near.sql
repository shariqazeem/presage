CREATE TABLE `near_feed` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`account_id` text,
	`coin` text,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`tx` text
);
--> statement-breakpoint
CREATE INDEX `near_feed_at` ON `near_feed` (`at`);--> statement-breakpoint
CREATE INDEX `near_feed_account` ON `near_feed` (`account_id`,`at`);--> statement-breakpoint
CREATE TABLE `near_members` (
	`account_id` text PRIMARY KEY NOT NULL,
	`member` text,
	`joined_at` integer NOT NULL,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `near_positions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` text NOT NULL,
	`coin` text NOT NULL,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`call_id` integer,
	`plan` text NOT NULL,
	`salt` text NOT NULL,
	`hash` text NOT NULL,
	`seal_tx` text,
	`reveal_tx` text,
	`stop` real NOT NULL,
	`target` real NOT NULL,
	`r1` real,
	`max_hold_sec` integer NOT NULL,
	`usdc_in` text,
	`coin_amount` text,
	`entry_price` real,
	`entry_tx` text,
	`opened_at` integer,
	`usdc_out` text,
	`exit_price` real,
	`exit_tx` text,
	`exit_reason` text,
	`closed_at` integer,
	`exit_proposed_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `near_positions_account` ON `near_positions` (`account_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `near_positions_status` ON `near_positions` (`status`);