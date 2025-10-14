import { CommandSignature } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { App } from '../../setup/app'

export const vote_cmd_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'vote',
  description: 'submit results for your ongoing match',
})

export const vote_cmd = vote_cmd_sig.set<App>({
  // guildSignature(app, guild_id) {
  //   const guild_rankings = await app.db.guild_rankings.fetch({ guild_id: guild_id })
  //   if (guild_rankings.length == 0) return null

  // return new CommandSignature({
  //   ...vote_cmd_sig,
  //   options:
  // })

  // },

  onCommand: async (ctx, app) => {
    return ctx.defer(async ctx => {})
  },
})
