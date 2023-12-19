DROP INDEX IF EXISTS "access_token_user_id_purpose_unique";--> statement-breakpoint
ALTER TABLE "AccessTokens" ALTER COLUMN "data" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "AccessTokens" ADD COLUMN "expires_at" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "AccessTokens" ADD COLUMN "time_created" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "AccessTokens" DROP COLUMN IF EXISTS "purpose";