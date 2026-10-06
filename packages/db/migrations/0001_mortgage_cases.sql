CREATE TABLE `mortgage_cases` (
	`applicant_name` text NOT NULL,
	`checks_json` text NOT NULL,
	`created_at` text NOT NULL,
	`decided_at` text,
	`decision` text,
	`decision_note` text,
	`dossier_json` text NOT NULL,
	`file_names` text NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`proposal_json` text
);
