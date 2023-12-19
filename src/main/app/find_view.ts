import { AnyView, FindViewCallback, isCommandView } from '../../discord-framework'
import { sentry } from '../../request/sentry'
import { help } from '../views/commands/help'
import points from '../views/commands/points'
import { rankingSettings } from '../views/commands/rankings/ranking_settings'
import { rankings } from '../views/commands/rankings/rankings'
import { recordMatch } from '../views/commands/record_match'
import { restoreCmd } from '../views/commands/restore'
import { settings } from '../views/commands/settings'
import { startMatch } from '../views/commands/start_match'
import temp from '../views/commands/temp_command'
import test from '../views/commands/test_command'
import queue from '../views/messages/queue'
import { App } from './app'
import { AppErrors } from './errors'

export function getAllViews(app: App): AnyView[] {
  let enabled_views: AnyView[] = [
    help(app), 
    settings(app),
    rankings(app), 
    rankingSettings(app),
    recordMatch(app),
  ] // prettier-ignore

  const experimental_views: AnyView[] = [
    startMatch(app),
    restoreCmd(app),
    points(app), 
    queue(app),
    test(app),
    temp(app),
  ] // prettier-ignore

  if (app.config.features.ExperimentalViews) {
    enabled_views = enabled_views.concat(experimental_views)
  }

  if (app.config.features.DevGuildCommands) {
    enabled_views.filter(isCommandView).forEach(view => {
      view.options.guild_id = app.config.DevGuildId
    })
  }

  // check for duplicate custom_id_prefixes
  const custom_id_prefixes = enabled_views.filter(view => !!view.options.custom_id_id)

  if (custom_id_prefixes.length !== new Set(custom_id_prefixes).size) {
    throw new AppErrors.InvalidViews(
      `Duplicate custom id prefixes found in views: ${custom_id_prefixes}`,
    )
  }

  // check if any view has a state_schema without a custom_id_prefix
  const views = enabled_views
    .filter(view => !!Object.keys(view.state_schema).length && !view.options.custom_id_id)
    .map(view => view.name)
  if (views.length) {
    throw new Error(`Stateful view has no custom_id id: ${views}`)
  }

  return enabled_views
}

export const findView = (app: App): FindViewCallback => {
  return async function (
    command?: { name: string; type: number; guild_id?: string },
    custom_id_prefix?: string,
  ) {
    return getAllViews(app).find(view =>
      custom_id_prefix
        ? view.options.custom_id_id === custom_id_prefix
        : command
          ? isCommandView(view) &&
            command.name === view.options.name &&
            command.type === view.options.type &&
            command.guild_id === view.options.guild_id
          : false,
    )
  }
}
