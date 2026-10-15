CREATE TABLE `auth_accounts` (
	`provider_subject` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`legacy_link_decided` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_accounts_user_id_unique` ON `auth_accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `auth_rate_limits` (
	`rate_key` text PRIMARY KEY NOT NULL,
	`window_started_at` integer NOT NULL,
	`attempts` integer NOT NULL,
	`blocked_until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`session_hash` text PRIMARY KEY NOT NULL,
	`provider_subject` text NOT NULL,
	`tokens_ciphertext` text NOT NULL,
	`expires_at` integer NOT NULL,
	`provider_expires_at` integer NOT NULL,
	`version` integer NOT NULL,
	`refresh_lock_until` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
