ALTER TABLE "Rankings" RENAME COLUMN "match_config" TO "match_settings";--> statement-breakpoint
ALTER TABLE "Rankings" ADD COLUMN "rating_settings" jsonb;