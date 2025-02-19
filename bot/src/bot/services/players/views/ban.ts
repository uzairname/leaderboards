import * as D from 'discord-api-types/v10'
import { CommandView, getOptions } from 'discord-framework'
import {
  guildRankingsOption,
  withOptionalSelectedRanking,
} from '../../../ui-helpers/ranking-option'
import { GuildCommand } from '../../ViewModule'
import { getRegisterPlayer, setPlayerDisabled as setIsUserDisabled } from '../manage-players'

export const disable_player_cmd_config = new CommandView({
  type: D.ApplicationCommandType.ChatInput,
  name: 'ban',
  description: 'Ban or unban a player from a ranking',
})

export default new GuildCommand(
  disable_player_cmd_config,
  async (app, guild) => {
    return new CommandView({
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
      withOptionalSelectedRanking(
        app,
        ctx,
        getOptions(ctx.interaction, { ranking: { type: D.ApplicationCommandOptionType.Integer } })
          .ranking,
        {},
        async ranking => {
          const options = getOptions(ctx.interaction, {
            user: { type: D.ApplicationCommandOptionType.User, required: true, name: 'player' },
            unban: { type: D.ApplicationCommandOptionType.String },
          })

          // Get the selected ranking and player(s) to act on.
          const { players, rankings } = await (async () => {
            if (ranking) {
              // A ranking was selected
              const player = await getRegisterPlayer(app, options.user, ranking)
              return { players: [player], rankings: [await ranking.fetch()] }
            } else {
              // No ranking was selected. Act on all rankings in the guild.
              const guild_rankings = await app.db.guild_rankings.fetch({
                guild_id: ctx.interaction.guild_id,
              })
              return {
                players: await Promise.all(
                  guild_rankings.map(item => getRegisterPlayer(app, options.user, item.ranking)),
                ).then(players => players.filter((p): p is NonNullable<typeof p> => !!p)),
                rankings: guild_rankings.map(r => r.ranking),
              }
            }
          })()

          await Promise.all(players.map(player => setIsUserDisabled(app, player, !options.unban)))

          return {
            type: D.InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: `You have ${options.unban ? `unbanned` : `banned`} <@${options.user.id}> from participating in ${rankings.map(r => r.data.name).join(', ')}`,
            },
          }
        },
      ),
    ),
)
