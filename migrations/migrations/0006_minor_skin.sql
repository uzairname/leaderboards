CREATE TABLE IF NOT EXISTS "AccessTokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"data" jsonb,
	"purpose" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "access_token_user_id_purpose_unique" ON "AccessTokens" ("user_id","purpose");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "AccessTokens" ADD CONSTRAINT "AccessTokens_user_id_Users_id_fk" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
