import { ViewModule } from '../../../../../app/ViewModule'
import matches_command from './commands/matches'
import matches_page from './pages/matches'

export default new ViewModule([matches_page, matches_command])
