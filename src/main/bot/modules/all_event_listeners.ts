import leaderboard from './leaderboard/listeners'
import match_logging from './matches/logging/listeners'
import match_management from './matches/management/listeners'
import rankings from './rankings/listeners'

export default [leaderboard, rankings, match_management, match_logging]
