import { CacheMap } from '../utils/CacheMap'
import { Guild, GuildRanking, Match, Player, Ranking, Setting, Team, User } from './models'
import { MatchPlayer } from './models/matches'

// prettier-ignore
export default class DbCache {
  setting: Setting | undefined = undefined
  users = new CacheMap<string, User>('user')
  guilds = new CacheMap<string, Guild>('guild')
  rankings = new CacheMap<number, Ranking>('ranking')
  guild_rankings = new CacheMap<string, GuildRanking, number>('guild ranking')
  guild_rankings_by_guild = new CacheMap<string, { guild_ranking: GuildRanking; ranking: Ranking }[]>('guild rankings in guild')
  guild_rankings_by_ranking = new CacheMap<number, { guild_ranking: GuildRanking; guild: Guild }[]>('guild rankings for ranking')
  players = new CacheMap<number, Player>('player')
  players_by_ranking_user = new CacheMap<number, Player, string>('player')
  match_players = new CacheMap<number, MatchPlayer[][]>('players for match')
  matches = new CacheMap<number, Match>('match')
  teams = new CacheMap<number, Team>('team')

  clear() {
    this.setting = undefined
    this.users.clear()
    this.guilds.clear()
    this.rankings.clear()
    this.guild_rankings.clear()
    this.guild_rankings_by_guild.clear()
    this.players.clear()
    this.players_by_ranking_user.clear()
    this.match_players.clear()
    this.matches.clear()
    this.teams.clear()
  }
}
