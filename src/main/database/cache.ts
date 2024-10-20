import { Guild, GuildRanking, Match, Player, Ranking, Setting, Team, User } from './models'

export default class DbCache {
  setting: Setting | undefined
  users: { [id: string]: User } = {}
  guilds: { [id: string]: Guild } = {}
  rankings: { [id: number]: Ranking } = {}
  guild_rankings: { [guild_id: string]: { [ranking_id: number]: GuildRanking } } = {}
  players: { [ranking_id: number]: { [user_id: string]: Player } } = {}
  players_by_id: { [id: string]: Player } = {}
  matches: { [id: string]: Match } = {}
  teams: { [id: number]: Team } = {}
}
