import { overwriteDiscordCommandsWithViews, isCommandView } from '../../discord-framework'

import { App } from './app'

import { getAllViews } from './find_view'
import { getAppRoleConnectionsMetadata } from '../modules/linked_roles'

export async function deployApp(app: App) {
  await overwriteDiscordCommandsWithViews(app.bot, getAllViews(app).filter(isCommandView))
  await app.bot.updateRoleConnectionsMetadata(getAppRoleConnectionsMetadata(app))
  await app.db.settings.getOrUpdate({ last_deployed: new Date() })
}
