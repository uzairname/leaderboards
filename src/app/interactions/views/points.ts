import {
  APIApplicationCommandAutocompleteResponse,
  APIApplicationCommandInteractionDataStringOption,
  APIApplicationCommandOptionChoice,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  InteractionResponseType,
  MessageFlags,
} from 'discord-api-types/v10'

import { CommandView } from '../../../discord-framework'
import { assertValue } from '../../../utils/utils'

import { checkGuildInteraction } from '../checks'
import { checkMemberBotAdmin } from '../../modules/user_permissions'
import { getOrAddGuild } from '../../modules/guilds'
import { syncRankingLbMessage } from '../../modules/channels/ranking_channels'
import { UserError } from '../../errors'
import { getRegisterPlayer } from '../../modules/players'
import { App } from '../../app'
import { rankingsAutocomplete } from '../common'
import { sentry } from '../../../logging/globals'

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
        name: 'ranking',
        description: 'The ranking to apply points in',
        type: ApplicationCommandOptionType.String,
        autocomplete: true,
        required: true,
      },
    ],
  },
  state_schema: {},
})

export default (app: App) =>
  points_command.onAutocomplete(rankingsAutocomplete(app)).onCommand(async (ctx) => {
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
      throw new UserError('Points must be a number')
    }

    // Get the selected ranking
    const ranking_id = parseInt(options['ranking'])
    sentry.debug(`ranking_id: ${ranking_id}`)
    let ranking = await app.db.rankings.get(parseInt(options['ranking']))

    // Get the selected player in the ranking
    const user = interaction.data.resolved?.users?.[options.user]
    assertValue(user)
    let player = await getRegisterPlayer(app, user, ranking)

    // add points to player
    await player.update({
      rating: (player.data.rating || 0) + points,
    })

    // update the leaderboard display
    const guild_ranking = await app.db.guild_rankings.get(guild.data.id, ranking.data.id)
    assertValue(guild_ranking)

    await syncRankingLbMessage(app, guild_ranking)

    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: `Added ${points} points to <@${user.id}> in ${ranking.data.name}`,
        flags: MessageFlags.Ephemeral,
        allowed_mentions: {
          parse: [],
        },
      },
    }
  })
