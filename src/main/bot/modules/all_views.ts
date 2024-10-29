import { ViewModule } from '../../app/ViewModule'
import settings_module from './admin/views/'
import help_command from './help/help_command'
import leaderboard_command from './leaderboard/commands/leaderboard'
import matches_module from './matches/logging/views'
import match_management_module from './matches/management/views'
import matchmaking_module from './matches/matchmaking/views'
import ongoing_series_module from './matches/ongoing-series/views'
import players_module from './players/views'
import rankings_module from './rankings/views'
import test_module from './test/views/'
import util_module from './utils/views'

export default new ViewModule([
  rankings_module,
  matches_module,
  matchmaking_module,
  match_management_module,
  util_module,
  help_command,
  players_module,
  leaderboard_command,
  settings_module,
  test_module,
  ongoing_series_module,
])
