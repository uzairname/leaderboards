import { nonNullable } from '@repo/utils'
import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { matches_trigger_query } from '../src/migration-utils/queries'

// Run this script from the directory database/

async function migrate_database(postgres_url: string): Promise<void> {
  console.log('migrating')

  const db = drizzle(postgres(postgres_url, { ssl: 'require', max: 1 }))

  await migrate(db, { migrationsFolder: 'drizzle-migrations' })

  await db.execute(matches_trigger_query)

  console.log('done migrating')
}

const args = process.argv.slice(2)
const envPath = args.length == 1 ? args[0] : undefined
config({ path: envPath, override: true })

const postgres_url = nonNullable(process.env.POSTGRES_URL, 'postgres url')

migrate_database(postgres_url)
  .then(() => {
    process.exit(0)
  })
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
