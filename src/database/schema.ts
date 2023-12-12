import { pgTable, serial, text, integer, timestamp, boolean, real, primaryKey, index, jsonb, bigint } from 'drizzle-orm/pg-core'


export const Settings = pgTable('Settings', {
  id: integer('id').primaryKey().default(1),
  last_deployed: timestamp('last_deployed').defaultNow(),
  config: jsonb('config').$type<any>(),
})

export const Users = pgTable('Users', {
  id: text('id').primaryKey(),
  name: text('name'),
  time_created: timestamp('time_created').defaultNow(),
})

export type AccessTokenData = Partial<{
  access_token: string
  token_type: string
  expires_in: number
  refresh_token: string
  scope: string
}>

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
  match_results_textchannel_id: text('match_results_textchannel_id'),
  match_results_forum_id: text('match_results_forum_id'),
})


export type EloSettings = Partial<{
  initial_rating: number
  initial_rd: number
}>

export const Rankings = pgTable('Rankings', {
  id: serial('id').primaryKey(),
  name: text('name'),
  time_created: timestamp('time_created').defaultNow(),
  players_per_team: integer('players_per_team'),
  num_teams: integer('num_teams'),
  elo_settings: jsonb('elo_settings').$type<EloSettings>(),
  // ranks: jsonb('ranks'),
  // match_settings: jsonb('match_settings'),
})


export const GuildRankings = pgTable('GuildRankings', {
  guild_id: text('guild_id').notNull().references(() => Guilds.id, {onDelete: 'cascade'}),
  ranking_id: integer('ranking_id').notNull().references(() => Rankings.id, {onDelete: 'cascade'}),
  time_created: timestamp('time_created').defaultNow(),
  is_admin: boolean('is_admin'),
  leaderboard_channel_id: text('leaderboard_channel_id'),
  leaderboard_message_id: text('leaderboard_message_id'),
  ongoing_matches_channel_id: text('ongoing_matches_channel_id'),
  match_results_textchannel_id: text('match_results_textchannel_id'),
  match_results_forum_id: text('match_results_forum_id'),
  queue_channel_id: text('queue_channel_id'),
  queue_message_id: text('queue_message_id'),
},(table) => { return {
  cpk: primaryKey(table.guild_id, table.ranking_id),
}})


export const Players = pgTable('Players', {
  id: serial('id').primaryKey(),
  user_id: text('user_id').notNull().references(() => Users.id, {onDelete: 'cascade'}),
  ranking_id: integer('ranking_id').notNull().references(() => Rankings.id, {onDelete: 'cascade'}),
  time_created: timestamp('time_created').defaultNow(),
  name: text('name'),
  rating: real('rating'),
  rd: real('rd'),
  stats: jsonb('stats'),
}, (table) => { return {
  user_idx: index('player_user_id_index').on(table.user_id),
  ranking_idx: index('player_ranking_id_index').on(table.ranking_id),
}})


export const Teams = pgTable('Teams', {
  id: serial('id').primaryKey(),
  ranking_id: integer('ranking_id').notNull().references(() => Rankings.id, {onDelete: 'cascade'}),
  time_created: timestamp('time_created').defaultNow(),
  rating: real('rating'),
  name: text('name'),
})


export const TeamPlayers = pgTable('TeamPlayers', {
  team_id: integer('team_id').notNull().references(() => Teams.id, {onDelete: 'cascade'}),
  player_id: integer('player_id').notNull().references(() => Players.id, {onDelete: 'cascade'}),
  time_created: timestamp('time_created').defaultNow(),
}, (table) => { return {
  cpk: primaryKey(table.team_id, table.player_id),
}})


export const QueueTeams = pgTable('QueueTeams', {
  team_id: integer('team_id').primaryKey().references(() => Teams.id, {onDelete: 'cascade'}),
  time_created: timestamp('time_created').defaultNow(),
})


export const ActiveMatches = pgTable('ActiveMatches', {
  id: serial('id').primaryKey(),
  ranking_id: integer('ranking_id').notNull().references(() => Rankings.id, {onDelete: 'cascade'}),
  time_created: timestamp('time_created').defaultNow(),
  status: integer('status'),
  team_players: jsonb('team_players').$type<number[][]>(),
  team_votes: jsonb('team_votes').$type<number[]>(),
  channel_id: text('channel_id'),
  message_id: text('message_id'),
})


export const Matches = pgTable('Matches', {
  id: serial('id').primaryKey(),
  ranking_id: integer('ranking_id').notNull().references(() => Rankings.id, {onDelete: 'cascade'}),
  time_started: timestamp('time_started'),
  time_finished: timestamp('time_finished'),
  number: integer('number'),
  team_players: jsonb('team_players').$type<number[][]>(),
  outcome: jsonb('outcome').$type<number[]>(),
  metadata: jsonb('metadata'),
}, (table) => { return {
  ranking_idx: index('match_ranking_id_index').on(table.ranking_id),
}})


export const MatchSummaryMessages = pgTable('MatchSummaryMessages', {
  match_id: integer('match_id').notNull().references(() => Matches.id, {onDelete: 'cascade'}),
  guild_id: text('guild_id').notNull().references(() => Guilds.id, {onDelete: 'cascade'}),
  forum_thread_id: text('forum_thread_id'),
  message_id: text('message_id'),
}, (table) => { return {
  cpk: primaryKey(table.match_id, table.guild_id),
}})


export const MatchPlayers = pgTable('MatchPlayers', {
  match_id: integer('match_id').notNull().references(() => Matches.id, {onDelete: 'cascade'}),
  player_id: integer('player_id').notNull().references(() => Players.id, {onDelete: 'cascade'}),
  team_num: integer('team_num'),
  rating_before: real('rating_before'),
  rd_before: real('rd_before'),
  time_created: timestamp('time_created').defaultNow(),
}, (table) => { return {
  cpk: primaryKey(table.match_id, table.player_id),
}})
