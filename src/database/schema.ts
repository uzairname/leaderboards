import { RESTPostOAuth2AccessTokenResult } from 'discord-api-types/v10'
import { pgTable, serial, text, integer, timestamp, boolean, real, primaryKey, index, jsonb, uniqueIndex } from 'drizzle-orm/pg-core'
import { MatchStatus } from './models/matches'
import { Vote } from './models/matches'
import { MatchMetadata } from './models/matches'
import { Player, PlayerFlags, PlayerStats } from './models/players'
import { Versions } from './models/settings'
import { Rating, MatchmakingSettings } from './models/rankings'
import { GuildRankingDisplaySettings } from './models/guildrankings'
import { unique } from 'drizzle-orm/mysql-core'

export const Settings = pgTable('Settings', {
  id: integer('id').primaryKey().default(1),
  last_updated: timestamp('last_updated').notNull().defaultNow(),
  versions: jsonb('versions').notNull().$type<Versions>(),
  config: jsonb('config'),
})


export const Users = pgTable('Users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  time_created: timestamp('time_created').notNull().defaultNow(),
  linked_roles_ranking_id: integer('linked_roles_ranking_id')
})


export const AccessTokens = pgTable('AccessTokens', {
  id: serial('id').primaryKey(),
  user_id: text('user_id').notNull().references(() => Users.id, {onDelete: 'cascade'}),
  data: jsonb('data').notNull().$type<RESTPostOAuth2AccessTokenResult>(),
  expires_at: timestamp('expires_at').notNull(),
  time_created: timestamp('time_created').notNull().defaultNow(),
}, (table) => ({
  user_idx: index('access_tokens_user_id_index').on(table.user_id),
}))


export const Guilds = pgTable('Guilds', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  time_created: timestamp('time_created').notNull().defaultNow(),
  admin_role_id: text('admin_role_id'),
  category_id: text('category_id'),
  matches_channel_id: text('matches_channel_id'),
})


export const Rankings = pgTable('Rankings', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  time_created: timestamp('time_created').notNull().defaultNow(),
  players_per_team: integer('players_per_team').notNull(),
  teams_per_match: integer('teams_per_match').notNull(),
  initial_rating: jsonb('initial_rating').notNull().$type<Rating>(), // make not null
  matchmaking_settings: jsonb('matchmaking_settings').notNull().$type<MatchmakingSettings>(),
})


export const GuildRankings = pgTable('GuildRankings', {
  guild_id: text('guild_id').notNull().references(() => Guilds.id, {onDelete: 'cascade'}),
  ranking_id: integer('ranking_id').notNull().references(() => Rankings.id, {onDelete: 'cascade'}),
  time_created: timestamp('time_created').notNull().defaultNow(),
  is_admin: boolean('is_admin'),
  leaderboard_channel_id: text('leaderboard_channel_id'),
  leaderboard_message_id: text('leaderboard_message_id'),
  display_settings: jsonb('display_settings').$type<GuildRankingDisplaySettings>(),
},(table) => { return {
  cpk: primaryKey({ columns: [table.guild_id, table.ranking_id] }),
}})


export const Players = pgTable('Players', {
  id: serial('id').primaryKey(),
  user_id: text('user_id').notNull().references(() => Users.id, { onDelete: 'cascade' }),
  ranking_id: integer('ranking_id').notNull().references(() => Rankings.id, { onDelete: 'cascade' }),
  time_created: timestamp('time_created').notNull().defaultNow(),
  name: text('name').notNull(),
  rating: jsonb('rating').notNull().$type<Rating>(),
  flags: integer('flags').notNull().$type<PlayerFlags>().default(0),
  stats: jsonb('stats').$type<PlayerStats>(),
}, (table) => { return {
  unique: uniqueIndex('player_user_id_ranking_id_unique').on(table.user_id, table.ranking_id),
}})


export const Teams = pgTable('Teams', {
  id: serial('id').primaryKey(),
  ranking_id: integer('ranking_id').notNull().references(() => Rankings.id, {onDelete: 'cascade'}),
  time_created: timestamp('time_created').notNull().defaultNow(),
  rating: real('rating'),
  name: text('name'),
})


export const TeamPlayers = pgTable('TeamPlayers', {
  team_id: integer('team_id').notNull().references(() => Teams.id, {onDelete: 'cascade'}),
  player_id: integer('player_id').notNull().references(() => Players.id, {onDelete: 'cascade'}),
  time_created: timestamp('time_created').notNull().defaultNow(),
}, (table) => ({
  cpk: primaryKey({ columns: [table.team_id, table.player_id] }),
}))


export const QueueTeams = pgTable('QueueTeams', {
  team_id: integer('team_id').primaryKey().references(() => Teams.id, {onDelete: 'cascade'}),
  time_created: timestamp('time_created').notNull().defaultNow(),
})


export const Matches = pgTable('Matches', {
  id: serial('id').primaryKey(),
  ranking_id: integer('ranking_id').notNull().references(() => Rankings.id, {onDelete: 'cascade'}),
  number: integer('number'),
  time_started: timestamp('time_started'),
  time_finished: timestamp('time_finished'),
  status: integer('status').notNull().$type<MatchStatus>(),
  team_votes: jsonb('team_votes').$type<Vote[]>(),
  ongoing_match_channel_id: text('ongoing_match_channel_id'),
  outcome: jsonb('outcome').$type<number[]>(),
  metadata: jsonb('metadata').$type<MatchMetadata>(),
}, (table) => ({
  ranking_idx: index('match_ranking_id_index').on(table.ranking_id),
  time_finished_idx: index('match_time_finished_index').on(table.time_finished),
  time_started_idx: index('match_time_started_index').on(table.time_started),
}))


export const MatchSummaryMessages = pgTable('MatchSummaryMessages', {
  match_id: integer('match_id').notNull().references(() => Matches.id, {onDelete: 'cascade'}),
  guild_id: text('guild_id').notNull().references(() => Guilds.id, {onDelete: 'cascade'}),
  channel_id: text('channel_id').notNull(),
  message_id: text('message_id').notNull(),
}, (table) => ({
  cpk: primaryKey({ columns: [table.match_id, table.guild_id] }),
}))


export const MatchPlayers = pgTable('MatchPlayers', {
  match_id: integer('match_id').notNull().references(() => Matches.id, { onDelete: 'cascade' }),
  player_id: integer('player_id').notNull().references(() => Players.id, { onDelete: 'cascade' }),
  team_num: integer('team_num').notNull(),
  rating: jsonb('rating').notNull().$type<Rating>(),
  flags: integer('flags').notNull().$type<PlayerFlags>().default(0),
}, (table) => ({
  cpk: primaryKey({ columns: [table.match_id, table.player_id] }),
}))
