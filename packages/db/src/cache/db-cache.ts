import { DbObject } from '../classes'
import { DbClient } from '../client'
import { DbLogger } from '../logging'
import {
  Guild,
  GuildRanking,
  GuildRankingSelect,
  GuildSelect,
  Match,
  Player,
  Ranking,
  RankingSelect,
  Setting,
  Team,
  User,
  UserPlayer,
} from '../models'
import { MatchPlayer } from '../models/matches'
import { GenericCacheMap } from './cache-map'

let cache: DbCache | undefined = undefined

const DEFAULT_TTL_MS = 1000 * 30 // 30 second

/**
 * 
 */
export class DbCache {
  private cache_maps: GenericCacheMap<any, any, any>[] = []

  /**
   * Create a new DbCache instance.
   * This should only be called once, use getInstance to retrieve the singleton.
   */
  private constructor(
    private db: DbClient,
    public logger?: DbLogger,
  ) {
    logger?.debug('DbCache constructor called')
  }

  /**
   * Get the singleton instance of DbCache, creating it if it doesn't exist.
   * Always updates the db client reference to the latest one to ensure
   * the database connection isn't reused from a previous instance.
   */
  static getInstance(db: DbClient, logger?: DbLogger): DbCache {
    if (!cache) {
      cache = new DbCache(db, logger)
      logger?.debug('DB cache initialized')
    } else {
      cache.db = db // Update the db client reference
    }
    return cache
  }

  setting: Setting | undefined = undefined
  users = this.dbObjectCache<User, string>('user', User)
  guilds = this.dbObjectCache<Guild, string>('guild', Guild)
  rankings = this.dbObjectCache<Ranking, number>('ranking', Ranking)
  guild_rankings = this.dbObjectCache<GuildRanking, string, number>('guild ranking', GuildRanking)
  guild_rankings_by_guild = this.makeCache<
    { guild_ranking: GuildRankingSelect; ranking: RankingSelect }[],
    { guild_ranking: GuildRanking; ranking: Ranking }[],
    string
  >({
    name: 'guild rankings in guild',
    serialize: data =>
      data.map(item => ({
        guild_ranking: item.guild_ranking.data,
        ranking: item.ranking.data,
      })),
    deserialize: data =>
      data.map(item => ({
        guild_ranking: new GuildRanking(item.guild_ranking, this.db),
        ranking: new Ranking(item.ranking, this.db),
      })),
  })
  guild_rankings_by_ranking = this.makeCache<
    { guild_ranking: GuildRankingSelect; guild: GuildSelect }[],
    { guild_ranking: GuildRanking; guild: Guild }[],
    number
  >({
    name: 'guild rankings with ranking',
    serialize: data =>
      data.map(item => ({
        guild_ranking: item.guild_ranking.data,
        guild: item.guild.data,
      })),
    deserialize: data =>
      data.map(item => ({
        guild_ranking: new GuildRanking(item.guild_ranking, this.db),
        guild: new Guild(item.guild, this.db),
      })),
  })
  players = this.dbObjectCache<Player, number>('player', Player)
  players_by_ranking_user = this.dbObjectCache<UserPlayer, number, string>('players by ranking user', UserPlayer)
  match_players = this.simpleCache<MatchPlayer[][], number>('players for match')
  matches = this.dbObjectCache<Match, number>('match', Match)
  teams = this.dbObjectCache<Team, number>('team', Team)
  others = this.simpleCache<unknown, string>('other')

  private makeCache<SerializedT, DeserializedT, K, K2 extends string | number | undefined = never>(options: {
    name: string
    serialize: (data: DeserializedT) => SerializedT
    deserialize: (data: SerializedT) => DeserializedT
  }): GenericCacheMap<SerializedT, DeserializedT, K, K2> {
    const { name, serialize, deserialize } = options

    const cache = new GenericCacheMap<SerializedT, DeserializedT, K, K2>(name, serialize, deserialize, msg => {
      this.logger?.debug(msg)
    }, DEFAULT_TTL_MS)
    this.cache_maps.push(cache)
    return cache
  }

  private simpleCache<T, K, K2 extends string | number | undefined = never>(name: string) {
    return this.makeCache<T, T, K, K2>({
      name,
      serialize: (data: T): T => data,
      deserialize: (data: T): T => data,
    })
  }

  /**
   * Create a typed cache with the given name and constructor
   */
  private dbObjectCache<V extends DbObject<unknown>, K, K2 extends string | number | undefined = never>(
    name: string,
    constructor: new (data: V['data'], db: DbClient) => V,
  ): GenericCacheMap<V['data'], V, K, K2> {
    return this.makeCache<V['data'], V, K, K2>({
      name,
      serialize: obj => obj.data,
      deserialize: data => new constructor(data, this.db),
    })
  }

  /**
   * Clear all caches
   */
  clear() {
    this.setting = undefined
    this.cache_maps.forEach(map => map.clear())
  }

  /**
   * Get cache statistics for all typed caches
   */
  getStats() {
    return this.cache_maps.map(cache => cache.getStats())
  }


  toString() {
    return this.cache_maps.map(cache => cache.getStats()).join('\n')
  }
}
