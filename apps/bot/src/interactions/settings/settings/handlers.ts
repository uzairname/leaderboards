import {
  ChatInteractionResponse,
  ComponentContext,
  getModalSubmitEntries,
  StateContext,
  ViewSignature,
} from '@repo/discord'
import { intOrNull, intOrUndefined, nonNullable, strOrUndefined } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { SettingsPages } from '.'
import { App, syncDiscordCommands } from '../../../setup/app'
import { RankingSettingsPages } from '../ranking-settings'
import { rankingSettingsModal } from '../ranking-settings/modals'
import { ranking_settings_view_sig } from '../ranking-settings/view'
import { settings_view_sig } from './view'
import { getOrAddGuild, syncGuildAdminRole } from '../../../api/guilds/manage'
import { createNewRankingInGuild } from '../../../api/rankings/manage'

/**
 * A ranking is selected throuh the select menu
 */
export async function onRankingSelect(
  app: App,
  ctx: ComponentContext<typeof settings_view_sig>,
): Promise<ChatInteractionResponse> {
  const ranking_id = intOrNull((ctx.interaction.data as D.APIMessageStringSelectInteractionData).values[0])
  if (null === ranking_id) return ctx.defer(async () => void 0)
  return ctx.defer(
    async ctx =>
      void ctx.edit(
        await RankingSettingsPages.main(app, {
          ...ctx,
          state: ranking_settings_view_sig.newState({ ranking_id }),
        }),
      ),
  )
}

export async function refreshCommands(
  app: App,
  ctx: ComponentContext<typeof settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {
    await syncDiscordCommands(app, app.db.guilds.get(ctx.interaction.guild_id))

    await ctx.followup({
      content: 'Refreshed the commands in this server',
      flags: D.MessageFlags.Ephemeral,
    })
  })
}

export async function syncAdminRole(
  app: App,
  ctx: ComponentContext<typeof settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {
    const guild = await getOrAddGuild(app, ctx.interaction.guild_id)
    await syncGuildAdminRole(app, guild)

    await ctx.edit(await SettingsPages.main(app, ctx))
  })
}

/**
 * The same as the Ranking Settings Modal but with the name field required
 */
export function sendCreateRankingModal(
  app: App,
  ctx: StateContext<typeof settings_view_sig>,
): D.APIModalInteractionResponse {
  return {
    type: D.InteractionResponseType.Modal,
    data: rankingSettingsModal({
      name: {
        ph: ctx.state.data.modal_input?.name,
      },
      team_size: app.config.features.AllowNon1v1Rankings
        ? {
            players_per_team: {},
            teams_per_match: {},
          }
        : undefined,
    })
      .setCustomId(ctx.state.set.handler(onCreateRankingModalSubmit).cId())
      .setTitle('Create a new ranking')
      .toJSON(),
  }
}

export async function sendMainPage(
  app: App,
  ctx: ComponentContext<ViewSignature<any, true>>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => void (await ctx.edit(await SettingsPages.main(app, ctx))))
}

export async function onCreateRankingModalSubmit(
  app: App,
  ctx: ComponentContext<typeof settings_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(
    async ctx => {
      const modal_input = getModalSubmitEntries(ctx.interaction as D.APIModalSubmitInteraction)

      const { ranking } = await createNewRankingInGuild(app, ctx.interaction, ctx.interaction.guild_id, {
        name: nonNullable(strOrUndefined(modal_input['name']?.value), 'input name'),
        teams_per_match: intOrUndefined(modal_input['teams_per_match']?.value),
        players_per_team: intOrUndefined(modal_input['players_per_team']?.value),
        matchmaking_settings: {
          default_best_of: intOrUndefined(modal_input['best_of']?.value),
        },
      })

      await ctx.edit(
        await RankingSettingsPages.main(app, {
          ...ctx,
          state: ranking_settings_view_sig.newState({
            ranking_id: ranking.data.id,
          }),
        }),
      )
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
