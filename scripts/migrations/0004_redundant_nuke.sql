ALTER TABLE "Settings" RENAME COLUMN "last_deployed" TO "last_updated";--> statement-breakpoint
ALTER TABLE "Guilds" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Guilds" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "Settings" ADD COLUMN "versions" jsonb NOT NULL;