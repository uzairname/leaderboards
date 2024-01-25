import {
  type AnyView,
  type FindViewCallback,
  viewIsAppCommand,
  type AnyAppCommand,
  overwriteDiscordCommandsWithViews,
} from '../../../discord-framework'
import type { App } from '../../app/app'
import { all_views } from './all_view_modules'
import { type CustomView } from './view_module'

export async function getCommands(
  app: App,
  guild_id: string | undefined,
): Promise<AnyAppCommand[]> {
  return (
    await Promise.all(
      all_views.map(async v => {
        const view = await v.definition(app, guild_id)
        return view && viewIsAppCommand(view) ? [view] : []
      }),
    )
  ).flat()
}

export const findView =
  (app: App): FindViewCallback =>
  (command?: { name: string; type: number; guild_id?: string }, custom_id_prefix?: string) =>
    (function find(index: number): AnyView | undefined {
      const v = all_views[index].resolve(app)
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
