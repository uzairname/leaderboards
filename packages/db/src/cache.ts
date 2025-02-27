import { CacheMap } from '../../utils/src/CacheMap'
import { DbLogger } from './logging'
import { Guild, GuildRanking, Match, Player, Ranking, Setting, Team, User } from './models'
import { MatchPlayer } from './models/matches'

// prettier-ignore
export default class DbCache {

  private maps: CacheMap<any, any, any>[] = []
  constructor(private logger?: DbLogger) {}

  setting: Setting | undefined = undefined
  users = this.newMap<string, User>('user')
  guilds = this.newMap<string, Guild>('guild')
  rankings = this.newMap<number, Ranking>('ranking')
  guild_rankings = this.newMap<string, GuildRanking, number>('guild ranking')
  guild_rankings_by_guild = this.newMap<string, { guild_ranking: GuildRanking; ranking: Ranking }[]>('guild rankings in guild')
  guild_rankings_by_ranking = this.newMap<number, { guild_ranking: GuildRanking; guild: Guild }[]>('guild rankings for ranking')
  players = this.newMap<number, Player>('player')
  players_by_ranking_user = this.newMap<number, Player, string>('player')
  match_players = this.newMap<number, MatchPlayer[][]>('players for match')
  matches = this.newMap<number, Match>('match')
  teams = this.newMap<number, Team>('team')
  others = this.newMap<string, any>('other')

  clear() {
    this.setting = undefined
    this.maps.forEach((map) => map.clear())
  }

  private newMap<K, V, K2 extends string | number | undefined = undefined>(name?: string): CacheMap<K, V, K2> {
    const map = new CacheMap<K, V, K2>(name, (msg) => {
      this.logger?.debug(msg)
    })
    this.maps.push(map)
    return map
  }

  toString() {
    return this.maps.map((map) => map.toString()).join('\n')
  } 
}
