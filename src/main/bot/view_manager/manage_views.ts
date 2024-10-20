import {
  type AnyAppCommand,
  type AnyView,
  type FindViewCallback,
  overwriteDiscordCommandsWithViews,
  viewIsAppCommand,
} from '../../../discord-framework'
import type { App } from '../../app-context/app-context'
import { all_views } from './all_views'

export async function getAllCommandSignatures(
  app: App,
  guild_id?: string,
): Promise<AnyAppCommand[]> {
  return (
    await Promise.all(
      all_views.map(async v => {
        if (guild_id) {
          if (!v.getCommandSignatureInGuild) return []
          return await v.getCommandSignatureInGuild(app, guild_id)
        } else {
          const sig = v.resolveView(app)
          return viewIsAppCommand(sig) ? sig : []
        }
      }),
    )
  ).flat()
}

/**
 * Given an app context, returns a callback
 */
export const getFindViewCallback =
  (app: App): FindViewCallback =>
  (command?: { name: string; type: number }, custom_id_prefix?: string) =>
    (function find(index: number): AnyView | null {
      if (index >= all_views.length) return null
      const v = all_views[index].resolveView(app)
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

export async function syncDiscordCommands(app: App, guild_id?: string) {
  await overwriteDiscordCommandsWithViews(
    app.bot,
    await getAllCommandSignatures(app, guild_id),
    guild_id,
  )
}
