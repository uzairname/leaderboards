import { pgTable, serial, text, integer, timestamp, boolean, real, primaryKey, index, jsonb } from 'drizzle-orm/pg-core'


export const Settings = pgTable('Settings', {
  id: integer('id').primaryKey().default(0),
  last_deployed: timestamp('last_deployed').defaultNow(),
})


export const Users = pgTable('Users', {
  id: text('id').primaryKey(),
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
  user_id: text('user_id').notNull().references(() => Users.id, {onDelete: 'cascade'}),
  data: jsonb('data').$type<AccessTokenData>(),
  purpose: text('purpose'),
})


export const Guilds = pgTable('Guilds', {
  id: text('id').primaryKey(),
  name: text('name'),
  time_created: timestamp('time_created').defaultNow(),
  admin_role_id: text('admin_role_id'),
  category_id: text('category_id'),
  match_results_channel_id: text('match_results_text_channel_id'),
})


export const Rankings = pgTable('Rankings', {
  id: serial('id').primaryKey(),
  name: text('name'),
  time_created: timestamp('time_created').defaultNow(),
  current_division_id: integer('current_division_id'),
  players_per_team: integer('players_per_team'),
  num_teams: integer('num_teams'),
})


export const GuildRankings = pgTable('GuildRankings', {
  guild_id: text('guild_id').notNull().references(() => Guilds.id, {onDelete: 'cascade'}),
  ranking_id: integer('ranking_id').notNull().references(() => Rankings.id, {onDelete: 'cascade'}),
  time_created: timestamp('time_created').defaultNow(),
  is_admin: boolean('is_admin'),
  leaderboard_channel_id: text('leaderboard_channel_id'),
  leaderboard_message_id: text('leaderboard_message_id'),
  queue_channel_id: text('queue_channel_id'),
  queue_message_id: text('queue_message_id'),
},(table) => { return {
  cpk: primaryKey(table.guild_id, table.ranking_id),
}})


export const RankingDivisions = pgTable('RankingDivisions', {
  id: serial('id').primaryKey(),
  ranking_id: integer('ranking_id').notNull().references(() => Rankings.id, {onDelete: 'cascade'}),
  time_created: timestamp('time_created').defaultNow(),
  name: text('name'),
}, (table) => { return {
  idx_ranking: index('RankingDivision_by_ranking_id').on(table.ranking_id),
}})


export const Players = pgTable('Players', {
  user_id: text('user_id').notNull().references(() => Users.id, {onDelete: 'cascade'}),
  ranking_division_id: integer('ranking_division_id').notNull().references(() => RankingDivisions.id, {onDelete: 'cascade'}),
  time_created: timestamp('time_created').defaultNow(),
  nickname: text('nickname'),
  rating: real('rating'),
  rd: real('rd'),
  stats: jsonb('stats'),
}, (table) => { return {
  cpk: primaryKey(table.user_id, table.ranking_division_id),
}})


export const Matches = pgTable('Matches', {
  id: serial('id').primaryKey(),
  ranking_division_id: integer('ranking_division_id').notNull().references(() => RankingDivisions.id, {onDelete: 'cascade'}),
  time_created: timestamp('time_created').defaultNow(),
  time_finished: timestamp('time_finished'),
  number: integer('number'),
  team_users: jsonb('team_users').$type<string[][]>(),
  outcome: jsonb('outcome').$type<number[]>(),
  metadata: jsonb('metadata'),
  summary_channel_id: text('summary_channel_id'),
  summary_message_id: text('summary_message_id'),
})


export const Teams = pgTable('Teams', {
  id: serial('id').primaryKey(),
  time_created: timestamp('time_created').defaultNow(),
  name: text('name'),
  rating: real('rating'),
})


export const TeamPlayers = pgTable('TeamPlayers', {
  team_id: integer('team_id').notNull().references(() => Teams.id, {onDelete: 'cascade'}),
  user_id: text('user_id').notNull().references(() => Players.user_id, {onDelete: 'cascade'}),
  time_created: timestamp('time_created').defaultNow(),
}, (table) => { return {
  cpk: primaryKey(table.team_id, table.user_id),
}})


export const QueueTeams = pgTable('QueueTeams', {
  ranking_division_id: integer('ranking_division_id').notNull().references(() => RankingDivisions.id, {onDelete: 'cascade'}),
  team_id: integer('team_id').notNull().references(() => Teams.id, {onDelete: 'cascade'}),
  time_created: timestamp('time_created').defaultNow(),
}, (table) => { return {
  cpk: primaryKey(table.ranking_division_id, table.team_id),
}})
