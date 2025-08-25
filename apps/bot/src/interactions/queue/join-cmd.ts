import { CommandSignature, getOptions } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { someoneJoinedQueueMessage, userJoinedQueueMessage } from '../../services/matchmaking/queue/message'
import { userJoinQueue } from '../../services/matchmaking/queue/solo-queue'
import { App } from '../../setup/app'
import { guildRankingsOption, withSelectedRanking } from '../utils'

export const join_cmd_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'join',
  description: `Join a matchmaking queue`,
})

export const join_cmd = join_cmd_sig.set<App>({
  guildSignature: async (app, guild_id) => {
    const guild = app.db.guilds.get(guild_id)
    const guild_rankings = await app.db.guild_rankings.fetch({ guild_id: guild.data.id })
    const queue_enabled_rankings = guild_rankings.filter(r => app.rankings.isQueueEnabled(r.guild_ranking))

    if (queue_enabled_rankings.length == 0) return null

    let options: D.APIApplicationCommandOption[] = []

    // Add an option for 'ranking' based on how many rankings there are in the guild
    options = options.concat(
      await guildRankingsOption(app, guild, 'ranking', {
        available_choices: queue_enabled_rankings.map(r => r.ranking),
      }),
    )

    return new CommandSignature({
      ...join_cmd_sig.config,
      options,
      description:
        queue_enabled_rankings.length == 1
          ? `Join the queue for ${queue_enabled_rankings[0].ranking.data.name}`
          : `Join the matchmaking queue for a ranking`,
    })
  },
  onCommand: async (ctx, app) => {
    const { options } = getOptions(ctx.interaction, {
      ranking: { type: D.ApplicationCommandOptionType.Integer },
    })

    return await withSelectedRanking({ app, ctx, ranking_id: options.ranking }, async p_ranking =>
      ctx.defer(async ctx => {
        const ranking = await p_ranking.fetch()

        const { already_in } = await userJoinQueue(
          app,
          ctx.interaction.member.user.id,
          ctx.interaction.guild_id,
          p_ranking,
        )

        await ctx.edit(userJoinedQueueMessage({ app, already_in, ranking }).response_data)

        // Send a message to the channel where others can join the queue
        if (!already_in) {
          await ctx.send(await someoneJoinedQueueMessage(app, ranking, ctx.interaction.guild_id))
        }
      }),
    )
  },
})
