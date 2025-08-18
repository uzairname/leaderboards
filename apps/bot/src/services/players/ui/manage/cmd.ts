import { CommandSignature, getOptions } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { App } from '../../../../setup/app'
import { guildRankingsOption, withOptionalSelectedRanking } from '../../../../utils/ui/view-helpers/ranking-option'
import { numRankings } from '../../../guilds/properties'
import { onPlayerBan, onPlayerRemove } from './handlers'

export const player_cmd_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'player',
  description: 'Manage a player',
})

function makeSubCommandOption({
  name,
  description,
  guild_rankings_option,
}: {
  name: string
  description: string
  guild_rankings_option: D.APIApplicationCommandBasicOption[]
}): D.APIApplicationCommandSubcommandOption {
  return {
    type: D.ApplicationCommandOptionType.Subcommand,
    name,
    description,
    options: (
      [
        {
          type: D.ApplicationCommandOptionType.User,
          name: 'player',
          description: 'Who to act on',
          required: true,
        },
      ] as D.APIApplicationCommandBasicOption[]
    ).concat(guild_rankings_option),
    required: false,
  }
}

export const player_cmd = player_cmd_sig.set<App>({
  guildSignature: async (app, guild_id) => {
    const guild = app.db.guilds.get(guild_id)
    if ((await numRankings(app, guild)) == 0) return null

    const guild_rankings_option = await guildRankingsOption(
      app,
      guild,
      'ranking',
      { optional: true },
      'Leave blank to choose ALL rankings',
    )

    return new CommandSignature({
      ...player_cmd_sig.config,
      options: [
        makeSubCommandOption({
          name: 'ban',
          description: 'Ban a player from participating in matches',
          guild_rankings_option,
        }),
        makeSubCommandOption({
          name: 'unban',
          description: 'Ban a player from participating in matches',
          guild_rankings_option,
        }),
        makeSubCommandOption({
          name: 'remove',
          description: 'Remove a player from a ranking',
          guild_rankings_option,
        }),
      ],
    })
  },
  onCommand: async (ctx, app) => {
    const { options, subcommand } = getOptions(ctx.interaction, {
      user: { type: D.ApplicationCommandOptionType.User, required: true, name: 'player' },
      ranking: { type: D.ApplicationCommandOptionType.Integer },
    })

    return withOptionalSelectedRanking(
      {
        app,
        ctx,
        ranking_id: options.ranking,
      },
      async ranking =>
        ctx.defer(async ctx => {
          // Call the handler based on the subcommand
          if (!subcommand) throw new Error('Missing subcommand')
          const handler = {
            ban: onPlayerBan,
            remove: onPlayerRemove,
          }[subcommand]
          if (!handler) throw new Error(`Unknown subcommand: ${subcommand}`)

          await handler(app, ctx, options.user, ranking)
        }),
    )
  },
})
