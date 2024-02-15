import { AnyAppCommand, AnyView, viewIsAppCommand } from '../../../discord-framework'
import { App } from '../../app/app'

export class ViewModule {
  constructor(public views: CustomView[]) {}
}

export function globalView(view: (app: App) => AnyView, experimental?: boolean): CustomView {
  return {
    definition: async (app, guild_id) => {
      if (experimental && !app.config.features.ExperimentalViews) {
        return undefined
      }
      if (app.config.features.DevGuildCommands) {
        return guild_id === app.config.DevGuildId ? view(app) : undefined
      }
      return guild_id === undefined ? view(app) : undefined
    },
    resolveCallbacks: view,
  }
}

export function guildCommand(
  resolveCallbacks: (app: App) => AnyAppCommand,
  guildDefinition: (app: App, guild_id?: string) => Promise<AnyAppCommand | undefined>,
  experimental?: boolean,
): CustomView {
  return {
    definition: async (app: App, guild_id?: string) => {
      if (experimental && !app.config.features.ExperimentalViews) {
        return undefined
      }
      return guildDefinition(app, guild_id)
    },
    resolveCallbacks,
  }
}

export type CustomView = {
  // Get the view's definition to deploy application commands to a particular guild, or global.
  definition: (app: App, guild_id?: string) => Promise<AnyView | undefined>
  // Return the view with its interaction callbacks if the interaction corresponds to this view.
  resolveCallbacks: (app: App) => AnyView
}
