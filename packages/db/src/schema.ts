import { RESTPostOAuth2AccessTokenResult } from 'discord-api-types/v10'
import { pgTable, serial, text, integer, timestamp, boolean, real, primaryKey, index, jsonb, uniqueIndex } from 'drizzle-orm/pg-core'
import { MatchOutcome, MatchStatus, OldVote, Vote, TeamVotes } from './models/matches'
import { MatchMetadata } from './models/matches'
import { PlayerFlags, PlayerStats } from './models/players'
import { Rating, MatchmakingSettings, MatchSettings, RatingParameters, SharigSettingsSchema, SharingSettings } from './models/rankings'
import { GuildRankingDisplaySettings, RankRoles } from './models/guild-rankings'

export const Settings = pgTable('Settings', {
  id: integer('id').primaryKey().default(1),
  last_updated: timestamp('last_updated').notNull().defaultNow(),
  db_version: integer('db_version').notNull().default(0),
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
}, (table) => [
  index('access_tokens_user_id_index').on(table.user_id),
])


export const Guilds = pgTable('Guilds', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  time_created: timestamp('time_created').notNull().defaultNow(),
  admin_role_id: text('admin_role_id'),
  category_id: text('category_id'),
  admin_channel_id: text('admin_channel_id'),
  matches_channel_id: text('matches_channel_id'),
  epmemeral_commands: boolean('ephemeral_commands').notNull().default(false),
})


export const Rankings = pgTable('Rankings', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  time_created: timestamp('time_created').notNull().defaultNow(),
  players_per_team: integer('players_per_team').notNull(),
  teams_per_match: integer('teams_per_match').notNull(),
  rating_settings: jsonb('rating_parameters').notNull().$type<RatingParameters>(),
  matchmaking_settings: jsonb('matchmaking_settings').$type<MatchmakingSettings>(),
  match_settings: jsonb('match_settings').$type<MatchSettings>(),
  sharing_settings: jsonb('sharing_settings').$type<SharingSettings>(),
})


export const GuildRankings = pgTable('GuildRankings', {
  guild_id: text('guild_id').notNull().references(() => Guilds.id, {onDelete: 'cascade'}),
  ranking_id: integer('ranking_id').notNull().references(() => Rankings.id, {onDelete: 'cascade'}),
  time_created: timestamp('time_created').notNull().defaultNow(),
  is_admin: boolean('is_admin'),
  leaderboard_channel_id: text('leaderboard_channel_id'),
  leaderboard_message_id: text('leaderboard_message_id'),
  display_settings: jsonb('display_settings').$type<GuildRankingDisplaySettings>(),
  matchmaking_settings: jsonb('matchmaking_settings').$type<MatchmakingSettings>(),
  rank_roles: jsonb('rank_roles').$type<RankRoles>(),
},(table) => [
  primaryKey({ columns: [table.guild_id, table.ranking_id] })
])


export const Players = pgTable('Players', {
  id: serial('id').primaryKey(),
  ranking_id: integer('ranking_id').notNull().references(() => Rankings.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  user_id: text('user_id').references(() => Users.id, { onDelete: 'cascade' }),
  role_id: text('role_id'),
  guild_id: text('guild_id').references(() => Guilds.id, { onDelete: 'cascade' }),
  time_created: timestamp('time_created').notNull().defaultNow(),
  rating: jsonb('rating').notNull().$type<Rating>(),
  flags: integer('flags').notNull().$type<PlayerFlags>().default(0),
  time_joined_queue: timestamp('time_joined_queue'),
  stats: jsonb('stats').$type<PlayerStats>(),
}, (table) => [
  uniqueIndex('player_user_id_ranking_id_unique').on(table.user_id, table.ranking_id),
  index('player_time_joined_queue_index').on(table.time_joined_queue),
  index('player_name_index').on(table.name),
])


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
}, (table) => [
  primaryKey({ columns: [table.team_id, table.player_id] }),
])


export const Matches = pgTable('Matches', {
  id: serial('id').primaryKey(),
  ranking_id: integer('ranking_id').notNull().references(() => Rankings.id, {onDelete: 'cascade'}),
  number: integer('number'),
  time_started: timestamp('time_started'),
  time_finished: timestamp('time_finished'),
  ongoing_match_channel_id: text('ongoing_match_channel_id'),
  status: integer('status').notNull().$type<MatchStatus>(),
  team_votes_old: jsonb('team_votes').$type<OldVote[]>(),
  outcome_old: jsonb('outcome').$type<number[]>(),
  team_votes: jsonb('team_votes_new').$type<TeamVotes>(),
  outcome: jsonb('outcome_new').$type<MatchOutcome>(),
  metadata: jsonb('metadata').$type<MatchMetadata>(),
}, (table) => [
  index('match_ranking_id_index').on(table.ranking_id),
  index('match_time_finished_index').on(table.time_finished),
  index('match_time_started_index').on(table.time_started),
])


export const MatchSummaryMessages = pgTable('MatchSummaryMessages', {
  match_id: integer('match_id').notNull().references(() => Matches.id, {onDelete: 'cascade'}),
  guild_id: text('guild_id').notNull().references(() => Guilds.id, {onDelete: 'cascade'}),
  channel_id: text('channel_id').notNull(),
  message_id: text('message_id').notNull(),
}, (table) => [
  primaryKey({ columns: [table.match_id, table.guild_id] }),
])


export const MatchPlayers = pgTable('MatchPlayers', {
  match_id: integer('match_id').notNull().references(() => Matches.id, { onDelete: 'cascade' }),
  player_id: integer('player_id').notNull().references(() => Players.id, { onDelete: 'cascade' }),
  team_num: integer('team_num').notNull(),
  rating: jsonb('rating').notNull().$type<Rating>(),
  flags: integer('flags').notNull().$type<PlayerFlags>().default(0),
  time_since_last_match: integer('time_since_last_match')
}, (table) => [
  primaryKey({ columns: [table.match_id, table.player_id] }),
])
