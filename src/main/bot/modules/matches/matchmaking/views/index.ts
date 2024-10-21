import { ViewModule } from '../../../../utils/view_module'
import challenge from './commands/challenge'
import start_match from './commands/start_match'
import queue_view from './pages/queue_view'

export default new ViewModule([
  queue_view.experimental(),
  start_match.experimental(),
  challenge.experimental(),
])
