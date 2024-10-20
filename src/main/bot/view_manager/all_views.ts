import { helper_views } from '../components/select_channel'
import { help_view } from '../modules/help_command'
import { leaderboard } from '../modules/leaderboard/leaderboard_command'
import { matches_module } from '../modules/matches/match_logging/matches_view'
import { queue_view } from '../modules/matches/queue/queue_view'
import { record_match_view } from '../modules/matches/record_match_command'
import { manage_rankings_module } from '../modules/rankings/rankings_commands/rankings_cmd'
import { settings_command } from '../modules/settings'
import { stats_command } from '../modules/stats'
import { test_module } from '../modules/test_command'
import { CustomView } from './view_module'

export const all_views: CustomView[] = [
  manage_rankings_module,
  help_view,
  stats_command,
  leaderboard,
  settings_command,
  matches_module,
  queue_view,
  helper_views,
  test_module,
  record_match_view,
].flat()
