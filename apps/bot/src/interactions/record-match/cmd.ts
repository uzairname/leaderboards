import { CommandSignature, getOptions } from '@repo/discord'
import { cleanString, intOrNull, intToOrdinal, snowflakeToDate } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { MatchOutcome, OutcomeType } from '../../../../../packages/db/src/models/matches'
import { Ranking } from '../../../../../packages/db/src/models/rankings'
import { UserErrors } from '../../errors/user-errors'
import { App } from '../../setup/app'
import { matchSummaryEmbed } from '../matches/view'

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

/**
 * Determines the subcommand option for the record match command for a given ranking.
 */
function getRecordMatchSubcommandCommandOption(app: App, ranking: Ranking): D.APIApplicationCommandSubcommandOption {
  const props = app.rankings.getProperties(ranking)

  let options: D.APIApplicationCommandBasicOption[] = []

  const is_team = props.players_per_team > 1

  if (props.match_settings.outcome_type === OutcomeType.WinLossDraw) {
    options.push(
      is_team
        ? {
          name: optionnames.winner,
          description: `The winning team of the match`,
          type: D.ApplicationCommandOptionType.String,
          required: true,
        }
        : {
          name: optionnames.winner,
          description: `The winner of the match`,
          type: D.ApplicationCommandOptionType.User,
          required: true,
        },
    )

    for (let i = 1; i < props.teams_per_match; i++) {
      options.push(is_team ? {
        name: `loser` + (props.teams_per_match > 2 ? `_${i}` : ``),
        description: `The loser of the match`,
        type: D.ApplicationCommandOptionType.String,
        required: true,
      } : {
        name: `loser` + (props.teams_per_match > 2 ? `_${i}` : ``),
        description: `The loser of the match`,
        type: D.ApplicationCommandOptionType.User,
        required: true,
      })
    }

    if (props.match_settings.draws_allowed) {
      options.push({
        name: `draw`,
        description: `Sets the match as a draw (regardless of the winner/loser you selected)`,
        type: D.ApplicationCommandOptionType.String,
        choices: [{ name: 'yes', value: 'yes' }],
        required: false,
      })
    }
  } else if (props.match_settings.outcome_type === OutcomeType.Points) {
    for (let i = 0; i < props.teams_per_match; i++) {
      options.push(
        is_team
          ? {
            name: `team_${i + 1}`,
            description: `The players in team ${i + 1}`,
            type: D.ApplicationCommandOptionType.String,
            required: true,
          }
          : {
            name: `player_${i + 1}`,
            description: `Player ${i + 1}`,
            type: D.ApplicationCommandOptionType.User,
            required: true,
          },
      )

      options.push({
        name: `score_${i + 1}`,
        description: `Score of ${is_team ? `team` : `player`} ${i + 1}`,
        type: D.ApplicationCommandOptionType.Integer,
        required: true,
      })
    }
  } else if (props.match_settings.outcome_type === OutcomeType.Ranks) {
    for (let i = 0; i < props.teams_per_match; i++) {
      options.push(is_team ? {
        name: `${intToOrdinal(i + 1)}_place`,
        description: `The team who came in ${intToOrdinal(i + 1)} place`,
        type: D.ApplicationCommandOptionType.String,
        required: true,
      } : {
        name: `${intToOrdinal(i + 1)}_place`,
        description: `The player who came in ${i + 1} place`,
        type: D.ApplicationCommandOptionType.User,
        required: true,
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
    options,
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


/**`
 * Parses the inputs to the record match command and returns the selected players and outcome
 * Is based on the 
 * @param interaction The interaction object from Discord
 * @param ranking The ranking the match is being recorded for
 * @returns An object containing the players and outcome of the match
 */
async function getPlayersAndOutcome(app: App, interaction: D.APIChatInputApplicationCommandGuildInteraction, ranking: Ranking): Promise<{
  players: string[][]
  outcome: MatchOutcome
}> {

  const props = app.rankings.getProperties(ranking)

  const is_team = props.players_per_team > 1

  if (props.match_settings.outcome_type === OutcomeType.WinLossDraw) {

    const {
      options: { draw },
    } = getOptions(interaction, {
      draw: { type: D.ApplicationCommandOptionType.String, name: 'draw' },
    })

    const is_draw = draw === 'yes'

    const { winner_ids, loser_ids } = (() => {
      if (is_team) {
        // If the ranking is team based, the options will be strings containing multiple mentions
        const {
          options: { winner },
        } = getOptions(interaction, {
          winner: { type: D.ApplicationCommandOptionType.String, name: optionnames.winner, required: true },
        })

        const winner_mentions = winner.match(/<@&?\d+>/g) || []
        if (winner_mentions.length === 0)
          throw new UserErrors.ValidationError(`Winning team must contain at least one user mention`)
        const winner_ids = winner_mentions.map(m => m.replace(/[<@&>]/g, ''))

        // Get loser options
        const loser_teams: string[][] = []
        for (let i = 1; i < props.teams_per_match; i++) {
          const loser_option_value = (
            interaction.data.options?.[0] as D.APIApplicationCommandInteractionDataSubcommandOption
          ).options?.find(o => o.name === `loser` + (props.teams_per_match > 2 ? `_${i}` : ``)) as
            | D.APIApplicationCommandInteractionDataStringOption
            | undefined
          if (!loser_option_value) throw new Error(`Missing loser option`)
          const loser_mentions = loser_option_value.value.match(/<@&?\d+>/g) || []
          loser_teams.push(loser_mentions)
        }

        return { winner_ids: winner_ids, loser_ids: loser_teams }
      } else {
        // If the ranking is player based, the options will be users
        const {
          options: { winner },
        } = getOptions(interaction, {
          winner: { type: D.ApplicationCommandOptionType.User, name: optionnames.winner, required: true },
        })

        // Get loser options
        const losers: D.APIUser[] = []
        for (let i = 1; i < props.teams_per_match; i++) {
          const loser_option_value = (
            interaction.data.options?.[0] as D.APIApplicationCommandInteractionDataSubcommandOption
          ).options?.find(o => o.name === `loser` + (props.teams_per_match > 2 ? `_${i}` : ``)) as
            | D.APIApplicationCommandInteractionDataUserOption
            | undefined
          if (!loser_option_value || !interaction.data.resolved?.users?.[loser_option_value.value])
            throw new Error(`Missing loser option`)
          losers.push(interaction.data.resolved?.users?.[loser_option_value.value])
        }

        return { winner_ids: [winner.id], loser_ids: losers.map(u => [u.id]) }
      }
    })()

    return {
      players: [winner_ids, ...loser_ids],
      outcome: {
        type: OutcomeType.WinLossDraw,
        team_scores: is_draw ? Array(props.teams_per_match).fill(0.5) : [1, ...Array(props.teams_per_match - 1).fill(0)],
      },
    }
  } else if (props.match_settings.outcome_type === OutcomeType.Ranks) {
    // The input contains the teams/players in order of their rank


    const team_options = (
      interaction.data.options?.[0] as D.APIApplicationCommandInteractionDataSubcommandOption
    ).options

    const team_player_ids: string[][] = []

    // Obtain the team player ids, from 1st place to last.
    for (let i = 0; i < props.teams_per_match; i++) {
      const team_option_value = team_options?.find(o => o.name === `${intToOrdinal(i + 1)}_place`)
      if (!team_option_value) throw new Error(`Missing ${intToOrdinal(i + 1)}_place option`)
      if (is_team) {
        const team_mentions = (team_option_value as D.APIApplicationCommandInteractionDataStringOption).value.match(/<@&?\d+>/g) || []
        team_player_ids.push(team_mentions.map(m => m.replace(/<@&?(\d+)>/, '$1')))
      } else {
        team_player_ids.push([(team_option_value as D.APIApplicationCommandInteractionDataUserOption).value])
      }
    }

    return {
      players: team_player_ids,
      outcome: {
        type: OutcomeType.Ranks,
        team_scores: team_player_ids.map((_, i) => i + 1), // Scores are just the ranks 1, 2, 3, ...
      },
    }

  } else if (props.match_settings.outcome_type === OutcomeType.Points) {
    // The input contains the teams/players and their scores

    const options = (
      interaction.data.options?.[0] as D.APIApplicationCommandInteractionDataSubcommandOption
    ).options

    const team_player_ids: string[][] = []

    // Obtain the team player ids
    for (let i = 0; i < props.teams_per_match; i++) {
      const team_option_value = options?.find(o => o.name === (is_team ? `team_${i + 1}` : `player_${i + 1}`))
      if (!team_option_value) throw new Error(`Missing ${is_team ? `team` : `player`}_${i + 1} option`)
      if (is_team) {
        const team_mentions = (team_option_value as D.APIApplicationCommandInteractionDataStringOption).value.match(/<@&?\d+>/g) || []
        team_player_ids.push(team_mentions.map(m => m.replace(/<@&?(\d+)>/, '$1')))
      } else {
        team_player_ids.push([(team_option_value as D.APIApplicationCommandInteractionDataUserOption).value])
      }
    }

    const team_scores: number[] = []
    // Obtain the team scores
    for (let i = 0; i < props.teams_per_match; i++) {
      const score_option_value = options?.find(o => o.name === `score_${i + 1}`) as
        | D.APIApplicationCommandInteractionDataIntegerOption
        | undefined

      if (!score_option_value) throw new Error(`Missing score_${i + 1} option`)
      team_scores.push(score_option_value.value as number) // casting to number as this is a string only for autocomplete options
    }

    return {
      players: team_player_ids,
      outcome: {
        type: OutcomeType.Points,
        team_scores: team_scores,
      },
    }
  }

  throw new Error(`Unsupported outcome type ${props.match_settings.outcome_type}`)
}

  export const record_match_cmd = record_match_cmd_sig.set<App>({
    guildSignature: async (app, guild_id) => {
      const guild = app.db.guilds.get(guild_id)
      const rankings = await app.db.guild_rankings.fetch({ guild_id: guild.data.id })
      if (rankings.length == 0) return null

      const options: D.APIApplicationCommandSubcommandOption[] = rankings
        .map(r => {
          return getRecordMatchSubcommandCommandOption(app, r.ranking)
        })

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
        return r.find(r => cleanString(r.ranking.data.name) === cleanString(ranking_name))
      })

      if (!ranking) throw new Error(`Ranking '${ranking_name}' not found`)

      const props = app.rankings.getProperties(ranking.ranking)

      const { players, outcome } = await getPlayersAndOutcome(app, interaction, ranking.ranking)

      const { options: { time_finished } } = getOptions(interaction, {
        time_finished: { type: D.ApplicationCommandOptionType.String, name: optionnames.time_finished },
      })
      const selected_time_finished = getSelectedTimeFinished(time_finished)

      return ctx.defer(async ctx => {
        const match = await app.matches.createFinished({
          app,
          ranking: ranking.ranking,
          players: await Promise.all(
            players.map(team =>
              Promise.all(team.map(id => app.players.getOrCreatePlayerByUser(app, id, ranking.ranking))),
            ),
          ),
          outcome,
          time_finished: selected_time_finished,
        })

        const match_summary_message = await matchSummaryEmbed(app, match)

        return void (await ctx.edit({
          embeds: [match_summary_message],
          flags: D.MessageFlags.Ephemeral,
        }))
      })

    },
  })
