import { isCommandView, overwriteDiscordCommandsWithViews } from '../../discord-framework'
import { getAppRoleConnectionsMetadata } from '../modules/linked_roles'
import { App } from './app'
import { getAllViews } from './find_view'

export async function initApp(app: App): Promise<Response> {
  await overwriteDiscordCommandsWithViews(app.bot, getAllViews(app).filter(isCommandView))
  await app.bot.updateRoleConnectionsMetadata(getAppRoleConnectionsMetadata(app))
  await app.db.settings.getOrUpdate({ last_deployed: new Date() })
  return new Response('Successfully deployed Leaderboards app', { status: 200 })
}
