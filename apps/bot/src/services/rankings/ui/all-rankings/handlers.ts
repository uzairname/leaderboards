import {
  ChatInteractionResponse,
  ComponentContext,
  getModalSubmitEntries,
  StateContext,
  ViewSignature,
} from '@repo/discord'
import { intOrUndefined, nonNullable, strOrUndefined } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { AllRankingsPages } from '.'
import { App } from '../../../../setup/app'
import { ensureAdminPerms } from '../../../../utils'
import { createNewRankingInGuild } from '../../manage'
import { RankingSettingsPages } from '../ranking-settings'
import { rankingSettingsModalComponents } from '../ranking-settings/modals'
import { ranking_settings_view_sig } from '../ranking-settings/view'
import { rankings_view_sig } from './view'

/**
 * A ranking is selected throuh the select menu
 */
export async function onRankingSelect(
  app: App,
  ctx: ComponentContext<typeof rankings_view_sig>,
): Promise<ChatInteractionResponse> {
  const ranking_id = intOrUndefined((ctx.interaction.data as D.APIMessageStringSelectInteractionData).values[0])

  return ctx.defer(async ctx => {
    await RankingSettingsPages.main(app, {
      ...ctx,
      state: ranking_settings_view_sig.newState({ ranking_id }),
    })
  })
}

/**
 * The same as the Ranking Settings Modal but with the name field required
 */
export function sendCreateRankingModal(
  app: App,
  ctx: StateContext<typeof rankings_view_sig>,
): D.APIModalInteractionResponse {
  return {
    type: D.InteractionResponseType.Modal,
    data: {
      custom_id: ctx.state.set.handler(onCreateRankingModalSubmit).cId(),
      title: 'Create a new ranking',
      components: rankingSettingsModalComponents({
        name: {
          current: ctx.state.data.modal_input?.name,
        },
        best_of: {},
        team_size: app.config.features.AllowNon1v1 ? {} : undefined,
      }),
    },
  }
}

export async function sendAllRankingsPage(
  app: App,
  ctx: ComponentContext<ViewSignature<any, true>>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => void ctx.edit(await AllRankingsPages.main(app, ctx)))
}

export async function onCreateRankingModalSubmit(
  app: App,
  ctx: ComponentContext<typeof rankings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(
    async ctx => {
      await ensureAdminPerms(app, ctx)

      const modal_input = getModalSubmitEntries(ctx.interaction as D.APIModalSubmitInteraction)

      const { ranking } = await createNewRankingInGuild(app, ctx.interaction.guild_id, {
        name: nonNullable(strOrUndefined(modal_input['name']?.value), 'input name'),
        teams_per_match: intOrUndefined(modal_input['teams_per_match']?.value),
        players_per_team: intOrUndefined(modal_input['players_per_team']?.value),
        matchmaking_settings: {
          default_best_of: intOrUndefined(modal_input['best_of']?.value),
        },
      })

      await RankingSettingsPages.main(app, {
        ...ctx,
        state: ranking_settings_view_sig.newState({
          ranking_id: ranking.data.id,
        }),
      })
    },
    {
      type: D.InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: 'Creating ranking...',
        flags: D.MessageFlags.Ephemeral,
      },
    },
  )
}
