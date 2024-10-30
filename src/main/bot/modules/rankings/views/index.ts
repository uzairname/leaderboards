import { ViewModule } from '../../../../app/ViewModule'
import create_ranking_command from './commands/create_ranking'
import all_rankings_command from './commands/rankings'
import ranking_settings_page from './pages/ranking_settings'
import create_ranking_page from './pages/rankings'

export default new ViewModule([
  all_rankings_command,
  create_ranking_command,
  create_ranking_page,
  ranking_settings_page,
])
