import * as D from 'discord-api-types/v10'
import { AppCommand } from '../../../../../../../discord-framework'
import { nonNullable } from '../../../../../../../utils/utils'
import { App } from '../../../../../../context/app_context'
import { checkGuildInteraction } from '../../../../../utils/perms'
import { AppView } from '../../../../../utils/ViewModule'
import { getOrCreatePlayer } from '../../../../players/players'
import { guildRankingsOption, withSelectedRanking } from '../../../../utils/ranking_command_option'
import { challenge_message_signature, challengeMessage } from '../pages/challenge'

const optionnames = {
  opponent: 'opponent',
  ranking: 'ranking',
}

const challenge_cmd_signature = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  name: `1v1`,
  description: 'Challenge someone to a 1v1',
})

const challengeCommandInGuild = async (app: App, guild_id: string) => {
  let options: D.APIApplicationCommandOption[] = [
    {
      type: D.ApplicationCommandOptionType.User,
      name: 'opponent',
      description: 'Who to challenge',
      required: true,
    },
  ]

  options = options.concat(await guildRankingsOption(app, guild_id, optionnames.ranking, {}))

  return new AppCommand({
    ...challenge_cmd_signature.options,
    options,
  })
}

const challengeCommand = (app: App) =>
  challenge_cmd_signature.onCommand(async ctx =>
    withSelectedRanking(app, ctx, optionnames.ranking, async ranking =>
      ctx.defer(
        {
          type: D.InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: 'Challenge sent',
            flags: D.MessageFlags.Ephemeral,
          },
        },
        async ctx => {
          const interaction = checkGuildInteraction(ctx.interaction)
          const initiator = await getOrCreatePlayer(app, interaction.member.user.id, ranking)

          const opponent_id = nonNullable(
            ctx.interaction.data.options?.find(
              o => o.name === optionnames.opponent,
            ) as D.APIApplicationCommandInteractionDataUserOption,
            'opponent option',
          ).value

          await app.bot.createMessage(
            ctx.interaction.channel.id,
            (
              await challengeMessage(app, {
                interaction: ctx.interaction,
                state: challenge_message_signature.newState({
                  time_started: new Date(),
                  initiator_id: initiator.data.user_id,
                  opponent_id,
                  ranking_id: ranking.data.id,
                }),
              })
            ).as_post,
          )
        },
      ),
    ),
  )

export default new AppView(challengeCommand, challengeCommandInGuild)
