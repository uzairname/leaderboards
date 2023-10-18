import { overwriteDiscordCommandsWithViews } from '../../discord/interactions/views/set_commands'
import { isCommandView } from '../../discord/interactions/views/types'

import { App } from '../app'

import { getAllViews } from '../views/all_views'
import { getAppRoleConnectionsMetadata } from './linked_roles'

export async function deployBot(app: App) {
  await overwriteDiscordCommandsWithViews(app.bot, getAllViews(app).filter(isCommandView))
  await app.bot.updateRoleConnectionsMetadata(getAppRoleConnectionsMetadata())
  await app.db.settings.getOrUpdate({ last_deployed: new Date() })
}
