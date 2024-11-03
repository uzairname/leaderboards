import { ViewModule } from '../../app/ViewModule'
import settings from './admin/views/commands/settings'
import helpCmd from './help/help-command'
import leaderboardCmd from './leaderboard/commands/leaderboard'
import matchesCmd from './matches/logging/views/commands/matches'
import matches from './matches/logging/views/pages/matches'
import recordMatch from './matches/management/views/commands/record-match'
import settleMatch from './matches/management/views/commands/settle-match'
import startMatch from './matches/management/views/commands/start-match'
import manageMatch from './matches/management/views/pages/manage-match'
import challengeCmd from './matches/matchmaking/views/commands/challenge'
import { joinQueueCmd, leaveQueueCmd } from './matches/matchmaking/views/commands/queue'
import challenge from './matches/matchmaking/views/pages/challenge'
import queue from './matches/matchmaking/views/pages/queue'
import ongoing_match from './matches/ongoing-math-thread/views/pages/ongoing-match'
import coinflip from './misc-commands/coinflip'
import disable from './players/commands/disable'
// import points from './players/views/commands/points'
import profileCmd from './players/views/commands/profile'
import profile from './players/views/pages/profile'
import createRanking from './rankings/views/commands/create-ranking'
import rankingsCmd from './rankings/views/commands/rankings'
import rankingSettings from './rankings/views/pages/ranking-settings'
import rankings from './rankings/views/pages/rankings'
import dev from './test/views/commands/dev'
import test from './test/views/commands/test'
import testHelper from './test/views/commands/test-helper'
import selectChannel from './utils/views/pages/select-channel'

export default new ViewModule([
  helpCmd,
  new ViewModule([settings]),
  new ViewModule([rankingsCmd, rankings, createRanking, rankingSettings]),
  leaderboardCmd,
  new ViewModule([recordMatch.dev(), startMatch, manageMatch, settleMatch]),
  new ViewModule([disable]),
  new ViewModule([queue.dev(), challengeCmd, challenge, joinQueueCmd, leaveQueueCmd]),
  new ViewModule([ongoing_match]),
  new ViewModule([profileCmd, profile]),
  new ViewModule([matches, matchesCmd]),
  new ViewModule([dev.dev(), test, testHelper.dev()]),
  selectChannel,
  coinflip,
])
