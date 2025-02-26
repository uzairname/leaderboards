import {
  AnyGuildInteractionContext,
  ChatInteractionResponse,
  ComponentContext,
  getModalSubmitEntries,
  ViewSignature,
} from '@repo/discord'
import { field, intOrUndefined, nonNullable, strOrUndefined } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { App } from '../../../setup/app'
import { help_cmd } from '../../../setup/all-interaction-handlers'
import { Colors, commandMention, escapeMd } from '../../../utils'
import { ensureAdminPerms } from '../../../utils/perms'
import { guildRankingDescriptionField } from '../../../utils/ui/messages'
import { getOrAddGuild } from '../../guilds/manage-guilds'
import { createRankingModal } from './components'
import { createNewRankingInGuild } from '../manage'
import { onRankingSelect } from './settings/ranking-settings-handlers'
import { ranking_settings_view_sig, rankingSettingsPage } from './settings/ranking-settings-view'

export const rankings_view_sig = new ViewSignature({
  custom_id_prefix: 's',
  name: 'settings page',
  state_schema: {
    callback: field.Choice({
      createRankingModal,
      onCreateRankingModalSubmit,
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

export const sig = new ViewSignature({
  custom_id_prefix: 's',
  name: 'settings page',
  guild_only: true,
  state_schema: {
    a: field.String(),
  },
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

  const grs = await app.db.guild_rankings.fetchBy({ guild_id: guild.data.id })

  const embed = {
    title: `Settings → Rankings`,
    description:
      `# ${escapeMd(guild.data.name)}'s Rankings\n` +
      (grs.length === 0
        ? `${escapeMd(guild.data.name)} has no rankings set up.

For more info, use ${await commandMention(app, help_cmd)}`
        : `${escapeMd(guild.data.name)} has **${grs.length}** ranking${grs.length === 1 ? `` : `s`}. Adjust their settings by selecting a ranking below.`),
    fields: await Promise.all(grs.map(async gr => await guildRankingDescriptionField(app, gr.guild_ranking))),
    color: Colors.Primary,
  }

  const embeds = [embed]

  const ranking_select_menu_options: D.APISelectMenuOption[] = grs.map(gr => {
    return {
      label: gr.ranking.data.name,
      value: gr.ranking.data.id.toString(),
    }
  })

  const ranking_select: D.APIActionRowComponent<D.APIMessageActionRowComponent> = {
    type: D.ComponentType.ActionRow,
    components: [
      {
        type: D.ComponentType.StringSelect,
        custom_id: ranking_settings_view_sig.newState({ handler: onRankingSelect }).cId(),
        placeholder: `Select a ranking`,
        options: ranking_select_menu_options,
        min_values: 0,
      },
    ],
  }

  const last_action_row: D.APIActionRowComponent<D.APIMessageActionRowComponent> = {
    type: D.ComponentType.ActionRow,
    components: [
      {
        type: D.ComponentType.Button,
        style: D.ButtonStyle.Success,
        custom_id: rankings_view_sig.newState().set.callback(createRankingModal).cId(),
        label: 'New Ranking',
        emoji: {
          name: '➕',
        },
      },
    ],
  }

  const components = grs.length > 0 ? [ranking_select, last_action_row] : [last_action_row]

  return {
    flags: D.MessageFlags.Ephemeral,
    content: '',
    embeds,
    components,
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
        await rankingSettingsPage(app, {
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
