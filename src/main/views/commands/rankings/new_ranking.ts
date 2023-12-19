import * as D from 'discord-api-types/v10'
import {
  default_num_teams,
  default_players_per_team,
} from '../../../../database/models/models/rankings'
import {
  ChatInteractionResponse,
  ComponentContext,
  getModalSubmitEntries,
  CommandInteractionResponse,
  StateContext,
} from '../../../../discord-framework'
import { sentry } from '../../../../request/sentry'
import { App } from '../../../app/app'
import { Colors, escapeMd } from '../../../messages/message_pieces'
import { communityEnabled, getOrAddGuild } from '../../../modules/guilds'
import { createNewRankingInGuild, validateRankingOptions } from '../../../modules/rankings/rankings'
import { checkGuildInteraction, ensureAdminPerms } from '../../utils/checks'
import { rankingSettingsPage } from './ranking_settings'
import { rankingNameTextInput, rankings_cmd_def } from './rankings'

export async function creatingNewRankingPage(
  app: App,
  ctx: ComponentContext<typeof rankings_cmd_def>,
): Promise<ChatInteractionResponse> {
  const players_per_team = ctx.state.data.input_players_per_team || default_players_per_team
  const num_teams = ctx.state.data.input_num_teams || default_num_teams
  const guild = await getOrAddGuild(app, checkGuildInteraction(ctx.interaction).guild_id)

  const guild_match_results_channel_id = (await communityEnabled(app, guild.data.id))
    ? guild.data.match_results_forum_id
    : guild.data.match_results_textchannel_id

  const separate_ranking_match_results_channel = false

  const description = `## Creating New Ranking: ${escapeMd(ctx.state.get('input_name'))}`
    + `\n- Every match in this ranking will have **${num_teams}** teams`
    + ` and **${players_per_team}** player` + (players_per_team === 1 ? '' : 's') + ` per team.`
    + ` (` + new Array(num_teams).fill(players_per_team).join('v') + `)`
    + `\n- A **new channel** will be created where the leaderboard is displayed live`
    + `\n- ` + (guild_match_results_channel_id
      ? `Matches in this ranking will be logged in <#${guild_match_results_channel_id}>`
      : `A **new channel** will be created where matches in this ranking are logged`) // prettier-ignore

  sentry.debug(`description: ${description}`)

  const type = ctx.state.is.page('creating new')
    ? // already on creating new page. Update message
      D.InteractionResponseType.UpdateMessage
    : // modal originated from another page. Create new message
      D.InteractionResponseType.ChannelMessageWithSource

  ctx.state.save.page('creating new')

  return {
    type,
    data: {
      flags: D.MessageFlags.Ephemeral,
      embeds: [
        {
          description,
          color: Colors.EmbedBackground,
        },
      ],
      components: [
        {
          type: D.ComponentType.ActionRow,
          components: [
            {
              type: D.ComponentType.Button,
              style: D.ButtonStyle.Primary,
              custom_id: ctx.state.set.component('btn:create').cId(),
              label: 'Edit',
            },
          ],
        },
        {
          type: D.ComponentType.ActionRow,
          components: [
            {
              type: D.ComponentType.Button,
              style: D.ButtonStyle.Success,
              custom_id: ctx.state.set.component('btn:create confirm').cId(),
              label: 'Create',
            },
          ],
        },
      ],
    },
  }
}

export function newRankingModal(
  state: StateContext<typeof rankings_cmd_def>['state'],
): CommandInteractionResponse {
  const name_required = state.data.input_name === undefined

  return {
    type: D.InteractionResponseType.Modal,
    data: {
      custom_id: state.set.component('modal:create new').cId(),
      title: 'Create a new ranking',
      components: [
        rankingNameTextInput(name_required),
        {
          type: D.ComponentType.ActionRow,
          components: [
            {
              type: D.ComponentType.TextInput,
              style: D.TextInputStyle.Short,
              custom_id: 'players_per_team',
              label: 'Players per team',
              placeholder: `1 (Default)`,
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
              custom_id: 'num_teams',
              label: 'Number of teams',
              placeholder: '2 (Default)',
              required: false,
            },
          ],
        },
      ],
    },
  }
}

export function onCreateNewModal(
  app: App,
  ctx: ComponentContext<typeof rankings_cmd_def>,
): Promise<ChatInteractionResponse> {
  if (ctx.state.is.component('modal:create new')) {
    const modal_input = getModalSubmitEntries(ctx.interaction as D.APIModalSubmitInteraction)
    ctx.state.saveData({
      input_num_teams: parseInt(modal_input['num_teams'].value),
      input_players_per_team: parseInt(modal_input['players_per_team'].value),
    })
    modal_input['name'].value && ctx.state.save.input_name(modal_input['name'].value)
    sentry.debug(`modal entries: ${JSON.stringify(modal_input)}`)
    sentry.debug(`ctx.state.data: ${JSON.stringify(ctx.state.data)}`)
    let x = validateRankingOptions({
      name: ctx.state.data.input_name,
      num_teams: ctx.state.data.input_num_teams,
      players_per_team: ctx.state.data.input_players_per_team,
    })
  }
  return creatingNewRankingPage(app, ctx)
}

export function onCreateConfirmBtn(
  app: App,
  ctx: ComponentContext<typeof rankings_cmd_def>,
): ChatInteractionResponse {
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      await ensureAdminPerms(app, ctx)
      const guild = await getOrAddGuild(app, checkGuildInteraction(ctx.interaction).guild_id)
      const result = await createNewRankingInGuild(app, guild, {
        name: ctx.state.get('input_name'),
        num_teams: ctx.state.data.input_num_teams,
        players_per_team: ctx.state.data.input_players_per_team,
      })
      await ctx.edit(await rankingSettingsPage(app, result.new_ranking.data.id, guild.data.id))
    },
  )
}
