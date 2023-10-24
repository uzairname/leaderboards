import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import * as dotenv from 'dotenv'

async function migrate_database() {
  dotenv.config()
  if (!process.env.POSTGRES_URL) throw new Error('POSTGRES_URL not set')

  console.log('migrating')
  const db = drizzle(postgres(process.env.POSTGRES_URL, { ssl: 'require', max: 1 }))
  await migrate(db, { migrationsFolder: 'migrations/migrations' })
  console.log('done')
}

migrate_database().then(() => {
  process.exit(0)
})
