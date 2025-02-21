import { CommandView, getOptions } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { GuildCommand } from '../../../../../classes/ViewModule'
import { Messages } from '../../../../../ui-helpers/messages'
import { guildRankingsOption, withSelectedRanking } from '../../../../../ui-helpers/ranking-option'
import { userJoinQueue } from '../1v1-queue'

export const join_cmd_config = new CommandView({
  type: D.ApplicationCommandType.ChatInput,
  name: 'join',
  description: `Join the matchmaking queue for a ranking`,
})

export default new GuildCommand(
  join_cmd_config,
  async (app, guild) => {
    let options: D.APIApplicationCommandOption[] = []

    options = options.concat(await guildRankingsOption(app, guild, 'ranking', {}))

    return new CommandView({
      ...join_cmd_config.config,
      options,
    })
  },
  app =>
    join_cmd_config.onCommand(async ctx => {
      return ctx.defer(
        {
          type: D.InteractionResponseType.DeferredChannelMessageWithSource,
          data: { flags: D.MessageFlags.Ephemeral },
        },
        async ctx => {
          const input = getOptions(ctx.interaction, {
            ranking: { type: D.ApplicationCommandOptionType.Integer },
          })

          await withSelectedRanking(app, ctx, input.ranking, {}, async p_ranking => {
            const ranking = await p_ranking.fetch()

            const { match, already_in, expires_at } = await userJoinQueue(app, ctx, p_ranking)

            await ctx.edit({
              content: Messages.queue_join({ match, already_in, ranking, expires_at }),
              flags: D.MessageFlags.Ephemeral,
            })

            // Send a message to the channel where others can join the queue
            if (!already_in && !match) {
              await ctx.send(
                await Messages.someone_joined_queue(app, ranking, ctx.interaction.guild_id),
              )
            }
          })
        },
      )
    }),
)
