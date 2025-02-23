ALTER TABLE "Rankings" ALTER COLUMN "rating_settings" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Settings" ADD COLUMN "db_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "Settings" DROP COLUMN IF EXISTS "versions";