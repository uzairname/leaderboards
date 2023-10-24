import { pgTable, serial, json, text, integer, timestamp, boolean, real, primaryKey, index, jsonb, } from 'drizzle-orm/pg-core'

export const Settings = pgTable('Settings', {
  id: integer('id').primaryKey().default(0),
  last_deployed: timestamp('last_deployed').defaultNow(),
})

export const Users = pgTable('Users', {
  id: text('id').primaryKey(),
  // linked_roles_ranking_division: integer('linked_roles_ranking_division'), // for linked roles.
  name: text('name'),
})

export type AccessTokenData = {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token: string
  scope: string
}

export const AccessTokens = pgTable('AccessTokens', {
  id: text('id').primaryKey(),
  user_id: text('user_id').references(() => Users.id, {onDelete: 'cascade'}),
  purpose: text('purpose'),
  data: jsonb('data').$type<AccessTokenData>(),
})

export const Guilds = pgTable('Guilds', {
  id: text('id').primaryKey(),
  name: text('name'),
  admin_role_id: text('admin_role_id'),
  category_id: text('category_id'),
  match_results_channel_id: text('match_results_text_channel_id'),
  channel_settings: jsonb('channel_settings'),
})

export const Leaderboards = pgTable('Leaderboards', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  time_created: timestamp('time_created').defaultNow(),
  default_division_id: integer('default_division_id'),
  players_per_team: integer('players_per_team').default(1),
  // delete queue_type
  queue_type: integer('queue_type'),
  // delete owner_guild_id
  owner_guild_id: text('owner_guild_id').notNull().references(() => Guilds.id, {onDelete: 'cascade'}),
})

export const GuildLeaderboards = pgTable('GuildLeaderboards', {
  guild_id: text('guild_id').notNull().references(() => Guilds.id, {onDelete: 'cascade'}),
  leaderboard_id: integer('leaderboard_id').notNull().references(() => Leaderboards.id, {onDelete: 'cascade'}),
  is_admin: boolean('is_admin').default(false),
  display_channel_id: text('display_channel_id'),
  display_message_id: text('display_message_id'),
  queue_message_id: text('queue_message_id'),
},(table) => { return {
  cpk: primaryKey(table.guild_id, table.leaderboard_id),
}})

export const LeaderboardDivisions = pgTable('LeaderboardDivisions', {
  id: serial('id').primaryKey(),
  leaderboard_id: integer('leaderboard_id').notNull().references(() => Leaderboards.id, {onDelete: 'cascade'}),
  name: text('name'),
  time_created: timestamp('time_created').defaultNow(),
}, (table) => { return {
  idx_leaderboard: index('LeaderboardDivision_by_leaderboard_id').on(table.leaderboard_id),
}})

export const Players = pgTable('Players', {
  user_id: text('user_id').notNull().references(() => Users.id, {onDelete: 'cascade'}),
  lb_division_id: integer('lb_division_id').notNull().references(() => LeaderboardDivisions.id, {onDelete: 'cascade'}),
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
  queued_lb_division_id: integer('leaderboard_division_id').references(() => LeaderboardDivisions.id, {onDelete: 'cascade'}),
  user_ids: jsonb('user_ids').$type<string[]>(),
  pending_user_ids: jsonb('pending_user_ids').$type<string[]>(),
  mmr: real('mmr'),
  time_joined_queue: timestamp('time_joined_queue'),
})

export const Matches = pgTable('Matches', {
  id: serial('id').primaryKey(),
  lb_division_id: integer('lb_division_id').notNull().references(() => LeaderboardDivisions.id, {onDelete: 'cascade'}),
  status: integer('status'),
  team_players: jsonb('team_players').$type<string[][]>(),
  team_votes: jsonb('team_votes').$type<number[]>(),
  outcome: jsonb('outcome').$type<number[]>(),
  time_started: timestamp('time_started'),
  time_finished: timestamp('time_finished'),
  metadata: jsonb('metadata'),
})
