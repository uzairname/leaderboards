import {
  type AnyView,
  type FindViewCallback,
  viewIsAppCommand,
  type AnyAppCommand,
  overwriteDiscordCommandsWithViews,
} from '../../../discord-framework'
import { sentry } from '../../../request/sentry'
import type { App } from '../../app/app'
import { all_views } from './all_view_modules'

export async function getCommands(
  app: App,
  guild_id: string | undefined,
): Promise<AnyAppCommand[]> {
  const all_view_definitions: AnyAppCommand[] = []

  for (const view_module of all_views) {
    const view = await view_module.definition(app, guild_id)
    if (view && viewIsAppCommand(view)) {
      all_view_definitions.push(view)
    }
  }

  return all_view_definitions
}

export const findView =
  (app: App): FindViewCallback =>
  (command?: { name: string; type: number; guild_id?: string }, custom_id_prefix?: string) =>
    (function find(index: number): AnyView | undefined {
      const v = all_views[index].resolveCallbacks(app)
      return (
        custom_id_prefix
          ? v.options.custom_id_prefix === custom_id_prefix
          : command
            ? viewIsAppCommand(v) &&
              command.name === v.options.name &&
              command.type === v.options.type
            : false
      )
        ? v
        : find(index + 1)
    })(0)

export async function syncDiscordCommands(app: App, guild_id: string | undefined) {
  await overwriteDiscordCommandsWithViews(app.bot, await getCommands(app, guild_id), guild_id)
}
