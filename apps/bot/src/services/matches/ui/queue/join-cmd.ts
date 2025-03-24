import { CommandSignature, getOptions } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { sentry } from '../../../../logging/sentry'
import { App } from '../../../../setup/app'
import { guildRankingsOption, Messages, withSelectedRanking } from '../../../../utils'
import { isQueueEnabled } from '../../../rankings/properties'
import { userJoinQueue } from '../../matchmaking/queue/1v1-queue'

export const join_cmd_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'join',
  description: `Join a matchmaking queue`,
})

export const join_cmd = join_cmd_sig.set<App>({
  guildSignature: async (app, guild_id) => {
    const guild = app.db.guilds.get(guild_id)
    const guild_rankings = await app.db.guild_rankings.fetchBy({ guild_id: guild.data.id })
    const queue_enabled_rankings = guild_rankings.filter(r => isQueueEnabled(r.guild_ranking))

    sentry.debug(
      `queue_enabled_rankings in ${guild.data.id}: ${queue_enabled_rankings.length}, ${queue_enabled_rankings.map(r => r.ranking.data.name)}`,
    )

    if (queue_enabled_rankings.length == 0) return null

    let options: D.APIApplicationCommandOption[] = []

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
    const input = getOptions(ctx.interaction, {
      ranking: { type: D.ApplicationCommandOptionType.Integer },
    })

    return await withSelectedRanking({ app, ctx, ranking_id: input.ranking }, async p_ranking =>
      ctx.defer(async ctx => {
        const ranking = await p_ranking.fetch()

        const { new_match, already_in, expires_at } = await userJoinQueue(app, ctx, p_ranking)

        await ctx.edit({
          content: Messages.queue_join({ match: new_match, already_in, ranking, expires_at }),
          flags: D.MessageFlags.Ephemeral,
        })

        // Send a message to the channel where others can join the queue
        if (!already_in && !new_match) {
          await ctx.send(await Messages.someone_joined_queue(app, ranking, ctx.interaction.guild_id))
        }
        
      })
    )
  },
})
