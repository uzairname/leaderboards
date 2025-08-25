import { isInt, nonNullable } from '@repo/utils'
import { config } from 'dotenv'
import { eq, sql } from 'drizzle-orm'
import { NeonDatabase } from 'drizzle-orm/neon-serverless'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { DbClient, getNeonDrizzleWsClient } from '../src'
import { matches_trigger_query } from '../src/migration-utils/queries'
import { MatchOutcome, MatchUpdate, OldVote, OutcomeType, RatingStrategy, WLDVote } from '../src/models'
import { Matches } from '../src/schema'

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

const custom_migrations: ((tx: NeonDatabase, db: DbClient) => Promise<void>)[] = []

async function customMigrations(postgres_url: string) {
  const drizzle = getNeonDrizzleWsClient(postgres_url)

  const v = (await drizzle.execute(sql`SELECT * FROM "Settings"`)).rows[0].db_version
  if (!isInt(v)) throw new Error('db_version is not an int')

  for (let i = v; i < custom_migrations.length; i++) {
    await drizzle.transaction(async tx => {
      await custom_migrations[i](tx, new DbClient(tx))
      await tx.execute(sql`UPDATE "Settings" SET "db_version" = ${i + 1};`)
    })
  }
}

custom_migrations.push(async (tx, db) => {
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
    const rating_settings: any = {
      scoring_method: RatingStrategy.TrueSkill,
    }
    await db.rankings.get(ranking.id as number).update({ rating_settings })
  }

  // Apply remaining migrations: make rating_settings not null
  await tx.execute(`
    ALTER TABLE "Rankings" ALTER COLUMN "rating_settings" SET NOT NULL;--> statement-breakpoint
    ALTER TABLE "Settings" ADD COLUMN "db_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
    ALTER TABLE "Settings" DROP COLUMN IF EXISTS "versions";`)

  const rankings_ = await tx.execute(`SELECT * FROM "Rankings"`)
  console.log(rankings_.rows)
})

custom_migrations.push(async (tx, db) => {
  const rankings = await tx.execute(`SELECT * FROM "Rankings"`)
  for (const ranking of rankings.rows) {
    const old_rating_settings = ranking.rating_settings as any
    const rating_settings: any = {
      ...old_rating_settings,
      initial_rating: ranking.initial_rating ?? {
        mu: 50,
        rd: 50 / 3,
      },
    }
    await db.rankings.get(ranking.id as number).update({ rating_settings })
  }

  await tx.execute(`ALTER TABLE "Rankings" DROP COLUMN IF EXISTS "initial_rating";`)
})

custom_migrations.push(async (tx, db) => {
  const rankings = await tx.execute(`SELECT * FROM "Rankings"`)
  for (const ranking of rankings.rows) {
    // rename rating_settings.scoring_method to rating_settings.rating_strategy
    const old_rating_settings = ranking.rating_settings as any
    const rating_settings: any = {
      ...old_rating_settings,
      rating_strategy: old_rating_settings.scoring_method ?? RatingStrategy.TrueSkill,
    }
    delete rating_settings.scoring_method
    await db.rankings.get(ranking.id as number).update({ rating_settings })
  }
})

custom_migrations.push(async (tx, db) => {
  // Convert old match results to new type
  // Convert old voting type to new type
  const matches = await db.drizzle
    .select({
      id: Matches.id,
      outcome: Matches.outcome,
      outcome_old: Matches.outcome_old,
      team_votes: Matches.team_votes,
      team_votes_old: Matches.team_votes_old,
    })
    .from(Matches)
  console.log(matches.length)

  for (const match of matches) {
    const update: MatchUpdate = {}

    if (match.outcome === null && match.outcome_old !== null) {
      const new_outcome: MatchOutcome = {
        type: OutcomeType.WinLossDraw,
        team_scores: match.outcome_old,
      }
      console.log(`Updating match ${match.id} outcome from ${match.outcome_old} to ${JSON.stringify(new_outcome)}`)
      update.outcome = new_outcome
    }

    if (match.team_votes === null && match.team_votes_old !== null) {
      const new_votes = match.team_votes_old.map((vote, team_num) => {
        return Object.fromEntries([
          [
            team_num,
            {
              cancel: vote === OldVote.Cancel,
              own_wld:
                vote === OldVote.Draw
                  ? WLDVote.Draw
                  : vote === OldVote.Win
                    ? WLDVote.Win
                    : vote === OldVote.Loss
                      ? WLDVote.Loss
                      : undefined,
              team_scores: undefined,
            },
          ],
        ])
      })

      update.team_votes = new_votes
      console.log(`Updating match ${match.id} team_votes from ${match.team_votes_old} to ${JSON.stringify(new_votes)}`)
    }

    if (Object.keys(update).length === 0) continue
    await db.drizzle.update(Matches).set(update).where(eq(Matches.id, match.id)).execute()
  }
})
