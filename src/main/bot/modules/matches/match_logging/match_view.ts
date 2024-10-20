import * as D from 'discord-api-types/v10'
import {
  ChatInteractionResponse,
  ComponentContext,
  MessageView,
  StateContext,
  field,
  getModalSubmitEntries,
} from '../../../../../discord-framework'
import { sentry } from '../../../../../logging'
import { nonNullable } from '../../../../../utils/utils'
import { App } from '../../../../app-context/app-context'
import { Match } from '../../../../database/models'
import { AppErrors } from '../../../../errors'
import { Colors } from '../../../messages/message_pieces'
import { ensureAdminPerms } from '../../../perms'
import { deleteMatch, updateMatch } from '../manage_matches'
import { matchSummaryEmbed } from './match_messages'

export const match_view_def = new MessageView({
  custom_id_prefix: 'm',
  name: 'match',
  state_schema: {
    on_page: field.Bool(),
    match_id: field.Int(),
    callback: field.Choice({
      onSettingSelect,
      onMatchOutcomeModalSubmit,
      onRevertConfirm,
    }),
  },
})

export const matchView = (app: App) =>
  match_view_def.onComponent(async ctx => {
    if (ctx.state.data.callback) return ctx.state.data.callback(app, ctx)
    return {
      type: ctx.state.data.on_page
        ? D.InteractionResponseType.UpdateMessage
        : D.InteractionResponseType.ChannelMessageWithSource,
      data: {
        ...(await matchPage(app, ctx)),
        flags: D.MessageFlags.Ephemeral,
      },
    }
  })

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
      ctx: ComponentContext<typeof match_view_def>,
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

export async function matchPage(
  app: App,
  ctx: StateContext<typeof match_view_def>,
): Promise<D.APIInteractionResponseCallbackData> {
  const match_id = ctx.state.get.match_id()
  const match = await app.db.matches.get(match_id)
  const embed = await matchSummaryEmbed(app, match, await match.teams(), {
    ranking_name: true,
    time_finished: true,
    id: true,
  })

  ctx.state.save.on_page(true)

  return {
    embeds: [embed],
    components: [
      {
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
      },
    ],
  }
}

async function onSettingSelect(
  app: App,
  ctx: ComponentContext<typeof match_view_def>,
): Promise<ChatInteractionResponse> {
  const value = (ctx.interaction.data as D.APIMessageStringSelectInteractionData).values[0]
  if (!value) return { type: D.InteractionResponseType.DeferredMessageUpdate }
  const match = await app.db.matches.get(ctx.state.get.match_id())
  return setting_select_menu_options[value](app, match).callback(app, ctx)
}

async function matchOutcomeModal(
  app: App,
  ctx: ComponentContext<typeof match_view_def>,
): Promise<D.APIModalInteractionResponse> {
  const match = await app.db.matches.get(ctx.state.get.match_id())
  const teams = await match.teams()
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
            placeholder:
              (team.length > 1
                ? `${team[0].player.data.name}'s team's`
                : `${team[0].player.data.name}'s`) +
              ` relative score. Current: ${nonNullable(match.data.outcome, 'match outcome')[i]}`,
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
  ctx: ComponentContext<typeof match_view_def>,
): Promise<ChatInteractionResponse> {
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      await ensureAdminPerms(app, ctx)
      const match = await app.db.matches.get(ctx.state.get.match_id())
      const ranking = await match.ranking()
      const num_teams = nonNullable(ranking.data.num_teams, 'num_teams')

      const modal_inputs = getModalSubmitEntries(ctx.interaction as D.APIModalSubmitInteraction)

      const new_outcome = match.data.outcome ?? new Array<number>(num_teams).fill(0)

      sentry.debug('anew outcome', new_outcome)

      for (const [k, v] of Object.entries(modal_inputs)) {
        const team_num = parseInt(k)

        const score = parseFloat(v.value)
        if (isNaN(score)) {
          throw new AppErrors.InvalidInput(`Enter a number for each team's relative score`)
        }
        new_outcome[team_num] = score
      }

      sentry.debug('new outcome', new_outcome)

      await updateMatch(app, match, new_outcome)

      return void ctx.edit(await matchPage(app, ctx))
    },
  )
}

async function onRevert(
  app: App,
  ctx: ComponentContext<typeof match_view_def>,
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
  ctx: ComponentContext<typeof match_view_def>,
): Promise<ChatInteractionResponse> {
  const match = await app.db.matches.get(ctx.state.get.match_id())
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      await ensureAdminPerms(app, ctx)
      await deleteMatch(app, match)
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
