import {
  FindViewCallback,
  viewIsAppCommand,
  type AnyAppCommand,
  type AnyView,
} from '../../../discord-framework'
import type { App } from '../../context/app_context'

export class AppView {
  public is_experimental: boolean = false

  constructor(
    // Resolve the command's callbacks. Used for handling interactions.
    public resolveView: (app: App) => AnyView,
    // If it's a guild command, get its signature in a particular guild. Used for deploying commands.
    public guildCommandSignature?: (app: App, guild_id: string) => Promise<AnyAppCommand>,
  ) {}

  experimental(): this {
    this.is_experimental = true
    return this
  }
}

export class ViewModule {
  constructor(public views: (AppView | ViewModule)[]) {}

  getAllViews(app: App): AppView[] {
    // flattens the views array
    const all_views = this.views
      .map(v => {
        if (v instanceof ViewModule) {
          return v.getAllViews(app)
        }
        return [v]
      })
      .flat()

    return all_views
  }

  async getAllCommandSignatures(app: App, guild_id?: string): Promise<AnyAppCommand[]> {
    return Promise.all(
      this.getAllViews(app).map(async v => {
        if (v.is_experimental && !app.config.features.ExperimentalCommands) {
          return []
        }
        if (guild_id) {
          if (!!v.guildCommandSignature) return v.guildCommandSignature(app, guild_id)
          // If we're looking for guild commands and it's a guild command, get its signature in the guild
        } else {
          if (!v.guildCommandSignature) {
            // if we're not looking for guild commands and it's not a guild command, get its global signature
            const sig = v.resolveView(app)
            return viewIsAppCommand(sig) ? sig : []
          }
        }
        return []
      }),
    ).then(cmds => cmds.flat())
  }

  getFindViewCallback(app: App): FindViewCallback {
    const all_views = this.getAllViews(app)

    return (command?: { name: string; type: number }, custom_id_prefix?: string) =>
      (function findMatchingView(index: number): AnyView | null {
        if (index >= all_views.length) return null
        const v = all_views[index].resolveView(app)

        function isMatch(v: AnyView) {
          return custom_id_prefix
            ? v.options.custom_id_prefix === custom_id_prefix
            : command
              ? viewIsAppCommand(v) &&
                command.name === v.options.name &&
                command.type === v.options.type
              : false
        }

        return isMatch(v) ? v : findMatchingView(index + 1)
      })(0)
  }
}
