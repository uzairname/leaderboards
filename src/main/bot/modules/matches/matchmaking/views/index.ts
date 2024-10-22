import { ViewModule } from '../../../../utils/ViewModule'
import challenge_command from './commands/challenge'
import start_match from './commands/start_match'
import challenge_page from './pages/challenge'
import queue_view from './pages/queue_view'

export default new ViewModule([
  queue_view.experimental(),
  start_match.experimental(),
  challenge_command.experimental(),
  challenge_page.experimental(),
])
