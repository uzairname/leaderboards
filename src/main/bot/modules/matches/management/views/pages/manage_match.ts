import * as D from 'discord-api-types/v10'
import { Match } from '../../../../../../../database/models'
import {
  ChatInteractionResponse,
  ComponentContext,
  InteractionContext,
  MessageView,
  field,
  getModalSubmitEntries,
} from '../../../../../../../discord-framework'
import { nonNullable } from '../../../../../../../utils/utils'
import { App } from '../../../../../../app/App'
import { AppView } from '../../../../../../app/ViewModule'
import { UserError } from '../../../../../errors/UserError'
import { Colors } from '../../../../../helpers/constants'
import { hasAdminPerms } from '../../../../../helpers/perms'
import { matchSummaryEmbed } from '../../../logging/match_summary_message'
import { revertMatch, updateMatchOutcome } from '../../manage_matches'

export const manage_match_page_config = new MessageView({
  custom_id_prefix: 'm',
  name: 'Manage Match Message',
  state_schema: {
    on_page: field.Boolean(),
    match_id: field.Int(),
    callback: field.Choice({
      onSettingSelect,
      onMatchOutcomeModalSubmit,
      onRevertConfirm,
    }),
  },
})

const manageMatchPage = (app: App) =>
  manage_match_page_config.onComponent(async ctx => {
    if (ctx.state.data.callback) return ctx.state.data.callback(app, ctx)
    return {
      type: ctx.state.data.on_page
        ? D.InteractionResponseType.UpdateMessage
        : D.InteractionResponseType.ChannelMessageWithSource,
      data: {
        ...(await manageMatchPageData(app, ctx)),
        flags: D.MessageFlags.Ephemeral,
      },
    }
  })

export default new AppView(manage_match_page_config, manageMatchPage)

const setting_select_menu_options: Record<
  string,
  (
    app: App,
    match: Match,
  ) => {
    name: string
    description: string
    callback: (
      app: App,
      ctx: ComponentContext<typeof manage_match_page_config>,
    ) => Promise<ChatInteractionResponse>
  }
> = {
  revert: () => ({
    name: 'Revert',
    description: 'Delete this match and revert its effects on rankings',
    callback: onRevert,
  }),
  editOutcome: () => ({
    name: 'Edit Outcome',
    description: 'Edit the outcome of this match and recalculates rankings',
    callback: matchOutcomeModal,
  }),
}

export async function manageMatchPageData(
  app: App,
  ctx: InteractionContext<typeof manage_match_page_config>,
): Promise<D.APIInteractionResponseCallbackData> {
  const match_id = ctx.state.get.match_id()
  const match = await app.db.matches.get(match_id)
  const embed = await matchSummaryEmbed(app, match)

  ctx.state.save.on_page(true)

  const components: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] = []

  const settings_select_menu: D.APIActionRowComponent<D.APIMessageActionRowComponent> = {
    type: D.ComponentType.ActionRow,
    components: [
      {
        type: D.ComponentType.StringSelect,
        custom_id: ctx.state.set.callback(onSettingSelect).cId(),
        placeholder: 'Match Settings',
        options: Object.entries(setting_select_menu_options).map(([value, option]) => ({
          label: option(app, match).name,
          value,
          description: option(app, match).description,
        })),
      },
    ],
  }

  if (await hasAdminPerms(app, ctx)) {
    components.push(settings_select_menu)
  }

  return {
    embeds: [embed],
    components,
  }
}

async function onSettingSelect(
  app: App,
  ctx: ComponentContext<typeof manage_match_page_config>,
): Promise<ChatInteractionResponse> {
  const value = (ctx.interaction.data as D.APIMessageStringSelectInteractionData).values[0]
  if (!value) return { type: D.InteractionResponseType.DeferredMessageUpdate }
  const match = await app.db.matches.get(ctx.state.get.match_id())
  return setting_select_menu_options[value](app, match).callback(app, ctx)
}

async function matchOutcomeModal(
  app: App,
  ctx: ComponentContext<typeof manage_match_page_config>,
): Promise<D.APIModalInteractionResponse> {
  const match = await app.db.matches.get(ctx.state.get.match_id())
  const teams = await match.teamPlayers()
  return {
    type: D.InteractionResponseType.Modal,
    data: {
      title: 'Edit Match Outcome',
      custom_id: ctx.state.set.callback(onMatchOutcomeModalSubmit).cId(),
      components: teams.map((team, i) => ({
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.TextInput,
            style: D.TextInputStyle.Short,
            placeholder: `Their score (1=win, 0=loss). Current: ${nonNullable(match.data.outcome, 'match outcome')[i]}`,
            custom_id: `${i}`,
            label:
              team.length > 1
                ? `${team[0].player.data.name}'s team`
                : `${team[0].player.data.name}`,
          },
        ],
      })),
    },
  }
}

async function onMatchOutcomeModalSubmit(
  app: App,
  ctx: ComponentContext<typeof manage_match_page_config>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      const match = await app.db.matches.get(ctx.state.get.match_id())
      const ranking = await match.ranking()
      const num_teams = nonNullable(ranking.data.num_teams, 'num_teams')

      const modal_inputs = getModalSubmitEntries(ctx.interaction as D.APIModalSubmitInteraction)

      const new_outcome = match.data.outcome ?? new Array<number>(num_teams).fill(0)

      for (const [k, v] of Object.entries(modal_inputs)) {
        const team_num = parseInt(k)

        const score = parseFloat(v?.value ?? '')
        if (isNaN(score)) {
          throw new UserError(`Enter a number for each team's relative score`)
        }
        new_outcome[team_num] = score
      }

      await updateMatchOutcome(app, match, new_outcome)

      return void ctx.edit(await manageMatchPageData(app, ctx))
    },
  )
}

async function onRevert(
  app: App,
  ctx: ComponentContext<typeof manage_match_page_config>,
): Promise<ChatInteractionResponse> {
  return {
    type: D.InteractionResponseType.UpdateMessage,
    data: {
      embeds: [
        {
          title: 'Revert Match?',
          description: 'This will delete the match and revert its effects on rankings.',
          color: Colors.EmbedBackground,
        },
      ],
      components: [
        {
          type: D.ComponentType.ActionRow,
          components: [
            {
              type: D.ComponentType.Button,
              label: 'Revert',
              style: D.ButtonStyle.Danger,
              custom_id: ctx.state.set.callback(onRevertConfirm).cId(),
            },
            {
              type: D.ComponentType.Button,
              label: 'Cancel',
              style: D.ButtonStyle.Secondary,
              custom_id: ctx.state.set.callback(undefined).cId(),
            },
          ],
        },
      ],
    },
  }
}

async function onRevertConfirm(
  app: App,
  ctx: ComponentContext<typeof manage_match_page_config>,
): Promise<ChatInteractionResponse> {
  const match = await app.db.matches.get(ctx.state.get.match_id())
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      await revertMatch(app, match)
      return void ctx.edit({
        embeds: [
          {
            title: 'Match Reverted',
            description: 'The match has been deleted',
            color: Colors.EmbedBackground,
          },
        ],
      })
    },
  )
}
