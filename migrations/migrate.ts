import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import * as dotenv from 'dotenv'

async function migrate_database() {
  console.log(process.env.POSTGRES_URL)
  if (!process.env.POSTGRES_URL) throw new Error('POSTGRES_URL not set')
  
  console.log('migrating')
  const db = drizzle(postgres(process.env.POSTGRES_URL, { ssl: 'require', max: 1 }))
  await migrate(db, { migrationsFolder: 'migrations/migrations' })
}

dotenv.config()

migrate_database().then(() => {
  console.log('done')
  process.exit(0)
})
