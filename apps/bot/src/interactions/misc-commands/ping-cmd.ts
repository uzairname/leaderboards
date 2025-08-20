import { ContainerBuilder, TextDisplayBuilder } from '@discordjs/builders'
import { CommandSignature } from '@repo/discord'
import { snowflakeToDate } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { request_num } from '../../logging/logger'
import { App } from '../../setup/app'

export const ping_cmd = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'ping',
  description: 'ping!',
}).set<App>({
  onCommand: async (ctx, app) => {
    return ctx.defer(
      async ctx => {
        const bot_latency = app.logger.time_received - snowflakeToDate(BigInt(ctx.interaction.id)).getTime()
        const is_cold_start = request_num === 1

        const db_latency = await app.db.measureLatency()
        const disc_latency = await app.discord.measureApiLatency()

        await ctx.edit({
          components: [
            new ContainerBuilder()
              .addTextDisplayComponents(
                new TextDisplayBuilder({
                  content:
                    `### Pong!` +
                    `\nBot latency: **${bot_latency}ms**` +
                    (is_cold_start ? ` (cold start)` : ``) +
                    `\nApp database latency: **${db_latency}ms**` +
                    `\nDiscord REST API latency: **${disc_latency}ms**`,
                }),
              )
              .toJSON(),
          ],
          flags: D.MessageFlags.IsComponentsV2,
        })
      },
      {
        type: D.InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: `Timing...`,
          flags: D.MessageFlags.Ephemeral,
        },
      },
    )
  },
})
