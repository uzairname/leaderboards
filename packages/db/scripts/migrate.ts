import { isInt, nonNullable } from '@repo/utils'
import { config } from 'dotenv'
import { sql } from 'drizzle-orm'
import { NeonDatabase } from 'drizzle-orm/neon-serverless'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { DbClient, getNeonDrizzleWsClient } from '../src'
import { matches_trigger_query } from '../src/migration-utils/queries'
import { RatingSettings, ScoringMethod } from '../src/models'

// Run this script from the directory database/

async function migrate_database(postgres_url: string): Promise<void> {
  console.log('migrating')

  const db = drizzle(postgres(postgres_url, { ssl: 'require', max: 1 }))

  await customMigrations(postgres_url)

  await migrate(db, { migrationsFolder: 'drizzle-migrations' })

  await db.execute(matches_trigger_query)

  console.log('done migrating')
}

const args = process.argv.slice(2)
const envPath = args.length == 1 ? args[0] : undefined
config({ path: envPath ?? '../../.env', override: true })

const postgres_url = nonNullable(process.env.POSTGRES_URL, 'postgres url')

migrate_database(postgres_url)
  .then(() => {
    process.exit(0)
  })
  .catch(e => {
    console.error(e)
    process.exit(1)
  })

async function customMigrations(postgres_url: string) {
  const drizzle = getNeonDrizzleWsClient(postgres_url)

  const v = (await drizzle.execute(sql`SELECT * FROM "Settings"`)).rows[0].db_version
  if (!isInt(v)) throw new Error('db_version is not an int')

  if (v <= 0) {
    await drizzle.transaction(async tx => {
      await migratev0(tx)
      await tx.execute(sql`UPDATE "Settings" SET "db_version" = 1;`)
    })
  }
}

async function migratev0(tx: NeonDatabase) {
  const db = new DbClient(tx)

  await tx.execute(`
    ALTER TABLE "Rankings" ADD COLUMN "match_config" jsonb;
  `)

  // Apply migrations before
  await tx.execute(
    `ALTER TABLE "Rankings" RENAME COLUMN "match_config" TO "match_settings";--> statement-breakpoint
      ALTER TABLE "Rankings" ADD COLUMN "rating_settings" jsonb;
  `,
  )

  // Add in default values
  const rankings = await tx.execute(`SELECT * FROM "Rankings"`)
  for (const ranking of rankings.rows) {
    const rating_settings: RatingSettings = {
      scoring_method: ScoringMethod.TrueSkill,
    }
    await db.rankings.get(ranking.id as number).update({ rating_settings })
    // await tx.execute(sql`UPDATE "Rankings" SET "rating_settings" = ${rating_settings} WHERE id = ${ranking.id}`)
  }

  // Apply remaining migrations: make rating_settings not null
  await tx.execute(`
    ALTER TABLE "Rankings" ALTER COLUMN "rating_settings" SET NOT NULL;--> statement-breakpoint
    ALTER TABLE "Settings" ADD COLUMN "db_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
    ALTER TABLE "Settings" DROP COLUMN IF EXISTS "versions";`)

  const rankings_ = await tx.execute(`SELECT * FROM "Rankings"`)
  console.log(rankings_.rows)
}
