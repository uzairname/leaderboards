import { settingsCmd } from '../../views/commands/settings'
import { statsCmd } from '../../views/commands/stats'
import { helperView, testCommand } from '../../views/commands/test_command'
import { selectChannelView } from '../../views/helpers/select_channel'
import { queueView } from '../../views/messages/queue'
import { helpCmd } from '../help_command'
import { leaderboardCmdCallback, leaderboardCmdDef } from '../leaderboard/leaderboard_command'
import { matchView } from '../match_logging/match_view'
import { matchesCmdCallback, matchesCommandDef } from '../match_logging/matches_command'
import { matchesView } from '../match_logging/matches_view'
import { createRankingCmd, createRankingView } from '../rankings_commands/create_ranking'
import { rankingSettingsView } from '../rankings_commands/ranking_settings'
import { rankingsCmdCallback, rankingsCommandDef } from '../rankings_commands/rankings_cmd'
import { recordMatchCmdCallback, recordMatchCmdDef } from '../record_match_command'
import { globalView, guildCommand } from './view_module'

export const all_views = [
  // help
  globalView(helpCmd),

  // rankings
  guildCommand(rankingsCmdCallback, rankingsCommandDef),
  globalView(createRankingCmd),
  globalView(createRankingView),
  globalView(rankingSettingsView),

  // settings
  globalView(settingsCmd),

  // stats
  globalView(statsCmd),

  // matches
  guildCommand(matchesCmdCallback, matchesCommandDef),
  globalView(matchesView),
  globalView(matchView),

  // leaderboard
  guildCommand(leaderboardCmdCallback, leaderboardCmdDef),

  // record match
  guildCommand(recordMatchCmdCallback, recordMatchCmdDef),

  // queue
  globalView(queueView, true),

  // test
  globalView(testCommand, true),
  globalView(helperView, true),

  // utility
  globalView(selectChannelView),
]
