import { ViewModule } from '../../../../../app/ViewModule'
import manage_match_command from './commands/manage_match'
import record_match_command from './commands/record_match'
import start_match from './commands/start_match'
import manage_match_page from './pages/manage_match'

export default new ViewModule([
  record_match_command,
  start_match,
  manage_match_page,
  manage_match_command,
])
