import {
  AnyGuildInteractionContext,
  AnyViewSignature,
  ChatInteractionResponse,
  ComponentContext,
  getModalSubmitEntries,
  ViewSignature,
} from '@repo/discord'
import { field, intOrUndefined, nonNullable, StringDataSchema, strOrUndefined, unflatten } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { App } from '../../../setup/app'
import { Messages } from '../../../utils'
import { ensureAdminPerms } from '../../../utils/perms'
import { getOrAddGuild } from '../../guilds/manage-guilds'
import { createRankingModal } from '../components'
import { createNewRankingInGuild } from '../manage-rankings'
import { getRankingSettingsPage, ranking_settings_view_sig } from './ranking-settings-view'

export const rankings_view_sig = new ViewSignature({
  custom_id_prefix: 's',
  name: 'settings page',
  state_schema: {
    callback: field.Choice({
      createRankingModal,
      createRankingModalSubmit: onCreateRankingModalSubmit,
    }),
    modal_input: field.Object({
      name: field.String(),
      teams_per_match: field.Int(),
      players_per_team: field.Int(),
      best_of: field.Int(),
    }),
  },
  guild_only: true,
})

let x: StringDataSchema = {
  callback: field.Choice({
    createRankingModal,
    createRankingModalSubmit: onCreateRankingModalSubmit,
  }),
  modal_input: field.Object({
    name: field.String(),
    teams_per_match: field.Int(),
    players_per_team: field.Int(),
    best_of: field.Int(),
  }),
}

export const sig = new ViewSignature({
  custom_id_prefix: 's',
  name: 'settings page',
  guild_only: true,
  state_schema: {
    a: field.String()
  }
})


export const rankings_view = rankings_view_sig.set<App>({
  onComponent: async (ctx, app) => {
    return ctx.state.get.callback()(app, ctx)
  },
})

export async function rankingsPage(
  app: App,
  ctx: AnyGuildInteractionContext,
): Promise<D.APIInteractionResponseCallbackData> {
  const guild = await getOrAddGuild(app, ctx.interaction.guild_id)

  const state = rankings_view_sig.newState()

  const grs = await app.db.guild_rankings.getBy({ guild_id: guild.data.id })

  const embeds = await Messages.allRankingsPageEmbeds(
    app,
    guild,
    grs.map(gr => gr.guild_ranking),
  )

  const ranking_btns: D.APIButtonComponent[] = grs.map(gr => {
    return {
      type: D.ComponentType.Button,
      label: gr.ranking.data.name,
      style: D.ButtonStyle.Primary,
      custom_id: ranking_settings_view_sig
        .newState({
          ranking_id: gr.ranking.data.id,
          guild_id: gr.guild_ranking.data.guild_id,
        })
        .cId(),
    }
  })

  const ranking_btn_action_rows: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] = unflatten(
    ranking_btns,
    5,
    false,
  ).map(btns => {
    return {
      type: D.ComponentType.ActionRow,
      components: btns,
    }
  })

  const last_action_row: D.APIActionRowComponent<D.APIMessageActionRowComponent> = {
    type: D.ComponentType.ActionRow,
    components: [
      {
        type: D.ComponentType.Button,
        style: D.ButtonStyle.Success,
        custom_id: state.set.callback(createRankingModal).cId(),
        label: 'New Ranking',
        emoji: {
          name: '➕',
        },
      },
    ],
  }

  if (grs.length === 0) {
  }

  return {
    flags: D.MessageFlags.Ephemeral,
    content: '',
    embeds,
    components: [...ranking_btn_action_rows.slice(0, 4), last_action_row],
  }
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

      await ctx.edit(
        await getRankingSettingsPage({
          app,
          ctx,
          ranking_id: ranking.data.id,
        }),
      )
    }
  )
}
