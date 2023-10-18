import {
  APIApplicationCommandAutocompleteResponse,
  APIApplicationCommandInteractionDataStringOption,
  APIApplicationCommandOptionChoice,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  InteractionResponseType,
  MessageFlags,
} from 'discord-api-types/v10'

import { assertNonNullable } from '../../../utils/utils'

import { checkGuildInteraction } from '../../helpers/checks'
import { checkMemberBotAdmin } from '../../helpers/checks'
import { getOrAddGuild } from '../../modules/guilds'
import {
  getLeaderboardById,
  getLeaderboardCurrentDivision,
  syncLbDisplayMessage,
} from '../../modules/leaderboards'
import { CommandView } from '../../../discord/interactions/views/views'
import { AppError } from '../../errors'
import { getRegisterPlayer } from '../../modules/players'
import { App } from '../../app'

const points_command = new CommandView({
  type: ApplicationCommandType.ChatInput,
  command: {
    name: 'points',
    description: 'Add or remove points from a user',
    options: [
      {
        name: 'user',
        description: 'User to add/remove points from',
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      {
        name: 'points',
        description: 'Points to add/remove. A negative number removes points',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: 'leaderboard',
        description: 'Leaderboard to apply points to',
        type: ApplicationCommandOptionType.String,
        autocomplete: true,
        required: true,
      },
    ],
  },
  state_schema: {},
})

export default (app: App) =>
  points_command
    .onAutocomplete(async (ctx) => {
      const interaction = checkGuildInteraction(ctx.interaction)

      let input_value =
        (
          interaction.data.options?.find((o) => o.name === 'leaderboard') as
            | APIApplicationCommandInteractionDataStringOption
            | undefined
        )?.value ?? ''

      const guild = await getOrAddGuild(app, interaction.guild_id)
      const lb_results = await guild.guildLeaderboards()

      const choices: APIApplicationCommandOptionChoice[] = lb_results
        .filter((lb) => lb.leaderboard.data.name.toLowerCase().includes(input_value.toLowerCase()))
        .map((lb) => ({
          name: lb.leaderboard.data.name,
          value: lb.leaderboard.data.id.toString(),
        }))

      const response: APIApplicationCommandAutocompleteResponse = {
        type: InteractionResponseType.ApplicationCommandAutocompleteResult,
        data: {
          choices,
        },
      }

      return response
    })
    .onCommand(async (ctx) => {
      // Check if the user has bot admin perms in the guild.
      const interaction = checkGuildInteraction(ctx.interaction)
      const guild = await getOrAddGuild(app, interaction.guild_id)
      checkMemberBotAdmin(interaction.member, guild)

      // get the points to add
      const options: {
        [key: string]: string
      } = {}
      ;(interaction.data.options as APIApplicationCommandInteractionDataStringOption[])?.forEach(
        (o) => {
          options[o.name] = o.value
        },
      )

      const points = parseInt(options.points)
      if (isNaN(points)) {
        throw new AppError('Points must be a number')
      }

      console.log('1A')

      // Get the selected leaderboard division
      let leaderboard = await getLeaderboardById(app.db, parseInt(options.leaderboard))
      let division = await getLeaderboardCurrentDivision(app.db, leaderboard)
      console.log('1B')

      // Get the selected player in the division
      const user = interaction.data.resolved?.users?.[options.user]
      assertNonNullable(user)
      let player = await getRegisterPlayer(app.db, user, division)

      // add points to player
      await player.update({
        rating: (player.data.rating || 0) + points,
      })

      // update the leaderboard display
      const guild_leaderboard = await app.db.guild_leaderboards.get(
        guild.data.id,
        leaderboard.data.id,
      )
      assertNonNullable(guild_leaderboard)

      await syncLbDisplayMessage(app, guild_leaderboard)

      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: `Added ${points} points to <@${user.id}> in ${leaderboard.data.name}`,
          flags: MessageFlags.Ephemeral,
          allowed_mentions: {
            parse: [],
          },
        },
      }
    })
