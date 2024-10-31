import { Guild } from '../../database/models'
import {
  AnyChatInputAppCommand,
  FindViewCallback,
  StringDataSchema,
  viewIsAppCommand,
  type AnyAppCommand,
  type AnyView,
} from '../../discord-framework'
import { ViewState, ViewStateFactory } from '../../discord-framework/interactions/view-state'
import { sentry } from '../../logging/sentry'
import type { App } from './App'

export class AppView<TView extends AnyView> {
  public is_dev: boolean = false

  constructor(
    // At least the view's state schema and command type.
    public base_signature: TView,
    // Resolve the command's callbacks and full signature. Used for handling interactions and deploying commands.
    public resolveHandlers: (app: App) => TView,
  ) {}

  dev(): this {
    this.is_dev = true
    return this
  }
}

export class GuildCommand<TView extends AnyChatInputAppCommand> extends AppView<TView> {
  constructor(
    base_signature: TView,
    public resolveGuildSignature: (app: App, guild: Guild) => Promise<TView | null>,
    resolveHandlers: (app: App) => TView,
  ) {
    super(base_signature, resolveHandlers)
  }
}

export type AnyAppView = AppView<AnyView>
export type AnyGuildCommand = GuildCommand<AnyChatInputAppCommand>

export class ViewModule {
  public all_views: AnyAppView[]

  constructor(public views: (AnyAppView | ViewModule)[]) {
    this.all_views = views.flatMap(v => (v instanceof ViewModule ? v.all_views : [v]))

    // Identify duplicate custom_id_prefixes
    const custom_id_prefixes = this.all_views.map(v => v.base_signature.config.custom_id_prefix)
    const duplicates = custom_id_prefixes.filter(
      (v, i) => v !== undefined && custom_id_prefixes.indexOf(v) !== i,
    )
    if (duplicates.length > 0)
      throw new Error(`Duplicate custom_id_prefixes: ${duplicates} ${duplicates.join(', ')}.`)
  }

  findViewSignatureFromCustomId() {
    const all_views = this.all_views
    return function (custom_id_prefix: string) {
      const matching_views = all_views.filter(
        v => custom_id_prefix && v.base_signature.config.custom_id_prefix === custom_id_prefix,
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

  async getAllCommandSignatures(app: App, guild?: Guild): Promise<AnyAppCommand[]> {
    if (guild) await app.db.guild_rankings.get({ guild_id: guild?.data.id }) // Cache guild rankings

    const result = Promise.all(
      this.all_views.map(async v => {
        if (v.is_dev && !app.config.features.ExperimentalCommands) {
          return null
        }
        if (guild) {
          if (v instanceof GuildCommand) {
            sentry.debug(`Resolving guild signature for ${v.base_signature.config.name}`)
            return v.resolveGuildSignature(app, guild)
          }
          // If we're looking for guild commands and it's a guild command, get its signature in the guild
        } else {
          if (!(v instanceof GuildCommand)) {
            // if we're not looking for guild commands and it's not a guild command, get its global signature
            const resolved = v.resolveHandlers(app)
            return viewIsAppCommand(resolved) ? resolved : null
          }
        }
        return null
      }),
    ).then(cmds => cmds.filter((v): v is AnyAppCommand => v !== null))

    return result
  }

  /**
   * returns a function that takes a command and custom_id_prefix and returns a view with interaction handlers
   */
  getFindViewCallback(app: App): FindViewCallback {
    return (command?: { name: string; type: number }, custom_id_prefix?: string) => {
      const matching_views = this.all_views.filter(v => {
        const _v = v.base_signature

        return custom_id_prefix
          ? _v.config.custom_id_prefix === custom_id_prefix
          : command
            ? viewIsAppCommand(_v) &&
              command.name === _v.config.name &&
              command.type === _v.config.type
            : false
      })

      if (matching_views.length !== 1) {
        throw new Error('unique view with callbacks not found')
      }

      return matching_views[0].resolveHandlers(app)
    }
  }
}
