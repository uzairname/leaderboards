import settings_command from '../modules/admin/views/commands/settings'
import help_command from '../modules/help_command'
import leaderboard_command from '../modules/leaderboard/commands/leaderboard'
import matches_module from '../modules/matches/logging/views'
import matchmaking_module from '../modules/matches/matchmaking/views'
import ongoing_series_module from '../modules/matches/ongoing-series/views'
import players_module from '../modules/players/views'
import rankings_module from '../modules/rankings/views'
import test_module from '../modules/test/views/commands/test_command'
import util_module from '../modules/utils/views'
import { ViewModule } from '../utils/ViewModule'

export default new ViewModule([
  rankings_module,
  matches_module,
  matchmaking_module,
  util_module,
  help_command,
  players_module,
  leaderboard_command,
  settings_command,
  test_module,
  ongoing_series_module,
])
