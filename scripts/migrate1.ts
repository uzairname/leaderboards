import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import * as dotenv from 'dotenv'
import { and, eq, sql } from 'drizzle-orm'
import { nonNullable } from '../src/utils/utils'
import { getNeonDrizzleClient } from '../src/database/drizzle-client'
import { DbClient } from '../src/database/client'
import { Guilds, MatchSummaryMessages } from '../src/database/schema'

const args = process.argv.slice(2)

const envPath = args.length == 1 ? args[0] : undefined

dotenv.config({
  path: envPath
})

const postgres_url = nonNullable(process.env.POSTGRES_URL, "postgres url")

export async function migrate_1() {
  
  console.log('migrating 1')

  const drizzle = getNeonDrizzleClient(postgres_url)
  // const db = new DbClient(client)

  await drizzle.execute(sql`ALTER TABLE "MatchSummaryMessages" ADD COLUMN IF NOT EXISTS "channel_id" text;`)

  const match_summary_messages = await drizzle.select().from(MatchSummaryMessages)
    .innerJoin(Guilds, eq(Guilds.id, MatchSummaryMessages.guild_id))

  match_summary_messages.forEach(async (match_summary_message) => {
    const channel_id = match_summary_message.Guilds.matches_channel_id ?? undefined
    await drizzle.update(MatchSummaryMessages).set({ channel_id }).where(
      and(
        eq(MatchSummaryMessages.guild_id, match_summary_message.MatchSummaryMessages.guild_id),
        eq(MatchSummaryMessages.match_id, match_summary_message.MatchSummaryMessages.match_id)
      )
    )
  })



  console.log('done migrating')
}

migrate_1().then(() => {
  process.exit(0)
})
