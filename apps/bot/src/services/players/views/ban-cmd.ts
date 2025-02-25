import { CommandSignature, getOptions } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { App } from '../../../setup/app'
import { guildRankingsOption, withOptionalSelectedRanking } from '../../../utils/view-helpers/ranking-option'
import { numRankings } from '../../guilds/properties'
import { getRegisterPlayer, setPlayerDisabled as setIsUserDisabled } from '../manage-players'

export const ban_cmd_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'ban',
  description: 'Ban or unban a player from a ranking',
})

export const ban_cmd = ban_cmd_sig.set<App>({
  guildSignature: async (app, guild_id) => {
    const guild = app.db.guilds.get(guild_id)
    if ((await numRankings(app, guild)) == 0) return null

    return new CommandSignature({
      ...ban_cmd_sig.config,
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
        await guildRankingsOption(app, guild, 'ranking', { optional: true }, 'Leave blank to choose ALL rankings'),
      ),
    })
  },
  onCommand: async (ctx, app) => {
    const options = getOptions(ctx.interaction, {
      user: { type: D.ApplicationCommandOptionType.User, required: true, name: 'player' },
      unban: { type: D.ApplicationCommandOptionType.String },
      ranking: { type: D.ApplicationCommandOptionType.Integer }
    })
    return withOptionalSelectedRanking({
      app,
      ctx,
      ranking_id: options.ranking,
      }, async ranking => {

        // Get the selected ranking and player(s) to act on.
        const { players, rankings } = await (async () => {
          if (ranking) {
            // A ranking was selected
            const player = await getRegisterPlayer(app, options.user, ranking)
            return { players: [player], rankings: [await ranking.fetch()] }
          } else {
            // No ranking was selected. Act on all rankings in the guild.
            const guild_rankings = await app.db.guild_rankings.getBy({
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
      }
)}
})
