import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  MessageActionRowComponentBuilder,
  SectionBuilder,
  TextDisplayBuilder,
} from '@discordjs/builders'
import { MatchStatus, OutcomeType, WLDVote } from '@repo/db/models'
import { MessageData, ViewSignature, ViewState } from '@repo/discord'
import { field, groupEqualValues, intToOrdinal, listToString, sortArraysByFirst } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { Colors } from '../../services/utils/strings'
import { App } from '../../setup/app'
import * as handlers from './handlers'

export const ongoing_match_view_sig = new ViewSignature({
  name: 'Ongoing Series Message',
  custom_id_prefix: 'om',
  state_schema: {
    original_message_id: field.String(),
    match_id: field.Int(),
    teams_to_rematch: field.Array(field.Bool()),
    teams_to_cancel: field.Array(field.Bool()),
    vote: field.Object({
      cancel: field.Bool(),
      wld: field.Choice(WLDVote),
    }),
    handler: field.Choice(handlers),
    selected_team_ranks: field.Array(field.Int()),
    selected_team_points: field.Array(field.Int()),
    selected_team_index: field.Int(),
  },
})

export const ongoing_match_view = ongoing_match_view_sig.set<App>({
  onComponent: async (ctx, app) => {
    const handler = ctx.state.get.handler()
    return await handler(app, ctx)
  },
})

