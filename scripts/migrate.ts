import postgres from 'postgres'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import * as dotenv from 'dotenv'
import { cosineDistance, eq, sql } from 'drizzle-orm'
import { nonNullable } from '../src/utils/utils'
import { MatchPlayers, Players, Rankings, Settings } from '../src/database/schema'
import { PgDialect } from 'drizzle-orm/pg-core'
import { default_initial_rating } from '../src/main/bot/modules/rankings/manage-rankings'
import { Rating } from '../src/database/models/rankings'

const args = process.argv.slice(2)

const envPath = args.length == 1 ? args[0] : undefined

dotenv.config({
  path: envPath
})

export const matches_trigger_query = sql.raw(`
CREATE OR REPLACE FUNCTION "Matches_number_trigger_function"()
RETURNS TRIGGER AS $$
BEGIN
    NEW.number := COALESCE(
        (SELECT MAX(number) + 1
         FROM "Matches"
         WHERE ranking_id = NEW.ranking_id),
        1
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- drop all triggers on Matches
DO
$$
DECLARE
    trigger_record RECORD;
BEGIN
    FOR trigger_record IN
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE event_object_table = 'Matches'
    LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || trigger_record.trigger_name || ' ON "Matches"';
    END LOOP;
END;
$$;

CREATE OR REPLACE TRIGGER "Matches_number_trigger"
BEFORE INSERT ON "Matches"
FOR EACH ROW
EXECUTE FUNCTION "Matches_number_trigger_function"();
`)


async function migrate_database() {
  
  console.log('migrating')

  const db = drizzle(postgres(nonNullable(process.env.POSTGRES_URL, "postgres url"), { ssl: 'require', max: 1 }))

  await migrate_2(db)
  
  await migrate(db, { migrationsFolder: 'scripts/drizzle-migrations' })
  await migrate_3(db)
  
  await db.execute(matches_trigger_query)

  console.log('done migrating')
}

migrate_database().then(() => {
  process.exit(0)
})


async function migrate_2(db: PostgresJsDatabase) {

  const settings = (await db.select().from(Settings))[0]
  console.log(settings)
  if (settings && parseInt(`${settings.versions.db}`) && settings.versions.db > 1) {
    console.log('skipping migration 2')
    return
  }
  // settings.versions.db may 0, or 1, or in another format
  await db.delete(Settings)
  await db.insert(Settings).values({ id: 1, versions: { db: 1 } })

/**
ALTER TABLE "Rankings" RENAME COLUMN "num_teams" TO "teams_per_match";--> statement-breakpoint
DROP INDEX IF EXISTS "player_rating_index";--> statement-breakpoint

-- rename column rating to rating_old
-- add column rating jsonb
-- transfer rows over.
-- set rating not null
-- drop column rating_old
ALTER TABLE "Players" ALTER COLUMN "rating" SET DATA TYPE jsonb;--> statement-breakpoint

-- add column rating jsonb
-- transfer rows over.
-- set rating not null
ALTER TABLE "MatchPlayers" ADD COLUMN "rating" jsonb NOT NULL;--> statement-breakpoint

ALTER TABLE "MatchPlayers" DROP COLUMN IF EXISTS "rating_before";--> statement-breakpoint
ALTER TABLE "MatchPlayers" DROP COLUMN IF EXISTS "rd_before";--> statement-breakpoint
ALTER TABLE "Players" DROP COLUMN IF EXISTS "rd";
 */

  const players = await db.execute(sql.raw(`SELECT * FROM "Players"`))

  const player_ids = []
  const new_ratings = []

  for (const player of players) {
    const rating = {
      mu: player.rating as number,
      rd: player.rd as number,
    }

    const rating_jsonb_str = `'${JSON.stringify(rating)}'`

    player_ids.push(player.id)
    new_ratings.push(rating_jsonb_str)
  }

  
  const pg_dialect = new PgDialect()
  
  await db.execute(sql.raw(`ALTER TABLE "Players" DROP COLUMN IF EXISTS "rating_new";`))
  await db.execute(sql.raw(`ALTER TABLE "Players" ADD COLUMN IF NOT EXISTS "rating_new" jsonb;`))

  const query =
  `with values as (
  SELECT * 
    FROM UNNEST(
        ARRAY[${player_ids.join(',')}],
        ARRAY[${new_ratings.join(',')}]::jsonb[]
    ) AS v(a,b)` +
  pg_dialect.sqlToQuery(sql`
  )
  update ${Players}
  set
    rating_new = values.b
  from values
  where ${Players.id} = values.a
  `).sql

  console.log(query)
  await db.execute(query)

  // set not null
  await db.execute(sql.raw(`ALTER TABLE "Players" ALTER COLUMN "rating_new" SET NOT NULL;`))
  // drop old column
  await db.execute(sql.raw(`ALTER TABLE "Players" DROP COLUMN IF EXISTS "rating";`))
  // rename new column
  await db.execute(sql.raw(`ALTER TABLE "Players" RENAME COLUMN "rating_new" TO "rating";`))
  // drop old column
  await db.execute(sql.raw(`ALTER TABLE "Players" DROP COLUMN IF EXISTS "rd";`))

  // MatchPlayers
  // add column rating jsonb
  await db.execute(sql.raw(`ALTER TABLE "MatchPlayers" ADD COLUMN IF NOT EXISTS "rating" jsonb;`))

  // transfer rows over
  const matchplayers = await db.execute(sql.raw(`SELECT * FROM "MatchPlayers"`))

  const mp_match_ids = []
  const mp_player_ids = []
  const matchplayer_ratings = []

  for (const matchplayer of matchplayers) {
    const rating: Rating = {
      mu: matchplayer.rating_before as number,
      rd: matchplayer.rd_before as number,
    }

    const rating_jsonb_str = `'${JSON.stringify(rating)}'`

    mp_match_ids.push(matchplayer.match_id)
    mp_player_ids.push(matchplayer.player_id)
    matchplayer_ratings.push(rating_jsonb_str)
  }

  const mp_query =
  `with values as (
  SELECT * 
    FROM UNNEST(
        ARRAY[${mp_match_ids.join(',')}],
        ARRAY[${mp_player_ids.join(',')}],
        ARRAY[${matchplayer_ratings.join(',')}]::jsonb[]
    ) AS v(a,b,c)` +
  pg_dialect.sqlToQuery(sql`
  )
  update ${MatchPlayers}
  set
    rating = values.c
  from values
  where ${MatchPlayers.match_id} = values.a
  and ${MatchPlayers.player_id} = values.b
  `).sql

  console.log(mp_query)
  await db.execute(mp_query)

  // set rating not null
  await db.execute(sql.raw(`ALTER TABLE "MatchPlayers" ALTER COLUMN "rating" SET NOT NULL;`))
  // drop old columns
  await db.execute(sql.raw(`ALTER TABLE "MatchPlayers" DROP COLUMN IF EXISTS "rating_before";`))
  await db.execute(sql.raw(`ALTER TABLE "MatchPlayers" DROP COLUMN IF EXISTS "rd_before";`))


  await db.update(Settings).set({ versions: { db: 2 } }).where(eq(Settings.id, 1))

}

