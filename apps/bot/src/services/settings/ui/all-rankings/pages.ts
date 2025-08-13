import { AnyGuildInteractionContext } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { AllRankingsHandlers } from '.'
import { App } from '../../../../setup/app'
import { breadcrumbsTitle, Colors, commandMention, escapeMd } from '../../../../utils'
import { guildRankingDescriptionField } from '../../../../utils/ui/messages'
import { rankingSelectMenu } from '../../../../utils/ui/view-helpers/components'
import { getOrAddGuild } from '../../../guilds/manage-guilds'
import { help_cmd } from '../../../help/ui/help-cmd'
import { all_rankings_view_sig } from './view'

export async function main(app: App, ctx: AnyGuildInteractionContext): Promise<D.APIInteractionResponseCallbackData> {
  const guild = await getOrAddGuild(app, ctx.interaction.guild_id)

  const grs = await app.db.guild_rankings.fetch({ guild_id: guild.data.id })

  const embed = {
    title: breadcrumbsTitle(`Settings`, `Rankings`),
    description:
      `# ${escapeMd(guild.data.name)}'s Rankings\n` +
      (grs.length === 0
        ? `${escapeMd(guild.data.name)} has no rankings. Create one by clicking the button below.

:warning: The bot will create a **publicly visible category** for all ranking-related messages. Make sure this is okay before continuing.
:information_source: You may rename and rearrange any roles or channels that the bot creates.
:question: For more info, use ${await commandMention(app, help_cmd)}`
        : `${escapeMd(guild.data.name)} has **${grs.length}** ranking${grs.length === 1 ? `` : `s`}. Adjust their settings by selecting a ranking below.`),
    fields: await Promise.all(grs.map(async gr => await guildRankingDescriptionField(app, gr.guild_ranking))),
    color: Colors.Primary,
  }

  const embeds = [embed]

  const ranking_select = rankingSelectMenu(
    grs,
    all_rankings_view_sig.newState({ handler: AllRankingsHandlers.onRankingSelect }).cId(),
  )

  const last_action_row: D.APIActionRowComponent<D.APIMessageActionRowComponent> = {
    type: D.ComponentType.ActionRow,
    components: [
      {
        type: D.ComponentType.Button,
        style: D.ButtonStyle.Success,
        custom_id: all_rankings_view_sig.newState().set.handler(AllRankingsHandlers.sendCreateRankingModal).cId(),
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
