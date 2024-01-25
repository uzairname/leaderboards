import { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import {
  AccessTokens,
  GuildRankings,
  Guilds,
  MatchPlayers,
  MatchSummaryMessages,
  Matches,
  Players,
  Rankings,
  Settings,
  Teams,
  Users,
} from './schema'

// Types for each model, for each type of query.
// The "Update" type of each model is the insert type without primary/foreign keys.

export type SettingSelect = InferSelectModel<typeof Settings>
export type SettingUpdate = Partial<Omit<SettingSelect, 'id'>>

export type UserSelect = InferSelectModel<typeof Users>
export type UserInsert = InferInsertModel<typeof Users>
export type UserUpdate = Partial<Omit<UserInsert, 'id'>>

export type AccessTokenSelect = InferSelectModel<typeof AccessTokens>
export type AccessTokenInsert = InferInsertModel<typeof AccessTokens>
export type AccessTokenUpdate = Partial<Omit<AccessTokenInsert, 'user_id'>>

export type GuildSelect = InferSelectModel<typeof Guilds>
export type GuildInsert = InferInsertModel<typeof Guilds>

export type RankingSelect = InferSelectModel<typeof Rankings>
export type RankingInsert = Omit<InferInsertModel<typeof Rankings>, 'id'>

export type GuildRankingSelect = InferSelectModel<typeof GuildRankings>
export type GuildRankingInsert = InferInsertModel<typeof GuildRankings>

export type PlayerSelect = InferSelectModel<typeof Players>
export type PlayerInsert = InferInsertModel<typeof Players>

export type TeamSelect = InferSelectModel<typeof Teams>
export type TeamInsert = Omit<InferInsertModel<typeof Teams>, 'id'>
export type TeamUpdate = Partial<Omit<TeamInsert, 'ranking_id'>>

export type MatchSelect = InferSelectModel<typeof Matches>
export type MatchInsert = Omit<InferInsertModel<typeof Matches>, 'id'>
export type MatchUpdate = Partial<Omit<MatchInsert, 'ranking_id'>>

export type MatchSummaryMessageSelect = InferSelectModel<typeof MatchSummaryMessages>

export type MatchPlayerSelect = InferSelectModel<typeof MatchPlayers>
export type MatchPlayerInsert = InferInsertModel<typeof MatchPlayers>
