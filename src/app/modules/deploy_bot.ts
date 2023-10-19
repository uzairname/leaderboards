import { overwriteDiscordCommandsWithViews } from '../../discord/interactions/set_commands'
import { isCommandView } from '../../discord/interactions/types'

import { App } from '../app'

import { getAllViews } from '../interactions/all_views'
import { getAppRoleConnectionsMetadata } from './linked_roles'

export async function deployBot(app: App) {
  await overwriteDiscordCommandsWithViews(app.bot, getAllViews(app).filter(isCommandView))
  await app.bot.updateRoleConnectionsMetadata(getAppRoleConnectionsMetadata())
  await app.db.settings.getOrUpdate({ last_deployed: new Date() })
}
