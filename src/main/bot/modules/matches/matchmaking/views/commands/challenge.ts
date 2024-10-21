import * as D from 'discord-api-types/v10'
import { AppCommand } from '../../../../../../../discord-framework'
import { App } from '../../../../../../context/app_context'
import { AppView } from '../../../../../utils/view_module'
import { guildRankingsOption, withSelectedRanking } from '../../../../utils/ranking_command_option'

const challenge_cmd_signature = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  custom_id_prefix: 'c',
  name: 'challenge',
  description: 'challenge someone to a 1v1',
})

const ranking_option_name = 'ranking'

const challengeCommandInGuild = async (app: App, guild_id: string) => {
  let options: D.APIApplicationCommandOption[] = [
    {
      type: D.ApplicationCommandOptionType.User,
      name: 'opponent',
      description: 'Who to challenge',
    },
  ]

  options = options.concat(await guildRankingsOption(app, guild_id, ranking_option_name, false))

  return new AppCommand({
    ...challenge_cmd_signature.options,
    options,
  })
}

const challengeCommand = (app: App) =>
  challenge_cmd_signature.onCommand(async ctx =>
    withSelectedRanking(app, ctx, ranking_option_name, async ranking =>
      ctx.defer(
        {
          type: D.InteractionResponseType.DeferredChannelMessageWithSource,
          data: { flags: D.MessageFlags.Ephemeral },
        },
        async ctx => {
          await app.bot.createMessage(ctx.interaction.channel.id, {})
        },
      ),
    ),
  )

export default new AppView(challengeCommand, challengeCommandInGuild)
