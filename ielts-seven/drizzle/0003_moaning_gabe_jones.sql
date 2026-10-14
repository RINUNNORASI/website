CREATE TABLE `auth_pending_logins` (
	`login_hash` text PRIMARY KEY NOT NULL,
	`verifier_ciphertext` text NOT NULL,
	`expected_email` text NOT NULL,
	`expires_at` integer NOT NULL,
	`claimed_at` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
