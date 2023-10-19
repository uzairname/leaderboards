import { config } from '../../utils/globals'

import { AnyView, isCommandView } from '../../discord/interactions/views/types'
import { respondToDiscordInteraction } from '../../discord/interactions/respond'
import { FindViewCallback } from '../../discord/interactions/views/types'

import { App } from '../app'
import { onInteractionError } from './on_interaction_error'

import help from './views/help'
import leaderboards_command from './views/leaderboards'
import points from './views/points'
import queue from './views/queue'
import restore from './views/restore'
import settings from './views/settings'
import start_match from './views/start_match'
import test from './views/test'
import ping from './views/ping'

export function findView(app: App): FindViewCallback {
  return async (
    command?: { name: string; type: number; guild_id?: string },
    custom_id_prefix?: string,
  ) => {
    const known_views: AnyView[] = getAllViews(app)

    if (custom_id_prefix) {
      var view = known_views.find((view) => view.options.custom_id_prefix === custom_id_prefix)
    } else if (command) {
      view = known_views.find(
        (view) =>
          isCommandView(view) &&
          command.name === view.options.command.name &&
          command.type === view.options.type &&
          command.guild_id === view.options.guild_id,
      )
    }
    return view
  }
}

export function getAllViews(app: App): AnyView[] {
  const default_views: AnyView[] = [
    help(app),
    leaderboards_command(app),
    points(app),
    settings(app),
    restore(app),
  ]

  const experimental_views: AnyView[] = [
    ping(app),
    queue(app),
    start_match(app),
    test(app),
  ]

  let enabled_views = default_views

  if (config.features.EXPERIMENTAL_COMMANDS) {
    enabled_views = enabled_views.concat(experimental_views)
  }

  if (config.features.ALL_COMMANDS_GUILD) {
    enabled_views.forEach((view) => {
      if (isCommandView(view)) {
        view.options.guild_id = config.DEV_GUILD_ID
      }
      return view
    })
  }

  // check for duplicate custom_id_prefixes
  const custom_id_prefixes = enabled_views
    .map((view) => view.options.custom_id_prefix)
    .filter(Boolean)
  if (custom_id_prefixes.length !== new Set(custom_id_prefixes).size) {
    throw new Error(`Duplicate custom id prefixes found in views: ${custom_id_prefixes}`)
  }

  return enabled_views
}

export async function handleInteraction(app: App, request: Request): Promise<Response> {
  return await respondToDiscordInteraction(
    app.bot,
    request,
    findView(app),
    onInteractionError(app),
    false,
  )
}
