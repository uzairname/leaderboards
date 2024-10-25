import { ViewModule } from '../../../../utils/ViewModule'
import start_match from '../../management/views/commands/start_match'
import challenge_command from './commands/challenge'
import challenge_page from './pages/challenge'
import queue from './pages/queue'

export default new ViewModule([
  queue.dev(),
  start_match.dev(),
  challenge_command,
  challenge_page,
])
