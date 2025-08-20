import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  MessageActionRowComponentBuilder,
  TextDisplayBuilder,
} from '@discordjs/builders'
import { Context, MessageData } from '@repo/discord'
import { listToString, nonNullable } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { player_cmd } from './cmd'
import { player_view_sig } from './view'
import { deletePlayer } from '../../../api/players/manage'
import { App } from '../../../setup/app'
import { commandMention } from '../../../api/utils'

export async function removeUserPlayerPage(app: App, ctx: Context<typeof player_view_sig>): Promise<MessageData> {
  ctx.state.save.page(removeUserPlayerPage)

  const user = nonNullable(await app.db.users.fetch(ctx.state.get.user_id()))

  const rankings_str = listToString(
    await Promise.all(
      ctx.state.get.players().map(async p => {
        const ranking = await app.db.rankings.fetch(nonNullable(p.ranking_id))
        return `**${ranking.data.name}**`
      }),
    ),
  )

  if (!ctx.state.is.confirm_remove()) {
    return new MessageData({
      components: [
        new ContainerBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder({
              content:
                `Are you sure you want to remove <@${user?.data.id}> from ${rankings_str}? This will delete all matches they have played in this ranking, undo the effect they had on their opponents' ratings, and remove them from the leaderboard. This cannot be undone` +
                `Alternatively, you can hide them from the leaderboard without side-effects using ${await commandMention(app, player_cmd, ctx.interaction.guild_id, 'ban')}`,
            }),
          )
          .addActionRowComponents(
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder({
                custom_id: ctx.state.set.confirm_remove(true).cId(),
                label: 'Remove Player',
                style: D.ButtonStyle.Danger,
              }),
            ),
          )
          .setAccentColor(0xff0000)
          .toJSON(),
      ],
    }).addFlags(D.MessageFlags.Ephemeral | D.MessageFlags.IsComponentsV2)
  } else {
    await Promise.all(
      ctx.state.get.players().map(async p => {
        const player = await app.db.players.fetch(nonNullable(p.id))
        await deletePlayer(app, player, ctx.interaction)
      }),
    )

    return new MessageData({
      components: [
        new ContainerBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder({
              content: `<@${user?.data.id}> has been removed from ${rankings_str}.`,
            }),
          )
          .toJSON(),
      ],
    }).addFlags(D.MessageFlags.Ephemeral | D.MessageFlags.IsComponentsV2)
  }
}
