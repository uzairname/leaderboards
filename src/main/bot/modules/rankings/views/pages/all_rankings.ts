import * as D from 'discord-api-types/v10'
import { Guild } from '../../../../../../database/models'
import { unflatten } from '../../../../../../utils/utils'
import { App } from '../../../../../app/App'
import { Messages } from '../../../../helpers/messages'
import { guidePage, help_cmd_signature } from '../../../help/help_command'
import { create_ranking_view, createRankingModal } from './create_ranking'
import { ranking_settings_view_signature } from './ranking_settings'

export async function allGuildRankingsPage(
  app: App,
  guild: Guild,
): Promise<D.APIInteractionResponseCallbackData> {
  const guild_rankings = await app.db.guild_rankings.get({ guild_id: guild.data.id })

  const embeds = await Messages.allGuildRankings(app, guild, guild_rankings)

  const ranking_btns: D.APIButtonComponent[] = guild_rankings.map(item => {
    return {
      type: D.ComponentType.Button,
      label: item.ranking.data.name || 'Unnamed Ranking',
      style: D.ButtonStyle.Primary,
      custom_id: ranking_settings_view_signature
        .createState({
          ranking_id: item.ranking.data.id,
          guild_id: item.guild_ranking.data.guild_id,
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
        custom_id: create_ranking_view.createState({ callback: createRankingModal }).cId(),
        label: 'New Ranking',
        emoji: {
          name: '➕',
        },
      },
    ],
  }

  if (guild_rankings.length === 0) {
    last_action_row.components.push({
      type: D.ComponentType.Button,
      style: D.ButtonStyle.Primary,
      custom_id: help_cmd_signature.createState({ page: guidePage }).cId(),
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
