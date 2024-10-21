import { ViewModule } from '../../../../utils/view_module'
import match_history_command from './commands/match_history_command'
import match_view from './pages/match_view'
import matches_view from './pages/matches_view'

export default new ViewModule([matches_view, match_view, match_history_command])
