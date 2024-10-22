import { overwriteDiscordCommandsWithViews } from '../../../discord-framework'
import type { App } from '../../context/app_context'
import views from './all_views'

export async function syncDiscordCommands(app: App, guild_id?: string) {
  await overwriteDiscordCommandsWithViews(
    app.bot,
    await views.getAllCommandSignatures(app, guild_id),
    guild_id,
  )
}
