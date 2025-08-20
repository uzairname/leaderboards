import { CommandSignature, getOptions } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { removeUserPlayerPage } from './pages'
import { player_view_sig } from './view'
import { numRankings } from '../../../api/guilds/properties'
import { getOrCreatePlayerByUser, setPlayerDisabled } from '../../../api/players/manage'
import { App } from '../../../setup/app'
import { guildRankingsOption, withOptionalSelectedRanking } from '../../utils'
import { listToString } from '@repo/utils'

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
          const selected_players = await (async () => {
            if (ranking) {
              // A ranking was selected. We can narrow down to 1 player
              const player = await getOrCreatePlayerByUser(app, options.user, ranking)
              return [player]
            } else {
              // No ranking was selected. Act on all rankings in the guild.
              const guild_rankings = await app.db.guild_rankings.fetch({
                guild_id: ctx.interaction.guild_id,
              })
              return await Promise.all(
                guild_rankings.map(item => getOrCreatePlayerByUser(app, options.user, item.ranking)),
              )
            }
          })()

          // Call the handler based on the subcommand
          if (!subcommand) throw new Error('Missing subcommand')

          const rankings_str = listToString(
            await Promise.all(selected_players.map(async r => `**${(await r.ranking()).data.name}**`)),
          )

          switch (subcommand) {
            case 'ban':
              await Promise.all(selected_players.map(player => setPlayerDisabled(app, ctx.interaction, player, true)))
              await ctx.edit({
                content: `Banned <@${options.user.id}> from ${rankings_str}.`,
              })
            case 'unban':
              await Promise.all(selected_players.map(player => setPlayerDisabled(app, ctx.interaction, player, false)))
              await ctx.edit({
                content: `Unbanned <@${options.user.id}> from ${rankings_str}.`,
              })
            case 'remove':
              await ctx.edit(
                (
                  await removeUserPlayerPage(app, {
                    ...ctx,
                    state: player_view_sig.newState({
                      user_id: options.user.id,
                      players: selected_players.map(player => ({
                        id: player.data.id,
                        ranking_id: player.data.ranking_id,
                      })),
                    }),
                  })
                ).response_data,
              )
          }

          // if (!handler) throw new Error(`Unknown subcommand: ${subcommand}`)

          // await handler(app, ctx, selected_players)
        }),
    )
  },
})