async function migrate_3 (db: PostgresJsDatabase) {

  const settings = (await db.select().from(Settings))[0]
  if (settings && settings.versions.db > 2) {
    console.log('skipping migration 3')
    return
  }
  
  // Update "initial_rating" in rankings. Rename 'initial_rating' to 'mu' and 'initial_rd' to 'rd'
  const rankings = await db.execute(sql.raw(`SELECT * FROM "Rankings"`))
  
  const initial_ratings = rankings.map(ranking => ranking.initial_rating as number)
  
  const ranking_ids = rankings.map(ranking => ranking.id)
  const new_initial_ratings = initial_ratings.map(_ => {
    const new_rating:Rating = default_initial_rating
    return `'${JSON.stringify(new_rating)}'`
  })

  const pg_dialect = new PgDialect()

  const query =
  `with values as (
  SELECT * 
    FROM UNNEST(
        ARRAY[${ranking_ids.join(',')}],
        ARRAY[${new_initial_ratings.join(',')}]::jsonb[]
    ) AS v(a,b)` +
  pg_dialect.sqlToQuery(sql`
  )
  update ${Rankings}
  set
    initial_rating = values.b
  from values
  where ${Rankings.id} = values.a
  `).sql
  
  console.log(query)
  await db.execute(query)

  await db.update(Settings).set({ versions: { db: 3 } }).where(eq(Settings.id, 1))

}



/*

  -- await db.execute(sql.raw(
  --   `
  --   ALTER TABLE "Rankings" ADD COLUMN if not exists "matchmaking_settings" jsonb;
  --   CREATE INDEX IF NOT EXISTS "access_tokens_user_id_index" ON "AccessTokens" USING btree ("user_id");
  --   CREATE INDEX IF NOT EXISTS "match_time_finished_index" ON "Matches" USING btree ("time_finished");
  --   `))

  -- const rankings = await db.select().from(Rankings)
  -- const default_elo_settings = {
  --   initial_rating: 50,
  --   initial_rd: 50 / 3,
  -- }

  -- for (const ranking of rankings) {
  --   const elo_settings = ranking.elo_settings ? {
  --     ...ranking.elo_settings,
  --     ...default_elo_settings,
  --   } : default_elo_settings

  --   const matchmaking_settings = {
  --     queue_enabled: true,
  --     direct_challenge_enabled: true,
  --   }

  --   await db.update(Rankings).set({ matchmaking_settings, elo_settings
  --    }).where(eq(Rankings.id, ranking.id))
  -- }

  -- await db.execute(sql.raw(
  --   `ALTER TABLE "Rankings" ALTER COLUMN "elo_settings" SET NOT NULL;--> statement-breakpoint
  --   ALTER TABLE "Rankings" ALTER COLUMN "matchmaking_settings" SET NOT NULL;--> statement-breakpoint`
  -- ))
*/