import { User, Guild, Ranking, GuildRanking, Player, Match, Setting, Team } from './models'

export default class DbCache {
  setting: Setting | undefined
  users: { [user_id: string]: User } = {}
  guilds: { [guild_id: string]: Guild } = {}
  rankings: { [ranking_id: number]: Ranking } = {}
  guild_rankings: { [guild_id: string]: { [ranking_id: number]: GuildRanking } } = {}
  players: { [ranking_id: number]: { [user_id: string]: Player } } = {}
  players_by_id: { [player_id: string]: Player } = {}
  matches: { [match_id: string]: Match } = {}
  teams: { [team_id: number]: Team } = {}
}
