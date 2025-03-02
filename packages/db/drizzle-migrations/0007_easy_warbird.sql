ALTER TABLE "Players" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "Players" ADD COLUMN "role_id" text;--> statement-breakpoint
ALTER TABLE "Players" ADD COLUMN "guild_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Players" ADD CONSTRAINT "Players_guild_id_Guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."Guilds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
