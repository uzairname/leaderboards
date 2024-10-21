import { overwriteDiscordCommandsWithViews, respondToInteraction } from '../../../discord-framework'
import type { App } from '../../context/app_context'
import views from './all_views'
import { onViewError } from './on_view_error'

export async function handleInteractionRequest(app: App, request: Request) {
  return respondToInteraction(app.bot, request, views.getFindViewCallback(app), onViewError(app))
}

export async function syncDiscordCommands(app: App, guild_id?: string) {
  await overwriteDiscordCommandsWithViews(
    app.bot,
    await views.getAllCommandSignatures(app, guild_id),
    guild_id,
  )
}
