import { overwriteDiscordCommandsWithViews, isCommandView } from '../../discord-framework'

import { App } from '../app'

import { getAllViews } from '../interactions/find_view'
import { getAppRoleConnectionsMetadata } from './linked_roles'

export async function deployApp(app: App) {
  await overwriteDiscordCommandsWithViews(app.bot, getAllViews(app).filter(isCommandView))
  await app.bot.updateRoleConnectionsMetadata(getAppRoleConnectionsMetadata(app))
  await app.db.settings.getOrUpdate({ last_deployed: new Date() })
}
