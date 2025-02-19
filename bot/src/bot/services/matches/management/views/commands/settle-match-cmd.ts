import * as D from 'discord-api-types/v10'
import { CommandView, getOptions } from 'discord-framework'
import { sentry } from '../../../../../../logging/sentry'
import { UserError } from '../../../../../errors/UserError'
import { ensureAdminPerms } from '../../../../../ui-helpers/perms'
import { commandMention } from '../../../../../ui-helpers/strings'
import { AppView } from '../../../../ViewModule'
import matchesCmd from '../../../logging/views/matches-cmd'
import { matchesPage } from '../../../logging/views/matches-page'
import { cancelMatch, setMatchWinner } from '../../manage-matches'
import { manageMatchPage } from '../pages/manage-match-page'

const optionnames = {
  match_id: `match_id`,
  user: `player`,
  action: `action`,
}

export const settle_match_cmd_signature = new CommandView({
  name: `settle-match`,
  type: D.ApplicationCommandType.ChatInput,
  description: `(Admin) Cancel or decide the result of specific match`,
  options: [
    {
      type: D.ApplicationCommandOptionType.String,
      name: optionnames.action,
      description: `What to do to the match`,
      required: false,
      choices: [
        {
          name: `set winner`,
          value: `set winner`,
        },
        {
          name: `cancel`,
          value: `cancel`,
        },
      ],
    },
    {
      type: D.ApplicationCommandOptionType.User,
      name: optionnames.user,
      description: `The player to set as winner or whose match to choose`,
      required: false,
    },
    {
      type: D.ApplicationCommandOptionType.Integer,
      name: optionnames.match_id,
      description: `The match to manage. Defaults to the selected player's last match.`,
      required: false,
    },
  ],
})

export default new AppView(settle_match_cmd_signature, app =>
  settle_match_cmd_signature.onCommand(async ctx => {
    await ensureAdminPerms(app, ctx)

    sentry.debug(`${ctx.interaction.data.options?.map(o => o.name).join(`, `)}`)

    const input = getOptions(ctx.interaction, {
      action: {
        type: D.ApplicationCommandOptionType.String,
        required: false,
      },
      player: {
        type: D.ApplicationCommandOptionType.User,
        required: false,
      },
      match_id: {
        type: D.ApplicationCommandOptionType.Integer,
        required: false,
      },
    })

    sentry.debug(`${input}`)

    return ctx.defer(
      {
        type: D.InteractionResponseType.DeferredChannelMessageWithSource,
        data: { flags: D.MessageFlags.Ephemeral },
      },
      async ctx => {
        sentry.debug(`settle match. ${input.match_id}, ${input.player}`)

        // Determine the match to act on, from the input. Also get its players
        const match = await (async function () {
          if (input.match_id) {
            // match id was provided.
            const match = await app.db.matches.fetch(input.match_id, ctx.interaction.guild_id)
            return match
          } else if (input.player?.id) {
            // user id was provided. get their latest match in the guild
            const matches = await app.db.matches.getMany({
              guild_id: ctx.interaction.guild_id,
              user_ids: [input.player?.id],
              limit: 1,
            })
            if (matches.length === 0) {
              throw new UserError(
                `<@${input.player?.id}> has not played any matches in this server`,
              )
            }
            return matches[0].match
          } else {
            throw new UserError(
              `Please specify either the match id or player to settle a match for`,
            )
          }
        })()

        // Act on the match, based on the selected action or match
        if (input.action) {
          if (input.action === `cancel`) {
            // Revert the match
            await cancelMatch(app, match)
            return void ctx.followup({ content: `Match reverted`, flags: D.MessageFlags.Ephemeral })
          } else if (input.action === `set winner`) {
            // Set the winner of the match. The user must be specified
            if (!input.player?.id) {
              return void ctx.edit({
                content: `Please specify the winner of this match`,
                flags: D.MessageFlags.Ephemeral,
              })
            }
            await setMatchWinner(app, match, input.player?.id)
            return void ctx.followup({
              content: `Match winner set`,
              flags: D.MessageFlags.Ephemeral,
            })
          }
        } else if (input.match_id) {
          // Match was selected, but no action. Show the match settings page
          await ctx.edit(await manageMatchPage(app, ctx, input.match_id))
        } else {
          // No action or match was selected. Show the matches page
          await ctx.edit(
            await matchesPage(app, {
              guild_id: ctx.interaction.guild_id,
              user_ids: input.player?.id ? [input.player?.id] : undefined,
            }),
          )
          return void ctx.followup({
            content: `Please select a match to settle. Type ${commandMention(app, matchesCmd, ctx.interaction.guild_id)} to see all matches`,
            flags: D.MessageFlags.Ephemeral,
          })
        }
      },
    )
  }),
)
