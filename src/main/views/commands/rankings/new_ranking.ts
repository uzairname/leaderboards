import * as D from 'discord-api-types/v10'
import {
  default_num_teams,
  default_players_per_team
} from '../../../../database/models/models/rankings'
import {
  ChatInteractionContext,
  ChatInteractionResponse,
  ComponentContext,
  getModalSubmitEntries
} from '../../../../discord-framework'
import { App } from '../../../app/app'
import { Colors, toMarkdown } from '../../../messages/message_pieces'
import { getOrAddGuild } from '../../../modules/guilds'
import { createNewRankingInGuild } from '../../../modules/rankings/rankings'
import { checkGuildInteraction, ensureAdminPerms } from '../../utils/checks'
import { rankingSettingsPage } from './ranking_settings'
import { rankings_cmd_def } from './rankings'

export function creatingNewRankingPage(
  ctx: ChatInteractionContext<typeof rankings_cmd_def>
): ChatInteractionResponse {
  if (ctx.state.is.component('modal:name')) {
    ctx.state.save.input_name(
      getModalSubmitEntries(ctx.interaction as D.APIModalSubmitInteraction).find(
        c => c.custom_id === 'name'
      )?.value
    )
  }

  const players_per_team = ctx.state.data.input_players_per_team || default_players_per_team
  const num_teams = ctx.state.data.input_num_teams || default_num_teams

  return {
    type: D.InteractionResponseType.ChannelMessageWithSource,
    data: {
      flags: D.MessageFlags.Ephemeral,
      embeds: [
        {
          title: `Confirm?`,
          description:
            `Creating a new ranking named **${toMarkdown(ctx.state.get('input_name'))}**` +
            ` with the following settings:` +
            `\n- Every match in this ranking will have **${num_teams}** teams` +
            ` and **${players_per_team}** player` +
            (players_per_team === 1 ? '' : 's') +
            ` per team`,
          color: Colors.EmbedBackground
        }
      ],
      components: [
        {
          type: D.ComponentType.ActionRow,
          components: [
            {
              type: D.ComponentType.Button,
              style: D.ButtonStyle.Success,
              custom_id: ctx.state.set.component('btn:create confirm').encode(),
              label: 'Confirm'
            }
          ]
        }
      ]
    }
  }
}

export async function onCreateConfirmBtn(
  app: App,
  ctx: ComponentContext<typeof rankings_cmd_def>
): Promise<ChatInteractionResponse> {
  return ctx.defer(
    {
      type: D.InteractionResponseType.ChannelMessageWithSource,
      data: {
        flags: D.MessageFlags.Ephemeral,
        content: `Creating Ranking...`
      }
    },
    async ctx => {
      await ensureAdminPerms(app, ctx)

      const guild = await getOrAddGuild(app, checkGuildInteraction(ctx.interaction).guild_id)
      const result = await createNewRankingInGuild(app, guild, {
        name: ctx.state.get('input_name')
      })
      ctx.state.save.page('ranking settings').save.selected_ranking_id(result.new_ranking.data.id)
      return await ctx.edit(await rankingSettingsPage(app, ctx))
    }
  )
}
