import { messageLink } from '@discordjs/builders'
import { CommandSignature, getOptions } from '@repo/discord'
import { cleanString, intOrNull, intToOrdinal, snowflakeToDate } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { OutcomeType } from '../../../../../packages/db/src/models/matches'
import { App } from '../../setup/app'
import { guildRankingsOption, withSelectedRanking } from '../utils'
import { escapeMd } from '../../services/utils/strings'
import { Ranking } from '../../../../../packages/db/src/models/rankings'
import { UserErrors } from '../../errors/user-errors'
import { matchSummaryEmbed } from '../view-matches/view'

export const record_match_cmd_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'gg',
  description: 'record a match',
})

const optionnames = {
  ranking: 'ranking',
  winner: 'winner',
  time_finished: 'when',
}



function commandOptionsForRanking(app: App, ranking: Ranking): D.APIApplicationCommandSubcommandOption | null {

  const props = app.rankings.getProperties(ranking)

  let options: D.APIApplicationCommandBasicOption[] = [
  ]

  const is_team = props.players_per_team > 1

  if (props.match_settings.outcome_type === OutcomeType.WinLossDraw) {

    options.push(
      is_team ? {
        name: optionnames.winner,
        description: `The winning team of the match`,
        type: D.ApplicationCommandOptionType.String,
        required: true
      }
        : {
          name: optionnames.winner,
          description: `The winner of the match`,
          type: D.ApplicationCommandOptionType.User,
          required: true
        }
    )

    for (let i = 1; i < props.teams_per_match; i++) {
      options.push(
        {
          name: `loser` + (props.teams_per_match > 2 ? `_${i}` : ``),
          description: `The loser of the match`,
          type: D.ApplicationCommandOptionType.Mentionable,
          required: true
        }
      )
    }

    if (props.match_settings.draws_allowed) {
      options.push({
        name: `draw`,
        description: `Sets the match as a draw (regardless of the winner/loser you selected)`,
        type: D.ApplicationCommandOptionType.String,
        choices: [
          { name: 'yes', value: 'yes' },
        ],
        required: false,
      })
    }
  } else if (props.match_settings.outcome_type === OutcomeType.Points) {
    for (let i = 0; i < props.teams_per_match; i++) {

      options.push(
        is_team ? {
          name: `team_${i + 1}`,
          description: `The players in team ${i + 1}`,
          type: D.ApplicationCommandOptionType.String,
          required: true
        } : {
          name: `player_${i + 1}`,
          description: `Player ${i + 1}`,
          type: D.ApplicationCommandOptionType.User,
          required: true
        }
      )

      options.push({
        name: `score_${i + 1}`,
        description: `Score of ${is_team ? `team` : `player`} ${i + 1}`,
        type: D.ApplicationCommandOptionType.Integer,
        required: true
      })
    }
  } else if (props.match_settings.outcome_type === OutcomeType.Ranks) {

    for (let i = 0; i < props.teams_per_match; i++) {

      options.push({
        name: `${intToOrdinal(i + 1)}_place`,
        description: is_team ? `The team who came in ${intToOrdinal(i + 1)}` : `The player who came in ${i + 1}`,
        type: D.ApplicationCommandOptionType.String,
        required: true
      })

    }
  }

  options = options.concat([
    {
      name: optionnames.time_finished,
      description: 'Snowflake or Unix timestamp of when the match was finished (default now)',
      type: D.ApplicationCommandOptionType.String,
    },
  ])

  return {
    type: D.ApplicationCommandOptionType.Subcommand,
    name: cleanString(ranking.data.name),
    description: `Record a match in ${ranking.data.name}`,
    options
  }
}


/**
 * Converts a string that could potentially be a snowflake or unix timestamp to a Date
 * Returns undefined if the string is undefined or not a valid number
 */
function getSelectedTimeFinished(selected: string | undefined): Date | undefined {
  const selected_time_finished = intOrNull(selected)
  if (null !== selected_time_finished) {
    if (selected_time_finished.toString().length < 13) {
      // assume it's a unix timestamp
      return new Date(selected_time_finished * 1000)
    } else {
      // assume it's a snowflake
      return snowflakeToDate(BigInt(selected_time_finished))
    }
  }
  return undefined
}



