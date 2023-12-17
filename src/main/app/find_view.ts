import { AnyView, FindViewCallback, isCommandView } from '../../discord-framework'
import { helpCmd } from '../views/commands/help'
import points from '../views/commands/points'
import { ranking_settings_page } from '../views/commands/rankings/ranking_settings'
import { rankings_cmd } from '../views/commands/rankings/rankings'
import { record_match_cmd } from '../views/commands/record_match'
import { restoreCmd } from '../views/commands/restore'
import { settingsCmd } from '../views/commands/settings'
import { startMatch } from '../views/commands/start_match'
import temp from '../views/commands/temp_command'
import test from '../views/commands/test_command'
import queue from '../views/messages/queue'
import { App } from './app'

export function getAllViews(app: App): AnyView[] {
  let enabled_views: (AnyView)[] = [
    helpCmd(app), 
    [rankings_cmd(app), ranking_settings_page(app)],
    record_match_cmd(app),
    settingsCmd(app),
  ].flat() // prettier-ignore

  const experimental_views: (AnyView)[] = [
    startMatch(app),
    restoreCmd(app),
    points(app), 
    queue(app),
    test(app),
    temp(app),
  ].flat() // prettier-ignore

  if (app.config.features.EXPERIMENTAL_VIEWS) {
    enabled_views = enabled_views.concat(experimental_views)
  }

  if (app.config.features.ALL_COMMANDS_GUILD) {
    enabled_views.filter(isCommandView).forEach(view => {
      view.options.guild_id = app.config.DEV_GUILD_ID
    })
  }

  // check for duplicate custom_id_prefixes
  const custom_id_prefixes = enabled_views.filter(view => !!view.options.custom_id_prefix)

  if (custom_id_prefixes.length !== new Set(custom_id_prefixes).size) {
    throw new Error(`Duplicate custom id prefixes found in views: ${custom_id_prefixes}`)
  }

  return enabled_views
}

export function findView(app: App): FindViewCallback {
  return async (
    command?: { name: string; type: number; guild_id?: string },
    custom_id_prefix?: string
  ) => {
    const known_views: AnyView[] = getAllViews(app)

    if (custom_id_prefix) {
      var view = known_views.find(view => view.options.custom_id_prefix === custom_id_prefix)
    } else if (command) {
      view = known_views.find(
        view =>
          isCommandView(view) &&
          command.name === view.options.command.name &&
          command.type === view.options.type &&
          command.guild_id === view.options.guild_id
      )
    }
    return view
  }
}
