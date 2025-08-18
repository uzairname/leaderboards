import { CommandSignature, getOptions } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { App } from '../../../../setup/app'
import { guildRankingsOption, withSelectedRanking } from '../../../../utils/ui/view-helpers/ranking-option'
import { getOrAddGuild } from '../../../guilds/manage-guilds'
import { getOrCreatePlayerByUser } from '../../../players/manage'
import { getChallengeEnabledRankings } from '../../../rankings/properties'
import { ensurePlayersEnabled } from '../../management/create-matches'
import { renderChallengePage } from './view'

const optionnames = {
  opponent: 'opponent',
  ranking: 'ranking',
  best_of: 'best-of',
}

export const challenge_1v1_cmd_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: `1v1`,
  description: 'Challenge someone to a 1v1',
})

export const challenge_1v1_cmd = challenge_1v1_cmd_sig.set<App>({
  guildSignature: async (app, guild_id) => {
    const guild = app.db.guilds.get(guild_id)
    const result = (await getChallengeEnabledRankings(app, guild)).map(i => i.ranking)

    if (result.length == 0) return null

    return new CommandSignature({
      ...challenge_1v1_cmd_sig.config,
      options: (
        [
          {
            type: D.ApplicationCommandOptionType.User,
            name: optionnames.opponent,
            description: 'Who to challenge',
            required: true,
          },
        ] as D.APIApplicationCommandOption[]
      )
        .concat(await guildRankingsOption(app, guild, optionnames.ranking, { available_choices: result }))
        .concat({
          type: D.ApplicationCommandOptionType.Integer,
          name: optionnames.best_of,
          description: 'Best of how many games?',
          required: false,
          choices: [
            { name: '1', value: 1 },
            { name: '3', value: 3 },
            { name: '5', value: 5 },
            { name: '7', value: 7 },
          ],
        }),
    })
  },
  onCommand: async (ctx, app) => {
    const { options } = getOptions(ctx.interaction, {
      opponent: { type: D.ApplicationCommandOptionType.User, required: true },
      best_of: { type: D.ApplicationCommandOptionType.Integer, required: false },
      ranking: { type: D.ApplicationCommandOptionType.Integer },
    })

    const challenge_enabled_rankings = await getChallengeEnabledRankings(
      app,
      await getOrAddGuild(app, ctx.interaction.guild_id),
    )

    return withSelectedRanking(
      {
        app,
        ctx,
        ranking_id: options.ranking,
        available_guild_rankings: challenge_enabled_rankings,
      },
      async ranking =>
        ctx.defer(async ctx => {
          const interaction = ctx.interaction
          const initiator = await getOrCreatePlayerByUser(app, interaction.member.user.id, ranking)

          const opponent_id = options.opponent.id

          const opponent = await getOrCreatePlayerByUser(app, opponent_id, ranking)

          await ensurePlayersEnabled(app, [initiator, opponent])

          await ctx.send(
            await renderChallengePage(app, {
              time_sent: new Date(),
              initiator_id: initiator.data.user_id,
              opponent_id,
              best_of: options.best_of,
              ranking_id: ranking.data.id,
            }),
          )

          return void (await ctx.edit({
            content: `Challenge sent`,
            flags: D.MessageFlags.Ephemeral,
          }))
        }),
    )
  },
})
