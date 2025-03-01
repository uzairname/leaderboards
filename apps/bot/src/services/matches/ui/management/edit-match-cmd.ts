import { AnyAppCommandType, CommandHandler, CommandSignature, getOptions } from '@repo/discord'
import { StringDataSchema } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { UserError } from '../../../../errors/user-errors'
import { sentry } from '../../../../logging/sentry'
import { App } from '../../../../setup/app'
import { commandMention, ensureAdminPerms } from '../../../../utils'
import { numRankings } from '../../../guilds/properties'
import { cancelMatch, setMatchWinner } from '../../management/update-matches'
import { matches_cmd } from '../matches/matches-cmd'
import { matches_view_sig, matchesPage } from '../matches/matches-view'
import { manage_match_view_sig, manageMatchPage } from './manage-match-view'

const optionnames = {
  match_id: `match_id`,
  user: `player`,
  action: `action`,
}

export const settle_match_cmd_sig = new CommandSignature({
  name: `edit-match`,
  type: D.ApplicationCommandType.ChatInput,
  description: `Cancel or update the result of specific match`,
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

export const settle_match_cmd = settle_match_cmd_sig.set<App>({
  guildSignature: async (app, guild_id) => {
    const guild = app.db.guilds.get(guild_id)
    if ((await numRankings(app, guild)) == 0) return null
    return settle_match_cmd_sig
  },

  onCommand: async (ctx, app) => {
    await ensureAdminPerms(app, ctx)

    sentry.debug(`${ctx.interaction.data.options?.map(o => o.name).join(`, `)}`)

    const input = getOptions(ctx.interaction, {
      action: {
        type: D.ApplicationCommandOptionType.String,
        required: false,
      },
      user: {
        type: D.ApplicationCommandOptionType.User,
        required: false,
        name: optionnames.user,
      },
      match_id: {
        type: D.ApplicationCommandOptionType.Integer,
        required: false,
      },
    })

    sentry.debug(`${input}`)

    return ctx.defer(async ctx => {
      sentry.debug(`settle match. ${input.match_id}, ${input.user}`)

      // Determine the match to act on, from the input. Also get its players
      const match = await (async function () {
        if (input.match_id) {
          // match id was provided.
          const match = await app.db.matches.fetch(input.match_id, ctx.interaction.guild_id)
          return match
        } else if (input.user?.id) {
          // user id was provided. get their latest match in the guild
          const matches = await app.db.matches.getMany({
            guild_id: ctx.interaction.guild_id,
            user_ids: [input.user.id],
            limit: 1,
          })
          if (matches.length === 0) {
            throw new UserError(`<@${input.user?.id}> has not played any matches in this server`)
          }
          return matches[0].match
        } else {
          throw new UserError(`Please specify either the match id or player to settle a match for`)
        }
      })()

      // Act on the match, based on the selected action or match
      if (input.action) {
        if (input.action === `cancel`) {
          // Revert the match
          await cancelMatch(app, match)
          return void ctx.followup({
            content: `Match reverted`,
            flags: D.MessageFlags.Ephemeral,
          })
        } else if (input.action === `set winner`) {
          // Set the winner of the match. The user must be specified
          if (!input.user?.id) {
            return void ctx.edit({
              content: `Please specify the winner of this match`,
              flags: D.MessageFlags.Ephemeral,
            })
          }
          await setMatchWinner(app, match, input.user?.id)
          return void ctx.followup({
            content: `Match winner set`,
            flags: D.MessageFlags.Ephemeral,
          })
        }
      } else if (input.match_id) {
        // Match was selected, but no action. Show the match settings page
        const state = manage_match_view_sig.newState({
          match_id: input.match_id,
        })
        await ctx.edit(await manageMatchPage(app, { ...ctx, state }))
      } else {
        // No action or match was selected. Show the matches page
        await ctx.edit(
          await matchesPage(app, {
            state: matches_view_sig.newState({
              guild_id: ctx.interaction.guild_id,
              user_ids: input.user?.id ? [input.user?.id] : undefined,
            }),
          }),
        )

        let x = 0 as any as CommandHandler<
          CommandSignature<StringDataSchema, D.ApplicationCommandType.ChatInput, true>,
          App
        >

        let y: CommandHandler<CommandSignature<StringDataSchema, AnyAppCommandType, true>, App> = x

        return void ctx.followup({
          content: `Please select a match to settle. Type ${commandMention(app, matches_cmd, ctx.interaction.guild_id)} to see all matches`,
          flags: D.MessageFlags.Ephemeral,
        })
      }
    })
  },
})
