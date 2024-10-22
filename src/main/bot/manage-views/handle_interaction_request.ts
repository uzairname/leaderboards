import { respondToInteraction } from '../../../discord-framework'
import type { App } from '../../context/app_context'
import views from './all_views'
import { onViewError } from './on_view_error'

const direct_response_in_dev = true

export async function handleInteractionRequest(app: App, request: Request) {
  return respondToInteraction(
    app.bot,
    request,
    views.getFindViewCallback(app),
    onViewError(app),
    app.config.features.IsDev ? direct_response_in_dev : true,
  )
}
