import {
  type AnyView,
  type FindViewCallback,
  viewIsAppCommand,
  AnyAppCommand,
  overwriteDiscordCommandsWithViews,
} from '../../../discord-framework'
import { sentry } from '../../../request/sentry'
import type { App } from '../../app/app'
import { AppErrors } from '../../app/errors'
import { all_modules, all_views } from './all_view_modules'
import { CustomView } from './view_module'

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

export const findView = (app: App): FindViewCallback => {
  return (command?: { name: string; type: number; guild_id?: string }, custom_id_prefix?: string) =>
    (function find(index: number): AnyView | undefined {
      return findView_(all_views[index], app, command, custom_id_prefix) ?? find(index + 1)
    })(0)
}

function findView_(
  view: CustomView,
  app: App,
  command:
    | {
        name: string
        type: number
        guild_id?: string | undefined
      }
    | undefined,
  custom_id_prefix?: string,
): AnyView | undefined {
  const v = view.resolve(app)
  return (
    custom_id_prefix
      ? v.options.custom_id_prefix === custom_id_prefix
      : command
        ? viewIsAppCommand(v) && command.name === v.options.name && command.type === v.options.type
        : false
  )
    ? v
    : undefined
}

export async function syncDiscordCommands(app: App, guild_id: string | undefined) {
  await overwriteDiscordCommandsWithViews(app.bot, await getCommands(app, guild_id), guild_id)
}
