import { AnyView, FindViewCallback, isCommandView } from '../../discord-framework'
import { helpCmd } from '../views/commands/help'
import { leaderboardCmd } from '../views/commands/leaderboard'
import { pointsCmd } from '../views/commands/points'
import { createRankingCmd, createRankingView } from '../views/commands/rankings/create_ranking'
import { rankingSettingsView } from '../views/commands/rankings/ranking_settings'
import { rankingsCmd } from '../views/commands/rankings/rankings_cmd'
import { recordMatchCmd } from '../views/commands/record_match/record_match'
import { settingsCmd } from '../views/commands/settings'
import { startMatchCmd } from '../views/commands/start_match'
import { statsCmd } from '../views/commands/stats'
import { test_views } from '../views/commands/test_command'
import { selectChannelView } from '../views/helpers/select_channel'
import { queueView } from '../views/messages/queue'
import { App } from './app'
import { AppErrors } from './errors'

export function getAllViews(app: App): AnyView[] {
  let enabled_views: AnyView[] = [
    helpCmd(app), 

    settingsCmd(app),
    createRankingCmd(app),
    rankingsCmd(app), 
    rankingSettingsView(app),
    createRankingView(app),

    selectChannelView(app),

    recordMatchCmd(app),
    leaderboardCmd(app),
  ] // prettier-ignore

  const experimental_views: AnyView[] = [
    test_views.map(view => view(app)),
    startMatchCmd(app),
    pointsCmd(app), 
    queueView(app),
    statsCmd(app),
  ].flat() // prettier-ignore

  if (app.config.features.ExperimentalViews) {
    enabled_views = enabled_views.concat(experimental_views)
  }

  if (app.config.features.DevGuildCommands) {
    enabled_views.filter(isCommandView).forEach(view => {
      view.options.guild_id = app.config.DevGuildId
    })
  }

  // check for duplicate custom_id_prefixes
  const custom_id_prefixes = enabled_views.filter(view => !!view.options.custom_id_prefix)

  if (custom_id_prefixes.length !== new Set(custom_id_prefixes).size) {
    throw new AppErrors.InvalidViews(
      `Duplicate custom id prefixes found in views: ${custom_id_prefixes}`,
    )
  }

  // check if any view has a state_schema without a custom_id_prefix
  const views = enabled_views
    .filter(view => !!Object.keys(view.state_schema).length && !view.options.custom_id_prefix)
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
        ? view.options.custom_id_prefix === custom_id_prefix
        : command
          ? isCommandView(view) &&
            command.name === view.options.name &&
            command.type === view.options.type &&
            command.guild_id === view.options.guild_id
          : false,
    )
  }
}
