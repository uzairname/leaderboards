import * as D from 'discord-api-types/v10'
import { AppCommand } from '../../../../../discord-framework'
import { nonNullable } from '../../../../../utils/utils'
import { GuildCommand } from '../../../../app/ViewModule'
import { checkGuildInteraction } from '../../../ui-helpers/perms'
import {
  guildRankingsOption,
  withOptionalSelectedRanking,
} from '../../../ui-helpers/ranking-command-option'
import { getOrCreatePlayer, setUserDisabled } from '../manage-players'

export const disable_player_cmd_config = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  name: 'ban',
  description: 'Ban or unban a player from a ranking',
})

export default new GuildCommand(
  disable_player_cmd_config,
  async (app, guild) => {
    return new AppCommand({
      ...disable_player_cmd_config.config,
      options: (
        [
          {
            type: D.ApplicationCommandOptionType.User,
            name: 'player',
            description: 'Who to ban from the ranking',
            required: true,
          },
          {
            type: D.ApplicationCommandOptionType.String,
            name: 'unban',
            description: 'Unban the player?',
            required: false,
            choices: [{ name: 'yes', value: 'yes' }],
          },
        ] as D.APIApplicationCommandOption[]
      ).concat(
        await guildRankingsOption(
          app,
          guild,
          'ranking',
          { optional: true },
          'Leave blank to choose ALL rankings',
        ),
      ),
    })
  },
  app =>
    disable_player_cmd_config.onCommand(async ctx =>
      withOptionalSelectedRanking(app, ctx, 'ranking', {}, async ranking => {
        const user_option_value = nonNullable(
          ctx.interaction.data.options?.find(
            o => o.name === 'player',
          ) as D.APIApplicationCommandInteractionDataUserOption,
          'player option',
        ).value

        const unban_yes =
          (
            ctx.interaction.data.options?.find(o => o.name === 'unban') as
              | D.APIApplicationCommandInteractionDataStringOption
              | undefined
          )?.value === 'yes'

        const { players, rankings } = await (async () => {
          if (ranking) {
            const player = await getOrCreatePlayer(app, user_option_value, ranking)
            return { players: [player], rankings: [ranking] }
          } else {
            const interaction = checkGuildInteraction(ctx.interaction)
            const rankings = await app.db.guild_rankings.get({
              guild_id: interaction.guild_id,
            })
            return {
              players: await Promise.all(
                rankings.map(guild_ranking =>
                  getOrCreatePlayer(app, user_option_value, guild_ranking.ranking),
                ),
              ).then(players => players.filter((p): p is NonNullable<typeof p> => !!p)),
              rankings: rankings.map(r => r.ranking),
            }
          }
        })()

        if (unban_yes) {
          await Promise.all(players.map(player => setUserDisabled(app, player, false)))
          return {
            type: D.InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: `Unbanned <@${user_option_value}> from ${rankings.map(r => r.data.name).join(', ')}`,
              flags: D.MessageFlags.Ephemeral,
            },
          }
        } else {
          await Promise.all(players.map(player => setUserDisabled(app, player, true)))
          return {
            type: D.InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: `Banned <@${user_option_value}> from ${rankings.map(r => r.data.name).join(', ')}`,
              flags: D.MessageFlags.Ephemeral,
            },
          }
        }
      }),
    ),
).dev()
