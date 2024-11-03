import * as D from 'discord-api-types/v10'
import { AppCommand } from '../../../../../discord-framework'
import { nonNullable } from '../../../../../utils/utils'
import { GuildCommand } from '../../../../app/ViewModule'
import { checkGuildInteraction } from '../../../ui-helpers/perms'
import {
  guildRankingsOption,
  withOptionalSelectedRanking,
} from '../../../ui-helpers/ranking-command-option'
import { getRegisterPlayer, setUserDisabled as setIsUserDisabled } from '../manage-players'

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
        const selected_user_id = nonNullable(
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

        // Get the selected ranking and player(s) to act on.
        const { players, rankings } = await (async () => {
          if (ranking) {
            // A ranking was selected
            const player = await getRegisterPlayer(app, selected_user_id, ranking)
            return { players: [player], rankings: [await ranking.fetch()] }
          } else {
            // No ranking was selected. Act on all rankings in the guild.
            const interaction = checkGuildInteraction(ctx.interaction)
            const guild_rankings = await app.db.guild_rankings.fetch({
              guild_id: interaction.guild_id,
            })
            return {
              players: await Promise.all(
                guild_rankings.map(item => getRegisterPlayer(app, selected_user_id, item.ranking)),
              ).then(players => players.filter((p): p is NonNullable<typeof p> => !!p)),
              rankings: guild_rankings.map(r => r.ranking),
            }
          }
        })()

        await Promise.all(players.map(player => setIsUserDisabled(app, player, unban_yes)))

        return {
          type: D.InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: `${unban_yes ? `Unbanned` : `Banned`} <@${selected_user_id}> from ${rankings.map(r => r.data.name).join(', ')}`,
            flags: D.MessageFlags.Ephemeral,
          },
        }
      }),
    ),
).dev()
