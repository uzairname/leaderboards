import { InferModel } from 'drizzle-orm'
import {
  AccessTokens,
  GuildLeaderboards,
  Guilds,
  LeaderboardDivisions,
  Leaderboards,
  Matches,
  Players,
  QueueTeams,
  Settings,
  Users,
} from '../schema'

// Types for each model, for each type of query.
// The "Update" type of each model is the insert type without primary/foreign keys.

export type SettingSelect = InferModel<typeof Settings, 'select'>
export type SettingUpdate = Partial<Omit<SettingSelect, 'id'>>

export type UserSelect = InferModel<typeof Users, 'select'>
export type UserInsert = InferModel<typeof Users, 'insert'>
export type UserUpdate = Partial<Omit<UserInsert, 'id'>>

export type AccessTokenSelect = InferModel<typeof AccessTokens, 'select'>
export type AccessTokenInsert = InferModel<typeof AccessTokens, 'insert'>
export type AccessTokenUpdate = Partial<Omit<AccessTokenInsert, 'user_id'>>

export type GuildSelect = InferModel<typeof Guilds, 'select'>
export type GuildInsert = InferModel<typeof Guilds, 'insert'>
export type GuildUpdate = Partial<Omit<GuildInsert, 'id'>>

export type LeaderboardSelect = InferModel<typeof Leaderboards, 'select'>
export type LeaderboardInsert = InferModel<typeof Leaderboards, 'insert'>
export type LeaderboardUpdate = Partial<Omit<LeaderboardInsert, 'id'>>

export type GuildLeaderboardSelect = InferModel<typeof GuildLeaderboards, 'select'>
export type GuildLeaderboardInsert = InferModel<typeof GuildLeaderboards, 'insert'>
export type GuildLeaderboardUpdate = Partial<
  Omit<GuildLeaderboardInsert, 'guild_id' | 'leaderboard_id'>
>

export type LeaderboardDivisionSelect = InferModel<typeof LeaderboardDivisions, 'select'>
export type LeaderboardDivisionInsert = InferModel<typeof LeaderboardDivisions, 'insert'>
export type LeaderboardDivisionUpdate = Partial<
  Omit<LeaderboardDivisionInsert, 'id' | 'leaderboard_id'>
>

export type PlayerSelect = InferModel<typeof Players, 'select'>
export type PlayerInsert = InferModel<typeof Players, 'insert'>
export type PlayerUpdate = Partial<Omit<PlayerInsert, 'user_id' | 'lb_division_id'>>

export type QueueTeamSelect = InferModel<typeof QueueTeams, 'select'>
export type QueueTeamInsert = InferModel<typeof QueueTeams, 'insert'>
export type QueueTeamUpdate = Partial<Omit<QueueTeamInsert, 'id'>>

export type MatchSelect = InferModel<typeof Matches, 'select'>
export type MatchInsert = InferModel<typeof Matches, 'insert'>
export type MatchUpdate = Partial<Omit<MatchInsert, 'id' | 'lb_division_id'>>
