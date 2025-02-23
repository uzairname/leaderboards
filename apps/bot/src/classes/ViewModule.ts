import { PartialGuild } from '@repo/db/models'
import { AnyChatInputCommandSignature, AnyCommandSignature, AnySignature, FindViewCallback, viewIsCommand } from '@repo/discord'
import { sequential } from '@repo/utils'
import type { App } from '../setup/app'

export class AppView<TView extends AnySignature> {
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

export class GuildCommand<TView extends AnyChatInputCommandSignature> extends AppView<TView> {
  constructor(
    base_signature: TView,
    public resolveGuildSignature: (app: App, guild: PartialGuild) => Promise<TView | null>,
    resolveHandlers: (app: App) => TView,
  ) {
    super(base_signature, resolveHandlers)
  }
}

export type AnyAppView = AppView<AnySignature>
export type AnyGuildCommand = GuildCommand<AnyChatInputCommandSignature>

export class ViewModule {
  public all_views: AnyAppView[]

  constructor(public views: (AnyAppView | ViewModule)[]) {
    this.all_views = views.flatMap(v => (v instanceof ViewModule ? v.all_views : [v]))

    // Identify duplicate custom_id_prefixes
    const custom_id_prefixes = this.all_views.map(v => v.base_signature.config.custom_id_prefix)
    const duplicates = custom_id_prefixes.filter((v, i) => v !== undefined && custom_id_prefixes.indexOf(v) !== i)
    if (duplicates.length > 0) throw new Error(`Duplicate custom_id_prefixes: ${duplicates} ${duplicates.join(', ')}.`)
  }

  getViewByCustomIdPrefix() {
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

  async getAllCommandSignatures(app: App, guild?: PartialGuild): Promise<AnyCommandSignature[]> {
    const cmds = await sequential(
      this.all_views.map(v => async () => {
        if (v.is_dev && !app.config.features.ExperimentalCommands) {
          // Ignore dev and experimental commands
          return null
        }
        if (guild) {
          if (v instanceof GuildCommand) {
            return v.resolveGuildSignature(app, guild)
          }
        } else {
          if (!(v instanceof GuildCommand)) {
            // if we're not looking for guild commands and it's not a guild command, get its global signature
            const resolved = v.resolveHandlers(app)
            return viewIsCommand(resolved) ? resolved : null
          }
        }
        return null
      }),
    )

    return cmds.filter((v): v is AnyCommandSignature => v !== null)
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
            ? viewIsCommand(_v) && command.name === _v.config.name && command.type === _v.config.type
            : false
      })

      if (matching_views.length !== 1) {
        throw new Error('unique view with callbacks not found')
      }

      return matching_views[0].resolveHandlers(app)
    }
  }
}
