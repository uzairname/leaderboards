import {
  AnyView,
  isCommandView,
  FindViewCallback,
  overwriteDiscordCommandsWithViews,
} from '../../../discord'

import { App } from '../../app'

import help from '../commands/help'
import rankings_command from '../commands/rankings'
import points from '../commands/points'
import queue from '../message_views/queue'
import restore from '../commands/restore'
import settings from '../commands/settings'
import start_match from '../commands/start_match'
import test from '../commands/test'

export function getAllViews(app: App): AnyView[] {
  const default_views: AnyView[] = [
    help(app),
    rankings_command(app),
    points(app),
    settings(app),
    restore(app),
  ]

  const experimental_views: AnyView[] = [queue(app), start_match(app), test(app)]

  let enabled_views = default_views

  if (app.config.features.EXPERIMENTAL_COMMANDS) {
    enabled_views = enabled_views.concat(experimental_views)
  }

  if (app.config.features.ALL_COMMANDS_GUILD) {
    enabled_views.forEach((view) => {
      if (isCommandView(view)) {
        view.options.guild_id = app.config.DEV_GUILD_ID
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

export async function syncDiscordCommands(app: App) {
  await overwriteDiscordCommandsWithViews(app.bot, getAllViews(app).filter(isCommandView))
}
