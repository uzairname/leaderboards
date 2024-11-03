import * as D from 'discord-api-types/v10'
import { AppCommand } from '../../../../../../../discord-framework'
import { AppView } from '../../../../../../app/ViewModule'
import { UserError } from '../../../../../errors/UserError'
import { checkGuildInteraction, ensureAdminPerms } from '../../../../../ui-helpers/perms'
import { commandMention } from '../../../../../ui-helpers/strings'
import matchesCmd from '../../../logging/views/commands/matches'
import { matchesPage } from '../../../logging/views/pages/matches'
import { revertMatch } from '../../score-matches'
import { updateMatchOutcome } from '../../score-matches'
import { manageMatchPage } from '../pages/manage-match'

const optionnames = {
  match_id: `match-id`,
  user: `player`,
  action: `action`,
}

export const settle_match_cmd_signature = new AppCommand({
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
          name: `revert`,
          value: `revert`,
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
    const interaction = checkGuildInteraction(ctx.interaction)

    const selected_match_id = (
      ctx.interaction.data.options?.find(o => o.name === optionnames.match_id) as
        | D.APIApplicationCommandInteractionDataIntegerOption
        | undefined
    )?.value

    const selected_user_id = (
      ctx.interaction.data.options?.find(o => o.name === optionnames.user) as
        | D.APIApplicationCommandInteractionDataUserOption
        | undefined
    )?.value

    const selected_action_value = (
      ctx.interaction.data.options?.find(o => o.name === optionnames.action) as
        | D.APIApplicationCommandInteractionDataStringOption
        | undefined
    )?.value

    return ctx.defer(
      {
        type: D.InteractionResponseType.DeferredChannelMessageWithSource,
        data: { flags: D.MessageFlags.Ephemeral },
      },
      async ctx => {
        // Determine the match to act on, from the input. Also get its players
        const { match, team_players } = await (async function () {
          if (selected_match_id) {
            // match id was provided.
            const match = await app.db.matches.fetch(selected_match_id, interaction.guild_id)
            return { match, team_players: await match.players() }
          } else if (selected_user_id) {
            const selected_user = app.db.users.get(selected_user_id)
            const guild = app.db.guilds.get(interaction.guild_id)
            // user id was provided. get their latest match in the guild
            const matches = await app.db.matches.getMany({
              guild,
              users: [selected_user],
              limit: 1,
            })
            if (matches.length === 0) {
              throw new UserError(
                `<@${selected_user_id}> has not played any matches in this server`,
              )
            }
            return matches[0]
          } else {
            throw new UserError(
              `Please specify either ${optionnames.match_id} or ${optionnames.user}`,
            )
          }
        })()

        // Act on the match, based on the selected action or match
        if (selected_action_value) {
          if (selected_action_value === `revert`) {
            // Revert the match
            await revertMatch(app, match)
            return void ctx.followup({ content: `Match reverted`, flags: D.MessageFlags.Ephemeral })
          } else if (selected_action_value === `set winner`) {
            // Set the winner of the match. The user must be specified
            if (!selected_user_id) {
              return void ctx.edit({
                content: `Please specify the winner of this match`,
                flags: D.MessageFlags.Ephemeral,
              })
            }

            const new_winning_team_index = team_players.findIndex(team =>
              team.some(p => p.player.data.user_id === selected_user_id),
            )
            const new_outcome = Array.from({ length: team_players.length }, (_, i) =>
              i === new_winning_team_index ? 1 : 0,
            )

            await updateMatchOutcome(app, match, new_outcome, { check_rescore: true })

            return void ctx.followup({
              content: `Match winner set`,
              flags: D.MessageFlags.Ephemeral,
            })
          }
        } else if (selected_match_id) {
          // Match was selected, but no action. Show the match settings page
          await ctx.edit(await manageMatchPage(app, ctx, selected_match_id))
        } else {
          // No action or match was selected. Show the matches page
          await ctx.edit(
            await matchesPage(app, {
              guild_id: interaction.guild_id,
              user_ids: selected_user_id ? [selected_user_id] : undefined,
            }),
          )
          return void ctx.followup({
            content: `Please select a match to settle. Type ${commandMention(app, matchesCmd, interaction.guild_id)} to see all matches`,
            flags: D.MessageFlags.Ephemeral,
          })
        }
      },
    )
  }),
)
