import { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import {
  AccessTokens,
  Guilds,
  Rankings,
  Matches,
  Players,
  Settings,
  Users,
  GuildRankings,
  Teams,
  MatchPlayers,
} from '../schema'

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
export type GuildUpdate = Partial<Omit<GuildInsert, 'id'>>

export type RankingSelect = InferSelectModel<typeof Rankings>
export type RankingInsert = Omit<InferInsertModel<typeof Rankings>, 'id'>
export type RankingUpdate = Partial<RankingInsert>

export type GuildRankingSelect = InferSelectModel<typeof GuildRankings>
export type GuildRankingInsert = InferInsertModel<typeof GuildRankings>
export type GuildRankingUpdate = Partial<Omit<GuildRankingInsert, 'guild_id' | 'ranking_id'>>

export type PlayerSelect = InferSelectModel<typeof Players>
export type PlayerInsert = InferInsertModel<typeof Players>
export type PlayerUpdate = Partial<Omit<PlayerInsert, 'user_id' | 'ranking_id'>>

export type TeamSelect = InferSelectModel<typeof Teams>
export type TeamInsert = Omit<InferInsertModel<typeof Teams>, 'id'>
export type TeamUpdate = Partial<Omit<TeamInsert, 'ranking_id'>>

export type MatchSelect = InferSelectModel<typeof Matches>
export type MatchInsert = Omit<InferInsertModel<typeof Matches>, 'id'>
export type MatchUpdate = Partial<MatchInsert>

export type MatchPlayerSelect = InferSelectModel<typeof MatchPlayers>
