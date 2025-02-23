import { CommandSignature, getOptions } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { App } from '../../../../../setup/app'
import { Messages } from '../../../../../utils'
import { guildRankingsOption, withSelectedRanking } from '../../../../../utils/view-helpers/ranking-option'
import { isQueueEnabled } from '../../../../rankings/ranking-properties'
import { userJoinQueue } from '../1v1-queue'

export const join_cmd_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'join',
  description: `Join the matchmaking queue for a ranking`,
})

export const join_cmd = join_cmd_sig.set<App>({
  guildSignature: async (app, guild_id) => {
    const guild = app.db.guilds.get(guild_id)
    const guild_rankings = await app.db.guild_rankings.getBy({ guild_id: guild.data.id })
    const queue_enabled_rankings = guild_rankings.filter(r => isQueueEnabled(r.guild_ranking))

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
    })
  },
  onCommand: async (ctx, app) => {
    return ctx.defer(async ctx => {
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
            await ctx.send(await Messages.someone_joined_queue(app, ranking, ctx.interaction.guild_id))
          }
        })
      },
    )
  },
})
