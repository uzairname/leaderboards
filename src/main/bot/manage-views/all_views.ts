import settings_command from '../modules/admin/views/commands/settings'
import test_module from '../modules/experimental/views/commands/test_command'
import help_command from '../modules/help_command'
import leaderboard_command from '../modules/leaderboard/commands/leaderboard'
import match_history_module from '../modules/matches/logging/views'
import matchmaking_module from '../modules/matches/matchmaking/views'
import record_match_command from '../modules/matches/recording/views/commands/record_match_command'
import stats_command from '../modules/players/views/commands/stats'
import rankings_module from '../modules/rankings/views'
import util_views from '../modules/utils/views'
import { ViewModule } from '../utils/view_module'

export default new ViewModule([
  rankings_module,
  match_history_module,
  matchmaking_module,
  util_views,
  help_command,
  stats_command,
  leaderboard_command,
  settings_command,
  test_module,
  record_match_command,
])
