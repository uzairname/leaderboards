import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { matches_trigger_query } from './queries'

export async function migrate_database(postgres_url: string): Promise<void> {
  console.log('migrating')

  const db = drizzle(
    postgres(postgres_url, { ssl: 'require', max: 1 }),
  )

  await migrate(db, { migrationsFolder: 'scripts/drizzle-migrations' })

  await db.execute(matches_trigger_query)

  console.log('done migrating')
}
