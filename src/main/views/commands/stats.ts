import * as D from 'discord-api-types/v10'
import { CommandView, InteractionContext, field } from '../../../discord-framework'
import { App } from '../../app/app'
import { checkGuildInteraction } from '../utils/checks'

export const stats_cmd = new CommandView({
  type: D.ApplicationCommandType.ChatInput,
  custom_id_prefix: 'st',
  name: 'stats',
  description: `View a player's stats`,
  options: [
    {
      name: 'user',
      description: 'Leave blank to view your own stats',
      type: D.ApplicationCommandOptionType.User,
      required: false,
    },
  ],
  state_schema: {
    user_id: field.String(),
  },
})

export const statsCmd = (app: App) =>
  stats_cmd.onCommand(async ctx => {
    const user_option_value = (
      ctx.interaction.data.options?.find(o => o.name === 'player') as
        | D.APIApplicationCommandInteractionDataStringOption
        | undefined
    )?.value

    ctx.state.save.user_id(
      user_option_value ?? checkGuildInteraction(ctx.interaction).member.user.id,
    )

    return ctx.defer(
      {
        type: D.InteractionResponseType.DeferredChannelMessageWithSource,
        data: {
          flags: D.MessageFlags.Ephemeral,
        },
      },
      async ctx => {
        return void ctx.edit(await userStatsPage(app, ctx))
      },
    )
  })

async function userStatsPage(
  app: App,
  ctx: InteractionContext<typeof stats_cmd>,
): Promise<D.APIInteractionResponseCallbackData> {
  return {
    content: `<@${ctx.state.data.user_id}>`,
  }
}
