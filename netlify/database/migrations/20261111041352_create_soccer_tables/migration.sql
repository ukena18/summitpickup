CREATE TABLE "soccer_audit" (
	"id" text PRIMARY KEY,
	"action" text NOT NULL,
	"who" text NOT NULL,
	"detail" jsonb NOT NULL,
	"at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "soccer_games" (
	"id" text PRIMARY KEY,
	"date" text NOT NULL,
	"start" text NOT NULL,
	"end" text NOT NULL,
	"location" text NOT NULL,
	"capacity" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "soccer_imports" (
	"id" text PRIMARY KEY
);
--> statement-breakpoint
CREATE TABLE "soccer_registrations" (
	"session_id" text,
	"player_id" text,
	"name" text NOT NULL,
	"secret_hash" text NOT NULL,
	"status" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "soccer_registrations_pkey" PRIMARY KEY("session_id","player_id")
);
--> statement-breakpoint
ALTER TABLE "soccer_registrations" ADD CONSTRAINT "soccer_registrations_session_id_soccer_games_id_fkey" FOREIGN KEY ("session_id") REFERENCES "soccer_games"("id");