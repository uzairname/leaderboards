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
  
  await migrate(db, { migrationsFolder: 'scripts/drizzle-migrations' })
  
  await db.execute(matches_trigger_query)

  console.log('done migrating')
}

migrate_database().then(() => {
  process.exit(0)
})
