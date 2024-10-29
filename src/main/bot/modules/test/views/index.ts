import { ViewModule } from '../../../../app/ViewModule'
import dev from './commands/dev'
import test from './commands/test'

export default new ViewModule([dev.dev(), test])
