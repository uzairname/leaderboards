import * as D from 'discord-api-types/v10'
import { AppCommand } from '../../../../../../discord-framework'
import { nonNullable } from '../../../../../../utils/utils'
import { GuildCommand } from '../../../../../app/ViewModule'
import { UserError } from '../../../../errors/UserError'
import { ensureAdminPerms } from '../../../../helpers/perms'
import { guildRankingsOption } from '../../../../helpers/ranking_command_option'
import { escapeMd } from '../../../../helpers/strings'
import { getOrCreatePlayer } from '../../manage_players'

const points_cmd_signature = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  name: 'points',
  description: 'Add or remove points from a user',
})

export default new GuildCommand(
  points_cmd_signature,
  async (app, guild_id) => {
    const options: D.APIApplicationCommandOption[] = [
      {
        name: 'user',
        description: 'User to add/remove points from',
        type: D.ApplicationCommandOptionType.User,
        required: true,
      },
      {
        name: 'points',
        description: 'Points to add. A negative number removes points',
        type: D.ApplicationCommandOptionType.String,
        required: true,
      },
    ]

    return new AppCommand({
      ...points_cmd_signature.signature,
      options: options.concat(
        await guildRankingsOption(app, guild_id, 'ranking', {}, 'Ranking in which to add points'),
      ),
    })
  },
  app =>
    points_cmd_signature.onCommand(async ctx => {
      // Check if the user has bot admin perms in the guild.

      return ctx.defer(
        {
          type: D.InteractionResponseType.DeferredChannelMessageWithSource,
          data: { flags: D.MessageFlags.Ephemeral },
        },
        async ctx => {
          await ensureAdminPerms(app, ctx)

          // get the points to add
          const optionnames: { [key: string]: string } = {}
          ;(
            ctx.interaction.data.options as D.APIApplicationCommandInteractionDataStringOption[]
          )?.forEach(o => {
            optionnames[o.name] = o.value
          })

          const points = parseInt(optionnames.points)
          if (isNaN(points)) {
            throw new UserError('Points must be a number')
          }

          // Get the selected ranking
          const ranking = await app.db.rankings.get(parseInt(optionnames['ranking']))

          // Get the selected player in the ranking
          const user = nonNullable(
            ctx.interaction.data.resolved?.users?.[optionnames.user],
            'interaction data user',
          )
          const player = await getOrCreatePlayer(app, user, ranking)

          // add points to player
          await player.update({
            rating: nonNullable(player.data.rating, 'player rating') + points,
          })

          // update the leaderboard display
          await app.events.RankingLeaderboardUpdated.emit(ranking)

          return void ctx.edit({
            content: `Added ${points} points to <@${user.id}> in ${escapeMd(ranking.data.name)}`,
            flags: D.MessageFlags.Ephemeral,
            allowed_mentions: {
              parse: [],
            },
          })
        },
      )
    }),
)
