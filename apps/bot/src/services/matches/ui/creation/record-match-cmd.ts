import {
  ChatInteractionResponse,
  checkGuildMessageComponentInteraction,
  CommandSignature,
  ComponentContext,
  Context,
  DeferredComponentContext,
  getOptions,
  StateContext,
} from '@repo/discord'
import { assert, intOrUndefined, nonNullable, snowflakeToDate } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { UserError } from '../../../../errors/user-errors'
import { App } from '../../../../setup/app'
import { Colors, ensureAdminPerms, hasAdminPerms } from '../../../../utils'
import { escapeMd, messageLink, relativeTimestamp } from '../../../../utils/ui'
import { guildRankingsOption, withSelectedRanking } from '../../../../utils/ui/view-helpers/ranking-option'
import { numRankings } from '../../../guilds/properties'
import { getOrCreatePlayer, getOrCreatePlayerByUser } from '../../../players/manage'
import { matchSummaryEmbed } from '../../logging/match-summary-message'
import { recordAndScoreMatch } from '../../management/create-matches'

export const record_match_cmd_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'record-match',
  description: 'record a match',
})

const optionnames = {
  ranking: 'ranking',
  winner: 'winner',
  loser: 'loser',
  time_finished: 'when',
}

export const record_match_cmd = record_match_cmd_sig.set<App>({
  guildSignature: async (app, guild_id) => {
    const guild = app.db.guilds.get(guild_id)
    const rankings = await app.db.guild_rankings.fetchBy({ guild_id: guild.data.id })
    if (rankings.length == 0) return null

    let options = await guildRankingsOption(
      app,
      guild,
      optionnames.ranking,
      {},
      'Which ranking should this match belong to',
    )

    // If all rankings are a 1v1, add options for winner and loser
    if (rankings.every(r => r.ranking.data.players_per_team == 1 && r.ranking.data.teams_per_match == 2)) {
      options = options.concat([
        {
          name: optionnames.winner,
          description: 'Who won (if applicable)',
          type: D.ApplicationCommandOptionType.Mentionable,
        },
        {
          name: optionnames.loser,
          description: 'Who lost (if applicable)',
          type: D.ApplicationCommandOptionType.Mentionable,
        }])
    }

    options = options.concat([{
      name: optionnames.time_finished,
      description: 'Snowflake or Unix timestamp of when the match was finished (default now)',
      type: D.ApplicationCommandOptionType.String,
    }])

    return new CommandSignature({
      ...record_match_cmd_sig.config,
      options,
    })
  },
  onCommand: (ctx, app) => {
    /**
     * If the ranking is 1v1 all the required options are provided, record the match.
     * If not, open a menu to select the teams
     *
     * If the user is admin, skip the confirmation step
     */

    const input = getOptions(ctx.interaction, {
      ranking: { type: D.ApplicationCommandOptionType.Integer, name: optionnames.ranking },
      winner: { type: D.ApplicationCommandOptionType.Mentionable, name: optionnames.winner },
      loser: { type: D.ApplicationCommandOptionType.Mentionable, name: optionnames.loser },
      time_finished: { type: D.ApplicationCommandOptionType.String, name: optionnames.time_finished },
    })

    // const state = record_match_view_sig.newState({})

    // Save the selected time finished to the state, if specified
    const selected_time_finished = intOrUndefined(input.time_finished)
    let selected_time_finished_date: Date | undefined
    if (selected_time_finished !== undefined) {
      if (selected_time_finished.toString().length < 13) {
        // assume it's a unix timestamp
        selected_time_finished_date = new Date(selected_time_finished * 1000)
      } else {
        // assume it's a snowflake
        selected_time_finished_date = snowflakeToDate(BigInt(selected_time_finished))
      }
    }

    return withSelectedRanking(
      {
        app,
        ctx,
        ranking_id: input.ranking,
      },
      async p_ranking =>
        ctx.defer(async ctx => {
          const ranking = await p_ranking.fetch()

          // If this is a 1v1 ranking, check if the winner and loser were specified            
          if (ranking.data.players_per_team == 1 && ranking.data.teams_per_match == 2) {
            
            if (input.winner && input.loser) {
              const winner = await getOrCreatePlayer({app, user: input.winner.user, role: input.winner.role ? {
                id: input.winner.role?.id,
                guild_id: ctx.interaction.guild_id,
              } : undefined, ranking})
              const loser = await getOrCreatePlayer({app, user: input.loser.user, role: input.loser.role ? {
                id: input.loser.role?.id,
                guild_id: ctx.interaction.guild_id,
              } : undefined, ranking})

              await ensureAdminPerms(app, ctx)
              
              const match = await recordAndScoreMatch(
                app,
                ranking,
                [[winner], [loser]].map(team =>
                  team.map(p => ({
                    player: p,
                    ...p.data,
                  })),
                ),
                [1, 0],
                undefined,
                selected_time_finished_date,
              )

              const match_summary_message = await match.summaryMessage(ctx.interaction.guild_id)

              return void ctx.edit({
                content:
                  `Match #${match.data.number} in ${ranking.data.name} recorded.` +
                  (match_summary_message
                    ? ` ${messageLink(
                        match_summary_message.guild_id,
                        match_summary_message.channel_id,
                        match_summary_message.message_id,
                      )}`
                    : ``),
                flags: D.MessageFlags.Ephemeral,
              })
              
            }
          }
        })
    )
  },
})
