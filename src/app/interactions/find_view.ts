import { AnyView, isCommandView, FindViewCallback } from '../../discord-framework'

import { App } from '../app'

import help from './views/help'
import rankings from './views/rankings'
import points from './views/points'
import restore from './views/restore'
import settings from './views/settings'
import record_match from './views/record_match'
import start_match from './views/start_match'
import queue from './views/queue'
import test from './views/test_command'
import temp from './views/temp_command'

export function getAllViews(app: App): AnyView[] {
  let enabled_views: AnyView[] = [
    help(app), 
    rankings(app),
    points(app), 
    record_match(app),
    restore(app),
  ] // prettier-ignore

  const experimental_views: AnyView[] = [
    settings(app),
    start_match(app),
    queue(app),
    test(app),
    temp(app),
  ] // prettier-ignore

  if (app.config.features.EXPERIMENTAL_VIEWS) {
    enabled_views = enabled_views.concat(experimental_views)
  }

  if (app.config.features.ALL_COMMANDS_GUILD) {
    enabled_views.filter(isCommandView).forEach((view) => {
      view.options.guild_id = app.config.DEV_GUILD_ID
    })
  }

  // check for duplicate custom_id_prefixes
  const custom_id_prefixes = enabled_views.filter((view) => !!view.options.custom_id_prefix)

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
