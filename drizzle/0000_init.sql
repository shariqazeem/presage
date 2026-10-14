CREATE TABLE `agent_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`creator` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`prompt` text NOT NULL,
	`spec_json` text NOT NULL,
	`spec_hash` text NOT NULL,
	`price_usd6` integer NOT NULL,
	`identity_id` integer,
	`status` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`house` integer DEFAULT false NOT NULL,
	`creator` text NOT NULL,
	`description` text NOT NULL,
	`spec_json` text NOT NULL,
	`spec_hash` text NOT NULL,
	`price_usd6` integer DEFAULT 0 NOT NULL,
	`call_price_usd6` integer DEFAULT 0 NOT NULL,
	`registered_tx` text,
	`registered_at` integer,
	`retired` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agents_slug_unique` ON `agents` (`slug`);--> statement-breakpoint
CREATE TABLE `calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chain_call_id` integer,
	`agent_id` integer NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`payload` text NOT NULL,
	`salt` text NOT NULL,
	`commitment` text NOT NULL,
	`reveal_by` integer NOT NULL,
	`issued_at` integer NOT NULL,
	`asset` text NOT NULL,
	`side` text NOT NULL,
	`price_at_issue` real NOT NULL,
	`entry` real,
	`stop` real,
	`target` real,
	`horizon_sec` integer,
	`confidence` integer,
	`request_id` text,
	`seal_tx` text,
	`sealed_at` integer,
	`outcome` text,
	`result` integer,
	`resolution` text,
	`reveal_tx` text,
	`revealed_at` integer,
	`settle_tx` text,
	`feedback_tx` text,
	`alerted_at` integer,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `calls_agent` ON `calls` (`agent_id`,`issued_at`);--> statement-breakpoint
CREATE INDEX `calls_status` ON `calls` (`status`);--> statement-breakpoint
CREATE INDEX `calls_chain_id` ON `calls` (`chain_call_id`);--> statement-breakpoint
CREATE TABLE `chain_events` (
	`id` text PRIMARY KEY NOT NULL,
	`block` integer NOT NULL,
	`tx_hash` text NOT NULL,
	`log_index` integer NOT NULL,
	`contract` text NOT NULL,
	`name` text NOT NULL,
	`args` text NOT NULL,
	`from` text,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chain_events_name` ON `chain_events` (`name`,`block`);--> statement-breakpoint
CREATE INDEX `chain_events_block` ON `chain_events` (`block`);--> statement-breakpoint
CREATE TABLE `kv` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oracle_requests` (
	`request_id` text PRIMARY KEY NOT NULL,
	`wallet` text,
	`asset` text NOT NULL,
	`horizon` text NOT NULL,
	`status` text NOT NULL,
	`pay_tx` text,
	`payer` text,
	`token` text,
	`amount` text,
	`call_id` integer,
	`error` text,
	`created_at` integer NOT NULL,
	`paid_at` integer,
	`sealed_at` integer
);
--> statement-breakpoint
CREATE INDEX `oracle_requests_wallet` ON `oracle_requests` (`wallet`,`created_at`);--> statement-breakpoint
CREATE INDEX `oracle_requests_status` ON `oracle_requests` (`status`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`agent_id` integer NOT NULL,
	`subscriber` text NOT NULL,
	`until` integer NOT NULL,
	`last_tx` text NOT NULL,
	PRIMARY KEY(`agent_id`, `subscriber`)
);
--> statement-breakpoint
CREATE TABLE `telegram_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`created_at` integer NOT NULL,
	`used_at` integer
);
--> statement-breakpoint
CREATE TABLE `telegram_links` (
	`wallet` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`username` text,
	`linked_at` integer NOT NULL
);
