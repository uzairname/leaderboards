import * as D from 'discord-api-types/v10'
import { Guild } from '../../../../../../database/models'
import {
  ChatInteractionResponse,
  ComponentContext,
  field,
  getModalSubmitEntries,
  MessageView,
  StateContext,
} from '../../../../../../discord-framework'
import { sentry } from '../../../../../../logging/sentry'
import { nonNullable, unflatten } from '../../../../../../utils/utils'
import { App } from '../../../../../app/App'
import { AppView } from '../../../../../app/ViewModule'
import { UserErrors } from '../../../../errors/UserError'
import { Messages } from '../../../../ui-helpers/messages'
import { checkGuildInteraction, ensureAdminPerms } from '../../../../ui-helpers/perms'
import { getOrAddGuild } from '../../../guilds/guilds'
import { guidePage, help_cmd_signature } from '../../../help/help-command'
import {
  createNewRankingInGuild,
  default_players_per_team,
  default_teams_per_match,
  max_ranking_name_length,
} from '../../manage-rankings'
import { ranking_settings_page_config, rankingSettingsPage } from './ranking-settings'

export const rankings_page_config = new MessageView({
  custom_id_prefix: 'ar',
  name: 'rankings',
  state_schema: {
    owner_id: field.String(),
    callback: field.Choice({
      createRankingModal,
      onCreateRankingModalSubmit,
    }),
    new_ranking_input: field.Object({
      name: field.String(),
      teams_per_match: field.Int(),
      players_per_team: field.Int(),
    }),
  },
})

export default new AppView(rankings_page_config, (app: App) =>
  rankings_page_config.onComponent(async ctx => {
    // check if the user is the page user
    const interaction = checkGuildInteraction(ctx.interaction)
    if (ctx.state.data.owner_id && ctx.state.data.owner_id !== interaction.member.user.id) {
      throw new UserErrors.NotComponentOwner(ctx.state.data.owner_id)
    }
    return ctx.state.get.callback()(app, ctx)
  }),
)

export async function rankingsPage(
  app: App,
  guild: Guild,
  component_owner_id?: string,
): Promise<D.APIInteractionResponseCallbackData> {
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

export function createRankingModal(
  app: App,
  ctx: StateContext<typeof rankings_page_config>,
): D.APIModalInteractionResponse {
  let components = [rankingNameTextInput(ctx.state.data.new_ranking_input?.name)]

  if (app.config.features.MultipleTeamsPlayers) {
    components = components.concat([
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.TextInput,
            style: D.TextInputStyle.Short,
            custom_id: 'teams_per_match',
            label: 'Number of teams per match',
            placeholder: `${ctx.state.data.new_ranking_input?.teams_per_match ?? default_teams_per_match}`,
            required: false,
          },
        ],
      },
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.TextInput,
            style: D.TextInputStyle.Short,
            custom_id: 'players_per_team',
            label: 'Players per team',
            placeholder: `${ctx.state.data.new_ranking_input?.players_per_team ?? default_players_per_team}`,
            required: false,
          },
        ],
      },
    ])
  }

  return {
    type: D.InteractionResponseType.Modal,
    data: {
      custom_id: ctx.state.set.callback(onCreateRankingModalSubmit).cId(),
      title: 'Create a new ranking',
      components,
    },
  }
}

export async function onCreateRankingModalSubmit(
  app: App,
  ctx: ComponentContext<typeof rankings_page_config>,
): Promise<ChatInteractionResponse> {
  await ensureAdminPerms(app, ctx)

  const modal_input = getModalSubmitEntries(ctx.interaction as D.APIModalSubmitInteraction)
  const name = nonNullable(modal_input['name'], 'modal_input.name').value

  const interaction = checkGuildInteraction(ctx.interaction)
  const guild = await getOrAddGuild(app, interaction.guild_id)

  const ranking = await createNewRankingInGuild(app, guild, {
    name,
    teams_per_match: modal_input['teams_per_match']?.value
      ? parseInt(modal_input['teams_per_match'].value)
      : undefined,
    players_per_team: modal_input['players_per_team']?.value
      ? parseInt(modal_input['players_per_team'].value)
      : undefined,
  })

  return {
    type: D.InteractionResponseType.UpdateMessage,
    data: await rankingSettingsPage(app, {
      guild_id: ranking.new_guild_ranking.data.guild_id,
      ranking_id: ranking.new_guild_ranking.data.ranking_id,
      component_owner_id: interaction.member.user.id,
    }),
  }
}

export function rankingNameTextInput(
  existing_name?: string,
): D.APIActionRowComponent<D.APITextInputComponent> {
  const example_names = [
    // `Starcraft 2v2`,
    // `Valorant 5s`,
    `Smash 1v1`,
    `Boosts Only`,
    `Ping Pong 1v1`,
    `Chess`,
  ]

  return {
    type: D.ComponentType.ActionRow,
    components: [
      {
        type: D.ComponentType.TextInput,
        style: D.TextInputStyle.Short,
        custom_id: 'name',
        label: 'Name',
        placeholder:
          existing_name ??
          `e.g. ${example_names[Math.floor(Math.random() * example_names.length)]}`,
        max_length: max_ranking_name_length,
        required: !existing_name,
      },
    ],
  }
}
