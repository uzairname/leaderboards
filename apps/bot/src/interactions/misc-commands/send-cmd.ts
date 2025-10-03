import { CommandSignature, getOptions } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { App } from '../../setup/app'
import { queueMessage, queue_view_sig } from '../queue/view'

export const send_cmd_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'send',
  description: 'Send a message to this channel',
})

export const scnames = {
  queue_message: 'queue_button',
}

export const send_cmd = send_cmd_sig.set<App>({
  guildSignature: async (app, guild_id) => {
    const guild = await app.db.guilds.fetch(guild_id)
    if (!guild) return null

    const guild_rankings = await app.db.guild_rankings.fetch({ guild_id: guild.data.id })

    if (guild_rankings.length === 0) return null

    const ranking_choices: D.APIApplicationCommandOptionChoice<number>[] = []

    for (const r of guild_rankings) {
      if (app.rankings.getProperties(r.ranking).matchmaking_settings.queue_enabled) {
        ranking_choices.push({
          name: r.ranking.data.name,
          value: r.ranking.data.id,
        })
      }
    }

    function makeSubcommand(name: string, description: string): D.APIApplicationCommandOption {
      return {
        type: D.ApplicationCommandOptionType.Subcommand,
        name,
        description,
        options: [
          {
            type: D.ApplicationCommandOptionType.Integer,
            name: 'ranking',
            description: 'Select the ranking for which to send the message for',
            choices: ranking_choices,
            required: true,
          },
        ],
      }
    }

    return new CommandSignature({
      ...send_cmd_sig.config,
      options: [makeSubcommand(scnames.queue_message, 'Send a button that players can click to join the queue')],
    })
  },
  onCommand: async (ctx, app) => {
    return ctx.defer(async ctx => {
      const { options, subcommand } = getOptions(ctx.interaction, {
        ranking_id: { type: D.ApplicationCommandOptionType.Integer, required: true, name: 'ranking' },
      })

      if (subcommand === scnames.queue_message) {
        const queue_msg = await queueMessage(
          app,
          queue_view_sig.newState({
            ranking_id: options.ranking_id,
          }),
        )
        await ctx.send(queue_msg.response_data)
      }

      await ctx.delete()
    })
  },
})
