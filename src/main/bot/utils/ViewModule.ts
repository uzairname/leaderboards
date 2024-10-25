import {
  FindViewCallback,
  StringDataSchema,
  viewIsAppCommand,
  type AnyAppCommand,
  type AnyView,
} from '../../../discord-framework'
import { ViewState, ViewStateFactory } from '../../../discord-framework/interactions/view_state'
import { sentry } from '../../../logging'
import type { App } from '../../context/app_context'

export class AppView {
  public is_dev: boolean = false

  constructor(
    // At least the view's state schema and type.
    public base_signature: AnyView,
    // Resolve the command's callbacks and full signature. Used for handling interactions and deploying commands.
    public resolveHandlers: (app: App) => AnyView,
    // If it's a guild command, get its signature in a particular guild. Overrides for deploying commands.
    public resolveGuildSignature?: (app: App, guild_id: string) => Promise<AnyAppCommand>,
  ) {}

  // public resolve = (app: App) => this._resolve(app, this.signature)

  dev(): this {
    this.is_dev = true
    return this
  }
}

export class ViewModule {
  public all_views: AppView[]

  constructor(public views: (AppView | ViewModule)[]) {
    this.all_views = views.flatMap(v => (v instanceof ViewModule ? v.all_views : [v]))
  }

  findViewSignatureFromCustomId() {
    const all_views = this.all_views
    return function (custom_id_prefix: string) {
      const matching_views = all_views.filter(
        v => custom_id_prefix && v.base_signature.signature.custom_id_prefix === custom_id_prefix,
      )
      if (matching_views.length !== 1) {
        throw new Error('unique view signature not found')
      }
      return matching_views[0].base_signature
    }
  }

  viewState(custom_id_prefix: string): ViewState<StringDataSchema> {
    return ViewStateFactory.fromCustomId(custom_id_prefix, this.findViewSignatureFromCustomId())
      .state
  }

  async getAllCommandSignatures(app: App, guild_id?: string): Promise<AnyAppCommand[]> {
    return Promise.all(
      this.all_views.map(async v => {
        if (v.is_dev && !app.config.features.ExperimentalCommands) {
          return []
        }
        if (guild_id) {
          if (!!v.resolveGuildSignature) return v.resolveGuildSignature(app, guild_id)
          // If we're looking for guild commands and it's a guild command, get its signature in the guild
        } else {
          if (!v.resolveGuildSignature) {
            // if we're not looking for guild commands and it's not a guild command, get its global signature
            const resolved = v.resolveHandlers(app)
            return viewIsAppCommand(resolved) ? resolved : []
          }
        }
        return []
      }),
    ).then(cmds => cmds.flat())
  }

  /**
   * returns a function that takes a command and custom_id_prefix and returns a view with interaction handlers
   */
  getFindViewCallback(app: App): FindViewCallback {
    return (command?: { name: string; type: number }, custom_id_prefix?: string) => {
      const matching_views = this.all_views.filter(v => {
        const _v = v.base_signature

        return custom_id_prefix
          ? _v.signature.custom_id_prefix === custom_id_prefix
          : command
            ? viewIsAppCommand(_v) &&
              command.name === _v.signature.name &&
              command.type === _v.signature.type
            : false
      })

      if (matching_views.length !== 1) {
        throw new Error('unique view with callbacks not found')
      }

      return matching_views[0].resolveHandlers(app)
    }
  }
}
