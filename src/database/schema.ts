import { pgTable, serial, json, text, integer, timestamp, boolean, real, primaryKey, index, jsonb, } from 'drizzle-orm/pg-core'

export const Settings = pgTable('Settings', {
  id: integer('id').primaryKey().default(0),
  last_deployed: timestamp('last_deployed').defaultNow(),
})

export const Users = pgTable('Users', {
  id: text('id').primaryKey(),
  name: text('name'),
})

export const AccessTokens = pgTable('AccessTokens', {
  id: text('id').primaryKey(),
  user_id: text('user_id').references(() => Users.id),
  purpose: text('purpose'),
  data: jsonb('data').$type<{
    access_token: string
    token_type: string
    expires_in: number
    refresh_token: string
    scope: string
  }>(),
})

export const Guilds = pgTable('Guilds', {
  id: text('id').primaryKey(),
  name: text('name'),
  admin_role_id: text('admin_role_id'),
  category_id: text('category_id'),
  match_results_channel_id: text('match_results_text_channel_id'),
})

export const Leaderboards = pgTable('Leaderboards', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  owner_guild_id: text('owner_guild_id').notNull().references(() => Guilds.id),
  default_division_id: integer('default_division_id'),
  time_created: timestamp('time_created').defaultNow(),
  players_per_team: integer('players_per_team').default(1),
  queue_type: integer('queue_type'),
})

export const GuildLeaderboards = pgTable('GuildLeaderboards', {
  guild_id: text('guild_id').notNull().references(() => Guilds.id),
  leaderboard_id: integer('leaderboard_id').notNull().references(() => Leaderboards.id),
  is_admin: boolean('is_admin').default(false),
  display_channel_id: text('display_channel_id'),
  display_message_id: text('display_message_id'),
  queue_message_id: text('queue_message_id'),
},(table) => { return {
  cpk: primaryKey(table.guild_id, table.leaderboard_id),
}})

export const LeaderboardDivisions = pgTable('LeaderboardDivisions', {
  id: serial('id').primaryKey(),
  leaderboard_id: integer('leaderboard_id').notNull().references(() => Leaderboards.id),
  name: text('name'),
  time_created: timestamp('time_created').defaultNow(),
}, (table) => { return {
  idx_leaderboard: index('LeaderboardDivision_by_leaderboard_id').on(table.leaderboard_id),
}})

export const Players = pgTable('Players', {
  user_id: text('user_id').notNull().references(() => Users.id),
  lb_division_id: integer('lb_division_id').notNull().references(() => LeaderboardDivisions.id),
  nickname: text('nickname'),
  rating: real('rating'),
  rd: real('rd'),
  stats: jsonb('stats'),
  time_created: timestamp('time_created').defaultNow(),
}, (table) => { return {
  cpk: primaryKey(table.user_id, table.lb_division_id),
}})

export const QueueTeams = pgTable('QueueTeams', {
  id: serial('id').primaryKey(),
  queued_lb_division_id: integer('leaderboard_division_id').references(() => LeaderboardDivisions.id,),
  user_ids: jsonb('user_ids').$type<string[]>(),
  pending_user_ids: jsonb('pending_user_ids').$type<string[]>(),
  mmr: real('mmr'),
  time_joined_queue: timestamp('time_joined_queue'),
})

export const Matches = pgTable('Matches', {
  id: serial('id').primaryKey(),
  lb_division_id: integer('lb_division_id').notNull().references(() => LeaderboardDivisions.id),
  status: integer('status'),
  team_players: json('team_players').$type<string[][]>(),
  team_votes: jsonb('team_votes').$type<number[]>(),
  outcome: jsonb('outcome').$type<number[]>(),
  time_started: timestamp('time_started'),
  time_finished: timestamp('time_finished'),
  metadata: jsonb('metadata'),
})
