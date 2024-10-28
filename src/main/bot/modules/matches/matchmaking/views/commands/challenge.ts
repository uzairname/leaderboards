import * as D from 'discord-api-types/v10'
import { AppCommand } from '../../../../../../../discord-framework'
import { sentry } from '../../../../../../../logging/sentry'
import { nonNullable } from '../../../../../../../utils/utils'
import { GuildCommandView } from '../../../../../../app/ViewModule'
import { checkGuildInteraction } from '../../../../../helpers/perms'
import {
  guildRankingsOption,
  withSelectedRanking,
} from '../../../../../helpers/ranking_command_option'
import { getOrCreatePlayer } from '../../../../players/manage_players'
import { challenge_message_signature, challengeMessage } from '../pages/challenge'

const optionnames = {
  opponent: 'opponent',
  ranking: 'ranking',
  best_of: 'best-of',
}

export const challenge_cmd_signature = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  name: `1v1`,
  description: 'Challenge someone to a 1v1',
})

export default new GuildCommandView(
  challenge_cmd_signature,
  app =>
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

            const best_of =
              (
                ctx.interaction.data.options?.find(o => o.name === optionnames.best_of) as
                  | D.APIApplicationCommandInteractionDataNumberOption
                  | undefined
              )?.value ?? 1

            sentry.debug(`A best of ${best_of} challenge was initiated`)

            await app.bot.createMessage(
              ctx.interaction.channel.id,
              (
                await challengeMessage(app, {
                  interaction: ctx.interaction,
                  state: challenge_message_signature.createState({
                    time_sent: new Date(),
                    initiator_id: initiator.data.user_id,
                    opponent_id,
                    best_of,
                    ranking_id: ranking.data.id,
                  }),
                })
              ).as_post,
            )
          },
        ),
      ),
    ),
  async (app, guild) => {
    return new AppCommand({
      ...challenge_cmd_signature.signature,
      options: (
        [
          {
            type: D.ApplicationCommandOptionType.User,
            name: 'opponent',
            description: 'Who to challenge',
            required: true,
          },
          {
            type: D.ApplicationCommandOptionType.Number,
            name: optionnames.best_of,
            description: 'Best of how many games?',
            required: false,
            choices: [
              { name: '1', value: 1 },
              { name: '3', value: 3 },
              { name: '5', value: 5 },
              { name: '7', value: 7 },
            ],
          },
        ] as D.APIApplicationCommandOption[]
      ).concat(await guildRankingsOption(app, guild, optionnames.ranking, {})),
    })
  },
)
