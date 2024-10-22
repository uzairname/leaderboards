import * as D from 'discord-api-types/v10'
import { AppCommand } from '../../../../../../discord-framework'
import { nonNullable } from '../../../../../../utils/utils'
import { App } from '../../../../../context/app_context'
import { ensureAdminPerms } from '../../../../utils/perms'
import { UserError } from '../../../../utils/UserError'
import { guildRankingsOption } from '../../../utils/ranking_command_option'
import { getOrCreatePlayer } from '../../players'
import { AppView } from '../../../../utils/ViewModule'

const points_cmd_signature = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  name: 'points',
  description: 'Add or remove points from a user',
})

export const pointsCmdInGuild = async (app: App, guild_id: string) => {
  let options: D.APIApplicationCommandOption[] = [
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

  options = options.concat(
    await guildRankingsOption(app, guild_id, 'ranking', {}, 'Ranking in which to add points'),
  )

  return new AppCommand({
    ...points_cmd_signature.options,
    options,
  })
}

export const pointsCmd = (app: App) =>
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
        const option_names: { [key: string]: string } = {}
        ;(
          ctx.interaction.data.options as D.APIApplicationCommandInteractionDataStringOption[]
        )?.forEach(o => {
          option_names[o.name] = o.value
        })

        const points = parseInt(option_names.points)
        if (isNaN(points)) {
          throw new UserError('Points must be a number')
        }

        // Get the selected ranking
        const ranking = await app.db.rankings.get(parseInt(option_names['ranking']))

        // Get the selected player in the ranking
        const user = nonNullable(
          ctx.interaction.data.resolved?.users?.[option_names.user],
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
          content: `Added ${points} points to <@${user.id}> in ${ranking.data.name}`,
          flags: D.MessageFlags.Ephemeral,
          allowed_mentions: {
            parse: [],
          },
        })
      },
    )
  })

export default new AppView(pointsCmd, pointsCmdInGuild).experimental()
