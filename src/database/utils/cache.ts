import {
  SettingsManager,
  User,
  Guild,
  Leaderboard,
  GuildLeaderboard,
  LeaderboardDivision,
  Player,
  Match,
} from '../models'

export default class DbCache {
  settings: { [id: number]: SettingsManager } = {}
  users: { [user_id: string]: User } = {}
  guilds: { [guild_id: string]: Guild } = {}
  leaderboards: { [leaderboard_id: number]: Leaderboard } = {}
  guild_leaderboards: { [guild_id: string]: { [leaderboard_id: number]: GuildLeaderboard } } = {}
  leaderboard_divisions: { [id: number]: LeaderboardDivision } = {}
  players: { [user_id: string]: { [division_id: number]: Player } } = {}
  matches: { [match_id: string]: Match } = {}
}
