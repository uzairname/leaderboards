import {
  ApplicationCommandType,
  InteractionResponseType,
  MessageFlags,
} from 'discord-api-types/v10'

import { CommandView } from '../../../discord/interactions/views'

import { App } from '../../app'

import { syncLeaderboardChannelsMessages } from '../../modules/channels/leaderboard_channels'
import { getOrAddGuild } from '../../modules/guilds'

import { checkMemberBotAdmin } from '../../utils/checks'
import { checkGuildInteraction } from '../../utils/checks'

export const restore_cmd_def = new CommandView({
  type: ApplicationCommandType.ChatInput,
  state_schema: {},
  command: {
    name: 'restore',
    description: 'Restores all channels and messages managed by this bot',
  },
  custom_id_prefix: 'r',
})

export default (app: App) =>
  restore_cmd_def.onCommand(async (ctx) => {
    ctx.offload(async (ctx) => {
      const interaction = checkGuildInteraction(ctx.interaction)
      const guild = await getOrAddGuild(app, interaction.guild_id)

      await checkMemberBotAdmin(interaction.member, guild)

      for (const result of await guild.guildLeaderboards()) {
        await syncLeaderboardChannelsMessages(app, result.guild_leaderboard)
      }

      await ctx.editOriginal({
        content: `done`,
        flags: MessageFlags.Ephemeral,
      })
    })

    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: `Please wait...`,
        flags: MessageFlags.Ephemeral,
      },
    }
  })
