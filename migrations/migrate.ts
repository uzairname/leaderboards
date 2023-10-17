import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import * as dotenv from 'dotenv'

async function migrate_database() {

  let postgres_urls = {
    env: process.env.POSTGRES_URL, // development, staging, or production
    test: process.env.POSTGRES_URL_TEST, // only used for testing
  }

  for (let [key, postgres_url] of Object.entries(postgres_urls)) {
    if (!postgres_url) {
      continue
    }

    console.log('migrating', key)
    const db = drizzle(postgres(postgres_url, { ssl: 'require', max: 1 }))
    await migrate(db, { migrationsFolder: 'migrations/migrations' })

  }

  console.log('done')
}

dotenv.config()

migrate_database().then(() => {
  process.exit(0)
})