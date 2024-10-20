import * as D from 'discord-api-types/v10'
import { AppCommand } from '../../../discord-framework'
import { nonNullable } from '../../../utils/utils'
import { App } from '../../app-context/app-context'
import { AppError } from '../../errors'
import { guildRankingsOptionChoices } from '../components/command_helpers'
import { ensureAdminPerms } from '../perms'

const points_command = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  name: 'points',
  description: 'Add or remove points from a user',
})

export const pointsCmdDef = async (app: App, guild_id?: string) =>
  guild_id
    ? new AppCommand({
        ...points_command.options,
        options: [
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
          {
            type: D.ApplicationCommandOptionType.String,
            name: 'ranking',
            description: 'Select a ranking',
            choices: await guildRankingsOptionChoices(app, guild_id, false),
          },
        ],
      })
    : undefined

export const pointsCmd = (app: App) =>
  points_command.onCommand(async ctx => {
    // Check if the user has bot admin perms in the guild.

    return ctx.defer(
      {
        type: D.InteractionResponseType.DeferredChannelMessageWithSource,
        data: { flags: D.MessageFlags.Ephemeral },
      },
      async ctx => {
        await ensureAdminPerms(app, ctx)

        // get the points to add
        const options: { [key: string]: string } = {}
        ;(
          ctx.interaction.data.options as D.APIApplicationCommandInteractionDataStringOption[]
        )?.forEach(o => {
          options[o.name] = o.value
        })

        const points = parseInt(options.points)
        if (isNaN(points)) {
          throw new AppError('Points must be a number')
        }

        // Get the selected ranking
        let ranking = await app.db.rankings.get(parseInt(options['ranking']))

        // Get the selected player in the ranking
        const user = nonNullable(
          ctx.interaction.data.resolved?.users?.[options.user],
          'interaction data user',
        )
        // let player = await getRegisterPlayer(app, user, ranking)

        // // add points to player
        // await player.update({
        //   rating: nonNullable(player.data.rating, 'player rating') + points,
        // })

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
