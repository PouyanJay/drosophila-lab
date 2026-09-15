CREATE TABLE `provider_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`sealed_key` text NOT NULL,
	`key_hint` text NOT NULL,
	`updated_at` text NOT NULL
);
