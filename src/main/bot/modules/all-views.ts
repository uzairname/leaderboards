import { ViewModule } from '../../app/ViewModule'
import settings from './admin/views/commands/settings'
import helpCmd from './help/help-command'
import leaderboardCmd from './leaderboard/views/leaderboard-cmd'
import matchesCmd from './matches/logging/views/matches-cmd'
import matchesPage from './matches/logging/views/matches-page'
import recordMatchCmd from './matches/management/views/commands/record-match-cmd'
import settleMatchCmd from './matches/management/views/commands/settle-match-cmd'
import startMatchCmd from './matches/management/views/commands/start-match'
import manageMatchPage from './matches/management/views/pages/manage-match'
import challengePage from './matches/matchmaking/challenge/challenge'
import challengeCmd from './matches/matchmaking/challenge/challenge-cmd'
import joinqCmd from './matches/matchmaking/queue/views/join-cmd'
import leaveqCmd from './matches/matchmaking/queue/views/leave-cmd'
import queuePage from './matches/matchmaking/queue/views/queue-page'
import ongoingMatchPage from './matches/ongoing-math-thread/views/pages/ongoing-match'
import coinflip from './misc-commands/coinflip'
import disable from './players/views/ban'
import profileCmd from './players/views/profile-cmd'
import profilePage from './players/views/profile-page'
import createRankingCmd from './rankings/views/commands/create-ranking'
import rankingsCmd from './rankings/views/commands/rankings-cmd'
import allRankingsPage from './rankings/views/pages/all-rankings-page'
import rankingSettingsPage from './rankings/views/pages/ranking-settings-page'
import dev from './test/views/dev-cmd'
import test from './test/views/test-cmd'
import testHelper from './test/views/test-helper'
import selectChannel from './utils/views/pages/select-channel'

export default new ViewModule([
  // help
  helpCmd,
  // settings
  new ViewModule([settings]),
  // ranking settings
  new ViewModule([rankingsCmd, allRankingsPage, createRankingCmd, rankingSettingsPage]),
  // match management
  new ViewModule([recordMatchCmd.dev(), startMatchCmd, manageMatchPage, settleMatchCmd]),
  // player management
  new ViewModule([disable]),
  // leaderboard, matches, and stats
  new ViewModule([leaderboardCmd, matchesPage, matchesCmd, profileCmd, profilePage]),
  // ongoing matches
  new ViewModule([ongoingMatchPage]),
  // matchmaking
  new ViewModule([queuePage.dev(), challengeCmd, challengePage, joinqCmd, leaveqCmd]),
  // experimental
  new ViewModule([dev.dev(), test.dev(), testHelper.dev()]),
  // misc
  coinflip,
  // utility
  selectChannel,
])
