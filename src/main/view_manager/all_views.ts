import { help } from '../modules/help_command'
import { leaderboard } from '../modules/leaderboard/leaderboard_command'
import { matches_module } from '../modules/matches/match_logging/matches_view'
import { rankings } from '../modules/rankings/rankings_commands/rankings_cmd'
import { record_match } from '../modules/record_match/record_match_command'
import { settings } from '../modules/settings'
import { stats_module } from '../modules/stats'
import { test_module } from '../modules/test_command'
import { utility_views } from '../helpers/select_channel'
import { queue_module } from '../modules/matches/queue/queue_view'
import { CustomView } from './view_module'

export const all_views: CustomView[] = [
  utility_views,
  test_module,
  help,
  rankings,
  settings,
  record_match,
  queue_module,
  leaderboard,
  matches_module,
  stats_module,
].flat()
