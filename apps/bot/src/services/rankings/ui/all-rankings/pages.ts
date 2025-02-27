import { AnyGuildInteractionContext } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { App } from '../../../../setup/app'
import { Colors, commandMention, escapeMd } from '../../../../utils'
import { guildRankingDescriptionField } from '../../../../utils/ui/messages'
import { getOrAddGuild } from '../../../guilds/manage-guilds'
import { help_cmd } from '../../../help/ui/help-cmd'
import { AllRankingsHandlers } from './handlers'
import { rankings_view_sig } from './view'

export namespace AllRankingsPages {
  export async function main(app: App, ctx: AnyGuildInteractionContext): Promise<D.APIInteractionResponseCallbackData> {
    const guild = await getOrAddGuild(app, ctx.interaction.guild_id)

    const grs = await app.db.guild_rankings.fetchBy({ guild_id: guild.data.id })

    const embed = {
      title: `Settings ➛ Rankings`,
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
          custom_id: rankings_view_sig.newState({ handler: AllRankingsHandlers.onRankingSelect }).cId(),
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
          custom_id: rankings_view_sig.newState().set.handler(AllRankingsHandlers.sendCreateRankingModal).cId(),
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
}
