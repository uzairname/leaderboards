import { App } from '../app'
import { syncDiscordCommands } from '../interactions/handler/view_manager'
import { syncAppRoleConnectionsMetadata } from './linked_roles'

export async function deployBot(app: App) {
  await syncDiscordCommands(app)
  await syncAppRoleConnectionsMetadata(app)
  await app.db.settings.getOrUpdate({ last_deployed: new Date() })
}
