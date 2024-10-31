import * as D from 'discord-api-types/v10'
import { AppCommand } from '../../../../../../../discord-framework'
import { sentry } from '../../../../../../../logging/sentry'
import { AppView } from '../../../../../../app/ViewModule'
import { UserError } from '../../../../../errors/UserError'
import { checkGuildInteraction, ensureAdminPerms } from '../../../../../ui-helpers/perms'
import { revertMatch, updateMatchOutcome } from '../../manage-matches'
import { manageMatchPage } from '../pages/manage-match'
import { commandMention } from '../../../../../ui-helpers/strings'
import matchesCmd, { matches_command_signature } from '../../../logging/views/commands/matches'
import { matchesPage } from '../../../logging/views/pages/matches'

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
      type: D.ApplicationCommandOptionType.User,
      name: optionnames.user,
      description: `If specified, selects the latest match this user played.`,
      required: false,
    },
    {
      type: D.ApplicationCommandOptionType.Integer,
      name: optionnames.match_id,
      description: `(optional) Defaults to the player's last match. You can find the match id by using /matches`,
      required: false,
    },
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
  ],
})

export default new AppView(settle_match_cmd_signature, app =>
  settle_match_cmd_signature.onCommand(async ctx => {
    await ensureAdminPerms(app, ctx)
    const interaction = checkGuildInteraction(ctx.interaction)

    const match_id_option_value = (
      ctx.interaction.data.options?.find(o => o.name === optionnames.match_id) as
        | D.APIApplicationCommandInteractionDataIntegerOption
        | undefined
    )?.value

    const user_id_option_value = (
      ctx.interaction.data.options?.find(o => o.name === optionnames.user) as
        | D.APIApplicationCommandInteractionDataUserOption
        | undefined
    )?.value

    const action_option_value = (
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
        const { match, team_players } = await (async function () {
          if (match_id_option_value) {
            const match = await app.db.matches.get(match_id_option_value, interaction.guild_id)
            return { match, team_players: await match.teamPlayers() }
          } else if (user_id_option_value) {
            // get the user's latest match in this guild
            const matches = await app.db.matches.getMany({
              guild_id: interaction.guild_id,
              user_ids: [user_id_option_value],
              limit: 1,
            })
            if (matches.length === 0) {
              throw new UserError(
                `<@${user_id_option_value}> has not played any matches in this server`,
              )
            }
            return matches[0]
          } else {
            throw new UserError(
              `Either ${optionnames.match_id} or ${optionnames.user} must be specified`,
            )
          }
        })()

        if (action_option_value) {
          sentry.debug(`Action option value: ${action_option_value}`)
          if (action_option_value === `revert`) {
            await revertMatch(app, match)
            return void ctx.followup({content: `Match reverted`, flags: D.MessageFlags.Ephemeral,})
          } else if (action_option_value === `set winner`) {
            sentry.debug(`Setting winner for match ${match.data.id}`)

            if (!user_id_option_value) {
              return void ctx.edit({content: `Specify the winner of this match`,flags: D.MessageFlags.Ephemeral,})
            }

            const new_winning_team_index = team_players.findIndex(team =>
              team.some(p => p.player.data.user_id === user_id_option_value),
            )
            const new_outcome = Array.from({ length: team_players.length }, (_, i) =>
              i === new_winning_team_index ? 1 : 0,
            )
            sentry.debug(`Setting outcome: from ${match.data.outcome} to ${new_outcome}`)

            await updateMatchOutcome(app, match, new_outcome)

            return void ctx.followup({
              content: `Match winner set`,
              flags: D.MessageFlags.Ephemeral,
            })
          }
        } else if (match_id_option_value) {
          await ctx.edit(await manageMatchPage(app, ctx, match_id_option_value))
        } else {
          await ctx.edit(
            await matchesPage(
              app,
              {
                guild_id: interaction.guild_id,
                user_ids: user_id_option_value ? [user_id_option_value] : undefined,
              },
            ),
          )
          return void ctx.followup({
            content: `Please select a match id and/or a user. Type ${commandMention(app, matchesCmd, interaction.guild_id)}`,
            flags: D.MessageFlags.Ephemeral,
          })
        }

      },
    )
  }),
)
