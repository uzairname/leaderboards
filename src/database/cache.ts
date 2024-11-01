import { Guild, GuildRanking, Match, Player, Ranking, Setting, Team, User } from './models'
import { MatchPlayer } from './models/matches'

export default class DbCache {
  setting: Setting | undefined
  users: { [id: string]: User } = {}
  guilds: { [id: string]: Guild } = {}
  rankings: { [id: number]: Ranking } = {}
  guild_rankings: { [guild_id: string]: { [ranking_id: number]: GuildRanking } } = {}
  guild_guild_rankings: {
    [guild_id: string]: { ranking: Ranking; guild_ranking: GuildRanking }[]
  } = {}
  players: { [ranking_id: number]: { [user_id: string]: Player } } = {}
  players_by_id: { [id: string]: Player } = {}
  match_team_players: { [match_id: string]: MatchPlayer[][] } = {}
  matches: { [id: string]: Match } = {}
  teams: { [id: number]: Team } = {}

  clear() {
    this.setting = undefined
    this.users = {}
    this.guilds = {}
    this.rankings = {}
    this.guild_rankings = {}
    this.guild_guild_rankings = {}
    this.players = {}
    this.players_by_id = {}
    this.match_team_players = {}
    this.matches = {}
    this.teams = {}
  }
}
