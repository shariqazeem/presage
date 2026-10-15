CREATE TABLE `agent_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_id` integer NOT NULL,
	`kind` text NOT NULL,
	`at` integer NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agent_events_at` ON `agent_events` (`at`);--> statement-breakpoint
CREATE INDEX `agent_events_agent` ON `agent_events` (`agent_id`,`at`);--> statement-breakpoint
ALTER TABLE `oracle_requests` ADD `progress` text;