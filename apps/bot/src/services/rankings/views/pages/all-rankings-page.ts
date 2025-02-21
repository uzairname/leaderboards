import {
  AnyGuildInteractionContext,
  ChatInteractionResponse,
  ComponentContext,
  MessageView,
  StateContext,
} from '@repo/discord'
import { getModalSubmitEntries } from '@repo/discord/converters'
import { field, intOrUndefined, nonNullable, strOrUndefined, unflatten } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { sentry } from '../../../../logging/sentry'
import { AppView } from '../../../../classes/ViewModule'
import { UserErrors } from '../../../../errors/UserError'
import { App } from '../../../../setup/app'
import { Messages } from '../../../../ui-helpers/messages'
import { ensureAdminPerms } from '../../../../ui-helpers/perms'
import { getOrAddGuild } from '../../../guilds/guilds'
import { guidePage, help_cmd_signature } from '../../../help/help-cmd'
import {
  createNewRankingInGuild,
  default_best_of,
  default_players_per_team,
  default_teams_per_match,
  max_ranking_name_length,
} from '../../manage-rankings'
import { ranking_settings_page_config, rankingSettingsPage } from './ranking-settings-page'

export const rankings_page_config = new MessageView({
  custom_id_prefix: 'ar',
  name: 'rankings',
  state_schema: {
    owner_id: field.String(),
    callback: field.Choice({
      createRankingModal,
      createRankingModalSubmit,
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

export default new AppView(rankings_page_config, (app: App) =>
  rankings_page_config.onComponent(async ctx => {
    if (ctx.state.data.owner_id && ctx.state.data.owner_id !== ctx.interaction.member.user.id) {
      throw new UserErrors.NotComponentOwner(ctx.state.data.owner_id)
    }
    return ctx.state.get.callback()(app, ctx)
  }),
)

export async function allRankingsPage(
  app: App,
  ctx: AnyGuildInteractionContext,
): Promise<D.APIInteractionResponseCallbackData> {
  // const interaction = checkGuildComponentInteraction(ctx.interaction)
  const interaction = ctx.interaction
  const guild = await getOrAddGuild(app, interaction.guild_id)
  const component_owner_id = interaction.member.user.id

  sentry.debug(`rankingsPage(${guild})`)

  const state = rankings_page_config.newState({ owner_id: component_owner_id })

  const grs = await app.db.guild_rankings.fetch({ guild_id: guild.data.id })

  const embeds = await Messages.allGuildRankingsText(
    app,
    guild,
    grs.map(gr => gr.guild_ranking),
  )

  const ranking_btns: D.APIButtonComponent[] = grs.map(gr => {
    return {
      type: D.ComponentType.Button,
      label: gr.ranking.data.name,
      style: D.ButtonStyle.Primary,
      custom_id: ranking_settings_page_config
        .newState({
          ranking_id: gr.ranking.data.id,
          guild_id: gr.guild_ranking.data.guild_id,
          component_owner_id,
        })
        .cId(),
    }
  })

  const ranking_btn_action_rows: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] =
    unflatten(ranking_btns, 5, false).map(btns => {
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
    last_action_row.components.push({
      type: D.ComponentType.Button,
      style: D.ButtonStyle.Primary,
      custom_id: help_cmd_signature.newState({ page: guidePage }).cId(),
      label: 'More Info',
    })
  }

  return {
    flags: D.MessageFlags.Ephemeral,
    content: '',
    embeds,
    components: [...ranking_btn_action_rows.slice(0, 4), last_action_row],
  }
}

/**
 * Create ranking modal view: this is the Ranking Settings Modal with the name field required
 */
export function createRankingModal(
  app: App,
  ctx: StateContext<typeof rankings_page_config>,
): D.APIModalInteractionResponse {
  let components = rankingSettingsModal({
    name: {
      current: ctx.state.data.modal_input?.name,
    },
    best_of: {},
    team_size: app.config.features.AllowNon1v1 ? {} : undefined,
  })

  return {
    type: D.InteractionResponseType.Modal,
    data: {
      custom_id: ctx.state.set.callback(createRankingModalSubmit).cId(),
      title: 'Create a new ranking',
      components,
    },
  }
}

export async function createRankingModalSubmit(
  app: App,
  ctx: ComponentContext<typeof rankings_page_config>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      await ensureAdminPerms(app, ctx)

      const modal_input = getModalSubmitEntries(ctx.interaction as D.APIModalSubmitInteraction)

      const { ranking } = await createNewRankingInGuild(app, ctx.interaction.guild_id, {
        name: nonNullable(strOrUndefined(modal_input['name']?.value), 'input name'),
        teams_per_match: intOrUndefined(modal_input['teams_per_match']?.value),
        players_per_team: intOrUndefined(modal_input['players_per_team']?.value),
        matchmaking_settings: {
          default_best_of: intOrUndefined(modal_input['best_of']?.value) ?? default_best_of,
        },
      })

      await ctx.edit(
        await rankingSettingsPage({
          app,
          ctx,
          ranking_id: ranking.data.id,
        }),
      )
    },
  )
}

/**
 * If name is specified and current name is not provided, it will be required
 * @param include Which fields to include, along with their current value
 * @returns
 */
export function rankingSettingsModal(include: {
  name?: { current?: string }
  best_of?: { current?: number }
  team_size?: {
    players_per_team?: number
    teams_per_match?: number
  }
}): D.APIActionRowComponent<D.APITextInputComponent>[] {
  const example_names = [`Smash 1v1`, `Boosts Only`, `Ping Pong 1v1`, `Chess`]

  const components: D.APIActionRowComponent<D.APIModalActionRowComponent>[] = []

  sentry.debug(`${JSON.stringify(include)}`)

  if (include.name) {
    components.push({
      type: D.ComponentType.ActionRow,
      components: [
        {
          type: D.ComponentType.TextInput,
          style: D.TextInputStyle.Short,
          custom_id: 'name',
          label: 'Name',
          placeholder:
            include?.name?.current ??
            `e.g. ${example_names[Math.floor(Math.random() * example_names.length)]}`,
          max_length: max_ranking_name_length,
          required: !include?.name?.current,
        },
      ],
    })
  }

  if (include.team_size) {
    components.push({
      type: D.ComponentType.ActionRow,
      components: [
        {
          type: D.ComponentType.TextInput,
          style: D.TextInputStyle.Short,
          custom_id: 'teams_per_match',
          label: 'Number of teams per match',
          placeholder: `${include.team_size.teams_per_match ?? default_teams_per_match}`,
          required: false,
        },
      ],
    })
    components.push({
      type: D.ComponentType.ActionRow,
      components: [
        {
          type: D.ComponentType.TextInput,
          style: D.TextInputStyle.Short,
          custom_id: 'players_per_team',
          label: 'Players per team',
          placeholder: `${include.team_size.players_per_team ?? default_players_per_team}`,
          required: false,
        },
      ],
    })
  }

  if (include?.best_of) {
    components.push({
      type: D.ComponentType.ActionRow,
      components: [
        {
          type: D.ComponentType.TextInput,
          style: D.TextInputStyle.Short,
          custom_id: 'best_of',
          label: 'By default, matches are best of:',
          placeholder: include?.best_of?.current?.toString() ?? '1',
          required: false,
        },
      ],
    })
  }

  return components
}
