import { CommandSignature, getOptions } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { AppErrors } from '../../../../errors/app-errors'
import { UserError } from '../../../../errors/user-errors'
import { App } from '../../../../setup/app'
import { ensureAdminPerms } from '../../../../utils'
import { numRankings } from '../../../guilds/properties'
import { getOrCreatePlayerByUser } from '../../../players/manage'
import { cancelMatch, setMatchDraw, setMatchWinner } from '../../management/update-matches'
import { manage_match_view_sig, manageMatchPage } from './view'

const optionnames = {
  match_id: `match_id`,
  user: `player`,
}

const subcommandnames = {
  manage: `manage`,
  revert: `revert`,
  set_draw: `setdraw`,
  set_winner: `setwinner`,
}

export const match_cmd_sig = new CommandSignature({
  name: `match`,
  type: D.ApplicationCommandType.ChatInput,
  description: `Manage a match`,
  options: [
    // {
    //   type: D.ApplicationCommandOptionType.String,
    //   name: optionnames.action,
    //   description: `What to do to the match`,
    //   required: false,
    //   choices: [
    //     {
    //       name: `set winner`,
    //       value: `set winner`,
    //     },
    //     {
    //       name: `set draw`,
    //       value: `set draw`,
    //     },
    //     {
    //       name: `cancel`,
    //       value: `cancel`,
    //     },
    //   ],
    // },
    // {
    //   type: D.ApplicationCommandOptionType.User,
    //   name: optionnames.user,
    //   description: `The player to set as winner or whose match to choose`,
    //   required: false,
    // },
    // {
    //   type: D.ApplicationCommandOptionType.Integer,
    //   name: optionnames.match_id,
    //   description: `The match to manage. Defaults to the selected player's last match.`,
    //   required: false,
    // },
    {
      type: D.ApplicationCommandOptionType.Subcommand,
      name: subcommandnames.manage,
      description: `Edit a match`,
      options: [
        {
          type: D.ApplicationCommandOptionType.Integer,
          name: optionnames.match_id,
          description: `The ID of the match (optional). Defaults to the selected player's last match.`,
          required: false,
          autocomplete: true,
        },
        {
          type: D.ApplicationCommandOptionType.User,
          name: optionnames.user,
          description: `The player whose most recent match to manage`,
          required: false,
        },
      ],
    },
    {
      type: D.ApplicationCommandOptionType.Subcommand,
      name: `revert`,
      description: `Revert or cancel a match`,
      options: [
        {
          type: D.ApplicationCommandOptionType.Integer,
          name: optionnames.match_id,
          description: `The ID of the match (optional). Defaults to the selected player's last match.`,
          required: false,
          autocomplete: true,
        },
        {
          type: D.ApplicationCommandOptionType.User,
          name: optionnames.user,
          description: `The player whose most recent match to revert`,
          required: false,
        },
      ],
    },
    {
      type: D.ApplicationCommandOptionType.Subcommand,
      name: `setdraw`,
      description: `Set a match as a draw`,
      options: [
        {
          type: D.ApplicationCommandOptionType.Integer,
          name: optionnames.match_id,
          description: `The ID of the match (optional). Defaults to the selected player's last match.`,
          required: false,
          autocomplete: true,
        },
        {
          type: D.ApplicationCommandOptionType.User,
          name: optionnames.user,
          description: `The player whose most recent match to set as draw`,
          required: false,
        },
      ],
    },
    {
      type: D.ApplicationCommandOptionType.Subcommand,
      name: `setwinner`,
      description: `Revert or cancel a match`,
      options: [
        {
          type: D.ApplicationCommandOptionType.User,
          name: optionnames.user,
          description: `The player to set as winner`,
          required: true,
        },
        {
          type: D.ApplicationCommandOptionType.Integer,
          name: optionnames.match_id,
          description: `The ID of the match (optional). Defaults to the selected player's last match.`,
          required: false,
          autocomplete: true,
        },
      ],
    },
  ],
})

export const match_cmd = match_cmd_sig.set<App>({
  guildSignature: async (app, guild_id) => {
    const guild = app.db.guilds.get(guild_id)
    if ((await numRankings(app, guild)) == 0) return null
    return match_cmd_sig
  },

  onCommand: async (ctx, app) => {
    await ensureAdminPerms(app, ctx)

    const { options, subcommand } = getOptions(ctx.interaction, {
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

    return ctx.defer(async ctx => {
      app.logger.debug(`manage match. ${options.match_id}, ${options.user}`)

      // Determine the match to act on, from the input. Also get its players
      const match = await (async function () {
        if (undefined !== options.match_id) {
          // match id was provided. Get the match by id, but make sure it is part of this guild
          const match = await app.db.matches.fetch(options.match_id, ctx.interaction.guild_id)
          return match
        } else if (options.user?.id) {
          // user id was provided. get their latest match in the guild
          const matches = await app.db.matches.getMany({
            guild_id: ctx.interaction.guild_id,
            user_ids: [options.user.id],
            limit: 1,
          })
          if (matches.length === 0) {
            throw new UserError(`<@${options.user?.id}> has not played any matches in this server`)
          }
          return matches[0].match
        } else {
          throw new UserError(`Please specify either the match id or user`)
        }
      })()

      // Act on the match, based on the selected action or match
      if (subcommand) {
        if (subcommand === subcommandnames.revert) {
          await cancelMatch(app, match)
          return void (await ctx.edit({
            content: `Match ${match.data.id} has been reverted`,
          }))
        } else if (subcommand === subcommandnames.set_draw) {
          await setMatchDraw(app, match)
          return void (await ctx.edit({
            content: `Match ${match.data.id} has been set as a draw`,
          }))
        } else if (subcommand === subcommandnames.set_winner) {
          if (!options.user?.id) {
            throw new UserError(`Please specify the player to set as winner`)
          }
          const winner = await getOrCreatePlayerByUser(app, options.user.id, match.ranking)
          await setMatchWinner(app, match, winner)
          return void (await ctx.edit({
            content: `<@${options.user.id}> has been set as the winner of match ${match.data.id}`,
          }))
        } else if (subcommand === subcommandnames.manage) {
          // Show the match settings page
          const state = manage_match_view_sig.newState({
            match_id: match.data.id,
          })
          return void (await ctx.edit(await manageMatchPage(app, { ...ctx, state })))
        } else {
          throw new AppErrors.UnhandledState(`/match subcommand: ${subcommand}`)
        }
      }
    })
  },
})