export async function ongoingMatchPage(
  app: App,
  state: ViewState<typeof ongoing_match_view_sig.state_schema>,
): Promise<MessageData> {
  const match = await app.db.matches.fetch(state.get.match_id())
  const players = await match.teams()
  const ranking = await match.ranking.fetch()

  if (!app.config.features.AllowNon1v1Rankings && !(players.length === 2 && players.every(t => t.length === 1))) {
    throw new Error(`Invalid match team dimensions ${players}`)
  }

  const team_votes = match.data.team_votes

  const submitted_votes_container = (() => {
    if (!team_votes) return undefined

    const grouped_votes = groupEqualValues(team_votes, (a, b) => JSON.stringify(a) === JSON.stringify(b))

    const container = new ContainerBuilder()

    grouped_votes.entries().forEach(([team_nums, vote], i) => {
      const team_names_str = listToString(
        team_nums.map(team_num => {
          const team = players[team_num]
          return team.length === 1 ? `${app.players.mentionOrName(team[0].player)}` : `Team ${i + 1}`
        }),
      )

      const is_multiple_teams = team_nums.length > 1

      const vote_string = (() => {
        if (vote.cancel) {
          return `${is_multiple_teams ? `want` : `wants`} to cancel`
        }

        // If the vote is for whether the player won, lost, or drew, display that
        if (vote.own_wld !== undefined) {
          const wld_vote_str =
            {
              [WLDVote.Win]: `win`,
              [WLDVote.Loss]: `loss`,
              [WLDVote.Draw]: `draw`,
            }[vote.own_wld] || undefined
          if (wld_vote_str) {
            return `${is_multiple_teams ? `claim` : `claims`} ${wld_vote_str}`
          }
        }

        // If the vote is for the outcome by ranks, display that
        if (undefined !== vote.outcome) {
          if (vote.outcome.type === OutcomeType.Ranks) {
            const [ranks, teams] = sortArraysByFirst(vote.outcome.team_scores, players)
            return (
              `${is_multiple_teams ? `have` : `has`} voted for the following outcome:\n` +
              teams
                .map((team, j) => {
                  return `-# ${intToOrdinal(j + 1)} place: ${team.length === 1 ? app.players.mentionOrName(team[0].player) : `Team ${j + 1}`}`
                })
                .join('\n')
            )
          }
        }
        return undefined
      })()
      if (undefined === vote_string) return

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder({
              content: `${team_names_str} ${vote_string}`,
            }),
          )
          .setButtonAccessory(
            new ButtonBuilder({
              label: `Agree`,
              style: D.ButtonStyle.Primary,
              custom_id: state
                .setAll({
                  handler: handlers.agreeToVote,
                  selected_team_index: team_nums[0],
                })
                .cId(),
            }),
          ),
      )
    })

    return container.components.length > 0 ? container : undefined
  })()

  const players_ping_text = players
    .map(team => listToString(team.map(p => app.players.mentionOrName(p.player))))
    .join(' vs ')

  const containers: ContainerBuilder[] = []

  // Best of and overview
  containers.push(
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder({
        content: `${players_ping_text}` + 
    `\nPlay the match according to the agreed upon rules, then report the results below by voting for the match's outcome. ` +
     `Once all players agree on the result, the match will be scored` +
    `\nAn admin can resolve any disputes`, // prettier-ignore
      }),
    ),
  )

  // Votes and match concluded text
  if (match.data.status === MatchStatus.Finished || match.data.status === MatchStatus.Canceled) {
    containers.push(
      new ContainerBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder({
            content: `Match concluded. To start another match, everyone must agree to rematch within ${Math.round(app.config.RematchTimeoutMinutes)} minutes.`,
          }),
        )
        .setAccentColor(Colors.Primary),
    )
  } else if (submitted_votes_container) {
    containers.push(submitted_votes_container.setAccentColor(Colors.Pending))
  }

  let btn_action_rows: D.APIActionRowComponent<D.APIComponentInMessageActionRow>[] = []

  let vote_btns = new ActionRowBuilder<MessageActionRowComponentBuilder>()

  const props = app.rankings.getProperties(ranking)

  if (props.match_settings.outcome_type === OutcomeType.WinLossDraw) {
    vote_btns.addComponents(
      new ButtonBuilder({
        style: D.ButtonStyle.Success,
        label: 'I won',
        custom_id: state
          .setAll({
            handler: handlers.vote,
            vote: { wld: WLDVote.Win },
          })
          .cId(),
      }),
      new ButtonBuilder({
        style: D.ButtonStyle.Danger,
        label: 'I lost',
        custom_id: state
          .setAll({
            handler: handlers.vote,
            vote: { wld: WLDVote.Loss },
          })
          .cId(),
      }),
    )

    if (ranking.data.match_settings?.draws_allowed) {
      vote_btns.addComponents(
        new ButtonBuilder({
          style: D.ButtonStyle.Primary,
          label: 'We drew',
          custom_id: state
            .setAll({
              handler: handlers.vote,
              vote: { wld: WLDVote.Draw },
            })
            .cId(),
        }),
      )
    }
  } else if (
    props.match_settings.outcome_type === OutcomeType.Points ||
    props.match_settings.outcome_type === OutcomeType.Ranks
  ) {
    vote_btns.addComponents(
      new ButtonBuilder({
        style: D.ButtonStyle.Primary,
        label: 'Enter results',
        custom_id: state.set.handler(handlers.enterResult).cId(),
      }),
    )
  }

  vote_btns.addComponents(
    new ButtonBuilder({
      type: D.ComponentType.Button,
      style: D.ButtonStyle.Secondary,
      label: `Cancel`,
      custom_id: state
        .setAll({
          handler: handlers.vote,
          vote: { cancel: true },
        })
        .cId(),
    }),
  )

  const row_under_votes = new ActionRowBuilder<MessageActionRowComponentBuilder>()

  // If this is an outcome type that requires specific information to be recorded, and at least one vote has been cast,
  // Add an option to agree to it
  if (
    props.match_settings.outcome_type !== OutcomeType.WinLossDraw &&
    match.data.team_votes &&
    Object.keys(match.data.team_votes).length > 0
  ) {
    row_under_votes.addComponents(
      new ButtonBuilder({
        label: `Undo Vote`,
        style: D.ButtonStyle.Secondary,
        custom_id: state
          .setAll({
            handler: handlers.undoVote,
          })
          .cId(),
      }),
    )
  }

  const rematch_row = new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(
    new ButtonBuilder({
      label: `Rematch`,
      style: D.ButtonStyle.Primary,
      custom_id: state
        .setAll({
          handler: handlers.rematch,
        })
        .cId(),
    }),
  )

  if (match.data.status === MatchStatus.Ongoing) {
    btn_action_rows.push(vote_btns.toJSON())
    if (row_under_votes.components.length > 0) {
      btn_action_rows.push(row_under_votes.toJSON())
    }
  } else if (match.data.status === MatchStatus.Finished || match.data.status === MatchStatus.Canceled) {
    btn_action_rows.push(rematch_row.toJSON())
  }

  return new MessageData({
    components: [...containers.map(c => c.toJSON()), ...btn_action_rows],
    flags: D.MessageFlags.Ephemeral | D.MessageFlags.IsComponentsV2,
  })
}
