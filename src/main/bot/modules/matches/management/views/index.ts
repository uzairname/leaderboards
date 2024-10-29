import { ViewModule } from '../../../../../app/ViewModule'
import record_match from './commands/record_match'
import settle_match from './commands/settle_match'
import start_match from './commands/start_match'
import manage_match_page from './pages/manage_match'

export default new ViewModule([record_match, start_match, manage_match_page, settle_match])
