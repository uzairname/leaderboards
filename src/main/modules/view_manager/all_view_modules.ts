import { settings } from '../../views/commands/settings'
import { stats_module } from '../../views/commands/stats'
import { test_module } from '../../views/commands/test_command'
import { utility_views } from '../../views/helpers/select_channel'
import { queue_module } from '../../views/messages/queue'
import { help } from '../help_command'
import { leaderboard } from '../leaderboard/leaderboard_command'
import { matches_module } from '../matches/match_logging/matches_view'
import { rankings } from '../rankings/rankings_commands/rankings_cmd'
import { record_match } from '../record_match/record_match_command'
import type { ViewModule } from './view_module'

const all_modules: ViewModule[] = [
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
]

export const all_views = all_modules.flatMap(m => m.views)
