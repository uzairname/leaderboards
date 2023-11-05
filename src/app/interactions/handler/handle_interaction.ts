import { respondToDiscordInteraction } from '../../../discord'
import { App } from '../../app'
import { findView } from './view_manager'
import { onViewError } from './on_view_error'

export function handleDiscordinteraction(app: App, request: Request) {
  return respondToDiscordInteraction(app.bot, request, findView(app), onViewError(app), false)
}
