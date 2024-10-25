import { ViewModule } from '../../../utils/ViewModule'
import points_command from './commands/points'
import profile_command from './commands/profile'

export default new ViewModule([
  profile_command.dev(), 
  points_command.dev()
])
