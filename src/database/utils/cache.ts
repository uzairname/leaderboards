import { SettingsManager, User, Guild, Ranking, GuildRanking, Player, Match } from '../models'

export default class DbCache {
  settings: { [id: number]: SettingsManager } = {}
  users: { [user_id: string]: User } = {}
  guilds: { [guild_id: string]: Guild } = {}
  rankings: { [ranking_id: number]: Ranking } = {}
  guild_rankings: { [guild_id: string]: { [ranking_id: number]: GuildRanking } } = {}
  players: { [user_id: string]: { [ranking_id: number]: Player } } = {}
  matches: { [match_id: string]: Match } = {}
}
