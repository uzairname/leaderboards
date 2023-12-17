import { isCommandView, overwriteDiscordCommandsWithViews } from '../../discord-framework'
import { getAppRoleConnectionsMetadata } from '../modules/linked_roles'
import { App } from './app'
import { getAllViews } from './find_view'

export async function deployApp(app: App) {
  await overwriteDiscordCommandsWithViews(app.bot, getAllViews(app).filter(isCommandView))
  await app.bot.updateRoleConnectionsMetadata(getAppRoleConnectionsMetadata(app))
  await app.db.settings.getOrUpdate({ last_deployed: new Date() })
}
