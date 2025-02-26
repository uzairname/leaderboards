import { ViewSignature } from '@repo/discord'
import { field } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { UserError } from '../../../../errors/user-errors'
import { App } from '../../../../setup/app'
import {
  onConfirmOutcomeBtn,
  onPlayerConfirmOrCancelBtn,
  onSelectTeam,
  selectAndConfirmOutcomePage,
} from './record-match-cmd'

export const record_match_view_sig = new ViewSignature({
  name: 'Record Match',
  custom_id_prefix: 'rm',
  state_schema: {
    // whether the user can record a match on their own
    admin: field.Boolean(),
    clicked_component: field.Enum({
      'select team': null,
      'confirm teams': null,
      'select winner': null,
      'confirm outcome': null,
      'match user confirm': null, // someone in the match has confirmed the pending match
      'match user cancel': null, // someone in the match has cancelled the pending match
    }),
    teams_per_match: field.Int(),
    players_per_team: field.Int(),
    // index of the team being selected (0-indexed)
    selected_team_idx: field.Int(),
    // index of the chosen winning team (0-indexed)
    selected_winning_team_index: field.Int(),
    players: field.Array(
      field.Array(
        field.Object({
          user_id: field.String(),
          confirmed: field.Boolean(),
        }),
      ),
    ),
    // flattened_team_user_ids: field.Array(field.String()),
    ranking_id: field.Int(),

    match_requested_at: field.Date(),
    // user who originally requested the match
    requesting_player_id: field.String(),

    selected_time_finished: field.Date(),
  },
})

export const record_match_view = record_match_view_sig.set<App>({
  onComponent: async (ctx, app) => {
    if (ctx.state.is.clicked_component('select team')) {
      return onSelectTeam(app, ctx)
    } //
    else if (ctx.state.is.clicked_component('confirm teams')) {
      return {
        type: D.InteractionResponseType.UpdateMessage,
        data: await selectAndConfirmOutcomePage(app, ctx),
      }
    } //
    else if (ctx.state.is.clicked_component('select winner')) {
      const data = ctx.interaction.data as unknown as D.APIMessageStringSelectInteractionData
      ctx.state.save.selected_winning_team_index(parseInt(data.values[0]))
      return {
        type: D.InteractionResponseType.UpdateMessage,
        data: await selectAndConfirmOutcomePage(app, ctx),
      }
    } //
    else if (ctx.state.is.clicked_component('confirm outcome')) {
      return onConfirmOutcomeBtn(app, ctx)
    } //
    else if (ctx.state.is.clicked_component('match user confirm')) {
      return onPlayerConfirmOrCancelBtn(app, ctx)
    } //
    else if (ctx.state.is.clicked_component('match user cancel')) {
      return onPlayerConfirmOrCancelBtn(app, ctx)
    } //
    else {
      throw new UserError(`Unknown state ${ctx.state.data.clicked_component}`)
    }
  },
})
