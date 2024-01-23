import { settings } from '../../views/commands/settings'
import { test_module } from '../../views/commands/test_command'
import { utility_views } from '../../views/helpers/select_channel'
import { queue_module } from '../../views/messages/queue'
import { help } from '../help_command'
import { leaderboard } from '../leaderboard/leaderboard_command'
import { rankings } from '../rankings/rankings_commands/rankings_cmd'
import { record_match } from '../record_match/record_match_command'
import type { ViewModule } from './view_module'

export const all_modules: ViewModule[] = [
  help,
  rankings,

  settings,
  utility_views,

  record_match,
  leaderboard,
  test_module,

  queue_module,
]

export const all_views = all_modules.flatMap(m => m.views)
