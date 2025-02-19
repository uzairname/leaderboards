import { ViewModule } from './ViewModule'
import settings from './admin/views/commands/settings-cmd'
import helpCmd from './help/help-cmd'
import leaderboardCmd from './leaderboard/views/leaderboard-cmd'
import matchesCmd from './matches/logging/views/matches-cmd'
import matchesPage from './matches/logging/views/matches-page'
import recordMatchCmd from './matches/management/views/commands/record-match-cmd'
import settleMatchCmd from './matches/management/views/commands/settle-match-cmd'
import startMatchCmd from './matches/management/views/commands/start-match-cmd'
import manageMatchPage from './matches/management/views/pages/manage-match-page'
import challengeCmd from './matches/matchmaking/challenge/challenge-cmd'
import challengePage from './matches/matchmaking/challenge/challenge-page'
import joinqCmd from './matches/matchmaking/queue/views/join-cmd'
import leaveqCmd from './matches/matchmaking/queue/views/leave-cmd'
import queuePage from './matches/matchmaking/queue/views/queue-page'
import ongoingMatchPage from './matches/ongoing-math-thread/views/pages/ongoing-match-page'
import coinflipCmd from './misc-commands/coinflip-cmd'
import banCmd from './players/views/ban'
import profileCmd from './players/views/profile-cmd'
import profilePage from './players/views/profile-page'
import createRankingCmd from './rankings/views/commands/create-ranking-cmd'
import rankingsCmd from './rankings/views/commands/rankings-cmd'
import allRankingsPage from './rankings/views/pages/all-rankings-page'
import rankingSettingsPage from './rankings/views/pages/ranking-settings-page'
import devCmd from './test/views/dev-cmd'
import testCmd from './test/views/test-cmd'
import testHelperPage from './test/views/test-helper-page'
import selectChannel from './utils/views/select-channel-page'

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
  new ViewModule([banCmd]),
  // leaderboard, matches, and stats
  new ViewModule([leaderboardCmd, matchesPage, matchesCmd, profileCmd, profilePage]),
  // ongoing matches
  new ViewModule([ongoingMatchPage]),
  // matchmaking
  new ViewModule([queuePage.dev(), challengeCmd, challengePage, joinqCmd, leaveqCmd]),
  // experimental
  new ViewModule([devCmd.dev(), testCmd.dev(), testHelperPage.dev()]),
  // misc
  coinflipCmd,
  // utility
  selectChannel,
])