async function parseCommandOptions(app: App, interaction: D.APIGuildInteractionWrapper<D.APIChatInputApplicationCommandInteraction>) {

}


/**
 * Records a match with Win/Loss/Draw outcome type based on provided inputs
 */
async function recordMatchWinLossDraw(
  app: App,
  ranking: Ranking,
  winning_team_ids: string[],
  losing_team_ids: string[][],
  selected_time_finished: Date | undefined,
  is_draw: boolean
) {
  const props = app.rankings.getProperties(ranking)

  return app.matches.createFinished({
    app,
    ranking,
    players: await Promise.all([winning_team_ids, ...losing_team_ids].map(team => Promise.all(team.map(id => app.players.getOrCreatePlayerByUser(app, id, ranking))))),
    outcome: { type: OutcomeType.WinLossDraw, team_scores: is_draw ? Array(props.teams_per_match).fill(0.5) : [1, ...Array(props.teams_per_match - 1).fill(0)] },
    time_finished: selected_time_finished,
  })

}



export const record_match_cmd = record_match_cmd_sig.set<App>({
  guildSignature: async (app, guild_id) => {
    const guild = app.db.guilds.get(guild_id)
    const rankings = await app.db.guild_rankings.fetch({ guild_id: guild.data.id })
    if (rankings.length == 0) return null

    const options: D.APIApplicationCommandSubcommandOption[] = rankings.map(r => {
      const props = app.rankings.getProperties(r.ranking)
      if (props.match_settings.outcome_type !== OutcomeType.WinLossDraw) return null // Currently only Win/Loss/Draw is supported
      return commandOptionsForRanking(app, r.ranking)
    }).filter((o): o is D.APIApplicationCommandSubcommandOption => o !== null)

    return new CommandSignature({
      ...record_match_cmd_sig.config,
      options,
    })
  },
  onCommand: async (ctx, app) => {

    const interaction = ctx.interaction

    const { subcommand: ranking_name } = getOptions(interaction, {})
    if (!ranking_name) throw new Error(`No ranking specified`)

    // Find the ranking by name
    const ranking = await app.db.guild_rankings.fetch({ guild_id: interaction.guild_id }).then(r => {
      console.log('Available rankings:', r.map(r => cleanString(r.ranking.data.name)))
      console.log('Looking for ranking:', cleanString(ranking_name))
      return r.find(r => cleanString(r.ranking.data.name) === cleanString(ranking_name))
    })

    if (!ranking) throw new Error(`Ranking '${ranking_name}' not found`)

    const props = app.rankings.getProperties(ranking.ranking)

    const is_team = props.players_per_team > 1

    if (props.match_settings.outcome_type === OutcomeType.WinLossDraw) {

      const { options: { time_finished, draw } } = getOptions(interaction, {
        time_finished: { type: D.ApplicationCommandOptionType.String, name: optionnames.time_finished },
        draw: { type: D.ApplicationCommandOptionType.String, name: 'draw' },
      })

      const selected_time_finished = getSelectedTimeFinished(time_finished)
      const is_draw = draw === 'yes'

      const { winner_ids, loser_ids } = (() => {

        if (is_team) {
          // If the ranking is team based, the options will be strings containing multiple mentions
          const { options: { winner } } = getOptions(interaction, {
            winner: { type: D.ApplicationCommandOptionType.String, name: optionnames.winner, required: true },
          })

          const winner_mentions = winner.match(/<@&?\d+>/g) || []
          if (winner_mentions.length === 0) throw new UserErrors.ValidationError(`Winning team must contain at least one user mention`)
          const winner_ids = winner_mentions.map(m => m.replace(/[<@&>]/g, ''))

          // Get loser options
          const loser_teams: string[][] = []
          for (let i = 1; i < props.teams_per_match; i++) {
            const loser_option_value = (interaction.data.options?.[0] as D.APIApplicationCommandInteractionDataSubcommandOption).options?.find(o => o.name === `loser` + (props.teams_per_match > 2 ? `_${i}` : ``)) as D.APIApplicationCommandInteractionDataStringOption | undefined
            if (!loser_option_value) throw new Error(`Missing loser option`)
            const loser_mentions = loser_option_value.value.match(/<@&?\d+>/g) || []
            loser_teams.push(loser_mentions)
          }

          return { winner_ids: winner_ids, loser_ids: loser_teams }

        } else {
          // If the ranking is player based, the options will be users
          const { options: { winner } } = getOptions(interaction, {
            winner: { type: D.ApplicationCommandOptionType.User, name: optionnames.winner, required: true },
          })

          // Get loser options
          const losers: D.APIUser[] = []
          for (let i = 1; i < props.teams_per_match; i++) {
            const loser_option_value = (interaction.data.options?.[0] as D.APIApplicationCommandInteractionDataSubcommandOption).options?.find(o => o.name === `loser` + (props.teams_per_match > 2 ? `_${i}` : ``)) as D.APIApplicationCommandInteractionDataUserOption | undefined
            if (!loser_option_value || !interaction.data.resolved?.users?.[loser_option_value.value]) throw new Error(`Missing loser option`)
            losers.push(interaction.data.resolved?.users?.[loser_option_value.value])
          }

          return { winner_ids: [winner.id], loser_ids: losers.map(u => [u.id]) }
        }

      })()

      return ctx.defer(async ctx => {
        const match = await recordMatchWinLossDraw(
          app,
          ranking.ranking,
          winner_ids,
          loser_ids,
          selected_time_finished,
          is_draw
        )

        const match_summary_message = await matchSummaryEmbed(app, match)

        return void (await ctx.edit({
          embeds: [match_summary_message],
          flags: D.MessageFlags.Ephemeral,
        }))
      })

    } else {
      throw new UserErrors.ValidationError(`Currently only Win/Loss/Draw matches are supported`)
    }



    // /**
    //  * If the ranking is 1v1 all the required options are provided, record the match.
    //  * If not, open a menu to select the teams
    //  *
    //  * If the user is admin, skip the confirmation step
    //  */

    // // const state = record_match_view_sig.newState({})

    // // Save the selected time finished to the state, if specified

    // let selected_time_finished_date: Date | undefined


    // return withSelectedRanking(
    //   {
    //     app,
    //     ctx,
    //     ranking_id: options.ranking,
    //   },
    //   async p_ranking =>
    //     ctx.defer(async ctx => {
    //       const ranking = await p_ranking.fetch()

    //       // If this is a 1v1 ranking, check if the winner and loser were specified
    //       if (ranking.data.players_per_team == 1 && ranking.data.teams_per_match == 2) {
    //         if (options.winner && options.loser) {
    //           const winner = await app.players.getOrCreatePlayer({
    //             app,
    //             auth: ctx.interaction,
    //             user: options.winner.user,
    //             role: options.winner.role
    //               ? {
    //                 id: options.winner.role?.id,
    //                 guild_id: ctx.interaction.guild_id,
    //               }
    //               : undefined,
    //             ranking,
    //           })
    //           const loser = await app.players.getOrCreatePlayer({
    //             app,
    //             auth: ctx.interaction,
    //             user: options.loser.user,
    //             role: options.loser.role
    //               ? {
    //                 id: options.loser.role?.id,
    //                 guild_id: ctx.interaction.guild_id,
    //               }
    //               : undefined,
    //             ranking,
    //           })

    //           const match = await app.matches.createFinished(
    //             app,
    //             ranking,
    //             [[winner], [loser]].map(team => team),
    //             { type: OutcomeType.WinLossDraw, team_scores: [1, 0] },
    //             undefined,
    //             selected_time_finished_date,
    //           )

    //           const match_summary_message = await match.summaryMessage(ctx.interaction.guild_id)

    //           return void (await ctx.edit({
    //             content:
    //               `Match #${match.data.number} in ${ranking.data.name} recorded.` +
    //               (match_summary_message
    //                 ? ` ${messageLink(
    //                   match_summary_message.channel_id,
    //                   match_summary_message.message_id,
    //                   match_summary_message.guild_id,
    //                 )}`
    //                 : ``),
    //             flags: D.MessageFlags.Ephemeral,
    //           }))
    //         } else {
    //           return void (await ctx.edit({
    //             content: `Please specify both the winner and loser of the match.`,
    //             flags: D.MessageFlags.Ephemeral,
    //           }))
    //         }
    //       }
    //     }),
    // )
  },
})
