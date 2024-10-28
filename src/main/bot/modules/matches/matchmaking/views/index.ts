import { ViewModule } from '../../../../../app/ViewModule'
import challenge_command from './commands/challenge'
import challenge_page from './pages/challenge'
import queue from './pages/queue'

export default new ViewModule([queue.dev(), challenge_command, challenge_page])
