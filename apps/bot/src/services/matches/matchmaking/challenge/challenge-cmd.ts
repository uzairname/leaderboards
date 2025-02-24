import { CommandSignature, getOptions } from '@repo/discord'
import { nonNullable } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { App } from '../../../../setup/app'
import { guildRankingsOption, withSelectedRanking } from '../../../../utils/view-helpers/ranking-option'
import { getOrAddGuild } from '../../../guilds/manage-guilds'
import { getRegisterPlayer } from '../../../players/manage-players'
import { ensurePlayersEnabled } from '../../management/match-creation'
import { getChallengeEnabledRankings } from '../main'
import { renderChallengePage } from './challenge-view'

const optionnames = {
  opponent: 'opponent',
  ranking: 'ranking',
  best_of: 'best-of',
}

export const challenge_cmd_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: `1v1`,
  description: 'Challenge someone to a 1v1',
})

export const challenge_cmd = challenge_cmd_sig.set<App>({
  guildSignature: async (app, guild_id) => {
    const guild = app.db.guilds.get(guild_id)
    const result = (await getChallengeEnabledRankings(app, guild)).map(i => i.ranking)

    if (result.length == 0) return null

    return new CommandSignature({
      ...challenge_cmd_sig.config,
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
          description: 'Best of how many games? This affects rating calculation',
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
  onCommand: async (ctx, app) =>
    withSelectedRanking(
      app,
      ctx,
      getOptions(ctx.interaction, { ranking: { type: D.ApplicationCommandOptionType.Integer } }).ranking,
      {
        available_guild_rankings: await getChallengeEnabledRankings(
          app,
          await getOrAddGuild(app, ctx.interaction.guild_id),
        ),
      },
      async ranking =>
        ctx.defer(async ctx => {
          const input = getOptions(ctx.interaction, {
            opponent: { type: D.ApplicationCommandOptionType.User, required: true },
            best_of: { type: D.ApplicationCommandOptionType.Integer },
            ranking: { type: D.ApplicationCommandOptionType.Integer },
          })
          input.ranking
          const interaction = ctx.interaction
          const initiator = await getRegisterPlayer(app, interaction.member.user.id, ranking)
          input.opponent

          const opponent_id = nonNullable(
            ctx.interaction.data.options?.find(
              o => o.name === optionnames.opponent,
            ) as D.APIApplicationCommandInteractionDataUserOption,
            'opponent option',
          ).value

          const opponent = await getRegisterPlayer(app, opponent_id, ranking)

          await ensurePlayersEnabled(app, [initiator, opponent])

          const best_of =
            (
              ctx.interaction.data.options?.find(o => o.name === optionnames.best_of) as
                | D.APIApplicationCommandInteractionDataNumberOption
                | undefined
            )?.value ?? 1

          if (opponent_id === initiator.data.user_id) {
            return void ctx.edit({
              content: `You can't 1v1 yourself`,
              flags: D.MessageFlags.Ephemeral,
            })
          }

          await ctx.send(
            await renderChallengePage(app, {
              time_sent: new Date(),
              initiator_id: initiator.data.user_id,
              opponent_id,
              best_of,
              ranking_id: ranking.data.id,
            }),
          )

          return void ctx.edit({
            content: `Challenge sent`,
            flags: D.MessageFlags.Ephemeral,
          })
        }),
    ),
})
