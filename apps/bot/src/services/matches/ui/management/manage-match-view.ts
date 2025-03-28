import { Match } from '@repo/db/models'
import { ChatInteractionResponse, ComponentContext, Context, getModalSubmitEntries, ViewSignature } from '@repo/discord'
import { field, intOrUndefined, nonNullable } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { UserError } from '../../../../errors/user-errors'
import { App } from '../../../../setup/app'
import { Colors } from '../../../../utils'
import { hasAdminPerms } from '../../../../utils/perms'
import { matchSummaryEmbed } from '../../logging/match-summary-message'
import { cancelMatch, updateMatchOutcome } from '../../management/update-matches'

export const manage_match_view_sig = new ViewSignature({
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

export const manage_match_view = manage_match_view_sig.set<App>({
  onComponent: async (ctx, app) => {
    if (ctx.state.data.callback) return ctx.state.data.callback(app, ctx)
    return {
      type: ctx.state.data.on_page
        ? D.InteractionResponseType.UpdateMessage
        : D.InteractionResponseType.ChannelMessageWithSource,
      data: {
        ...(await manageMatchPage(app, ctx)),
        flags: D.MessageFlags.Ephemeral,
      },
    }
  },
})

const setting_select_menu_options: Record<
  string,
  (
    app: App,
    match: Match,
  ) => {
    name: string
    description: string
    callback: (app: App, ctx: ComponentContext<typeof manage_match_view_sig>) => Promise<ChatInteractionResponse>
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

// export async function sendManageMatchPage(
//   app: App,
//   ctx: AnyGuildInteractionContext,
//   match_id: number,
// ): Promise<D.APIInteractionResponseCallbackData> {
//   return manageMatchPage(app, {
//     ...ctx,
//     state: manage_match_page_view.newState({ match_id }),
//   })
// }

export async function manageMatchPage(
  app: App,
  ctx: Context<typeof manage_match_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const match_id = ctx.state.get.match_id()
  const match = await app.db.matches.fetch(match_id)
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
  ctx: ComponentContext<typeof manage_match_view_sig>,
): Promise<ChatInteractionResponse> {
  const value = (ctx.interaction.data as D.APIMessageStringSelectInteractionData).values[0]
  if (!value) return { type: D.InteractionResponseType.DeferredMessageUpdate }
  const match = await app.db.matches.fetch(ctx.state.get.match_id())
  return setting_select_menu_options[value](app, match).callback(app, ctx)
}

async function matchOutcomeModal(
  app: App,
  ctx: ComponentContext<typeof manage_match_view_sig>,
): Promise<D.APIModalInteractionResponse> {
  const match = await app.db.matches.fetch(ctx.state.get.match_id())
  const teams = await match.players()
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
            label: team.length > 1 ? `${team[0].player.data.name}'s team` : `${team[0].player.data.name}`,
          },
        ],
      })),
    },
  }
}

async function onMatchOutcomeModalSubmit(
  app: App,
  ctx: ComponentContext<typeof manage_match_view_sig>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(async ctx => {
    const modal_inputs = getModalSubmitEntries(ctx.interaction as D.APIModalSubmitInteraction)

    // validate and save the selected outcome from the modal submission
    const match = await app.db.matches.fetch(ctx.state.get.match_id())
    const ranking = await match.ranking.fetch()
    const new_outcome = match.data.outcome ?? new Array<number>(ranking.data.teams_per_match).fill(0)

    for (const [k, v] of Object.entries(modal_inputs)) {
      const team_num = parseInt(k)
      const score = intOrUndefined(v?.value)
      if (undefined === score) {
        throw new UserError(`Enter a number for each team's relative score`)
      }
      new_outcome[team_num] = score
    }

    // update the match
    await updateMatchOutcome(app, match, new_outcome)

    return void ctx.edit(await manageMatchPage(app, ctx))
  })
}

async function onRevert(
  app: App,
  ctx: ComponentContext<typeof manage_match_view_sig>,
): Promise<ChatInteractionResponse> {
  return {
    type: D.InteractionResponseType.UpdateMessage,
    data: {
      embeds: [
        {
          title: 'Revert Match?',
          description: `This will undo the match's effects on rankings.`,
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
  ctx: ComponentContext<typeof manage_match_view_sig>,
): Promise<ChatInteractionResponse> {
  const match = await app.db.matches.fetch(ctx.state.get.match_id())
  return ctx.defer(async ctx => {
    await cancelMatch(app, match)
    return void ctx.edit({
      embeds: [
        {
          title: 'Match Reverted',
          description: 'The match has been reverted',
          color: Colors.EmbedBackground,
        },
      ],
    })
  })
}
