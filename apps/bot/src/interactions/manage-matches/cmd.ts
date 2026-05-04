import { CommandSignature, getOptions } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { MatchStatus } from '@repo/db/models'
import { AppErrors } from '../../errors/app-errors'
import { UserError } from '../../errors/user-errors'
import { App } from '../../setup/app'
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
    if ((await app.rankings.numRankings(app, guild_id)) == 0) return null
    return match_cmd_sig
  },

  onAutocomplete: async (ctx, app) => {
    const interaction = ctx.interaction
    if (!interaction.guild_id) return { choices: [] }

    // Walk options to find the focused option and the sibling `player` option (within the same subcommand)
    const subcommand_option = interaction.data.options?.[0] as
      | D.APIApplicationCommandInteractionDataSubcommandOption
      | undefined
    const sub_options = subcommand_option?.options ?? []

    const focused = sub_options.find(o => 'focused' in o && o.focused) as
      | D.APIApplicationCommandInteractionDataIntegerOption
      | D.APIApplicationCommandInteractionDataStringOption
      | undefined
    if (!focused || focused.name !== optionnames.match_id) return { choices: [] }

    const partial = String(focused.value ?? '').trim().toLowerCase()

    const player_option = sub_options.find(o => o.name === optionnames.user) as
      | D.APIApplicationCommandInteractionDataUserOption
      | undefined

    const matches = await app.db.matches.getMany({
      guild_id: interaction.guild_id,
      user_ids: player_option?.value ? [player_option.value] : undefined,
      limit: 25,
    })

    const status_label: Record<MatchStatus, string> = {
      [MatchStatus.Finished]: '',
      [MatchStatus.Ongoing]: ' [ongoing]',
      [MatchStatus.Canceled]: ' [canceled]',
    }

    const formatted = await Promise.all(
      matches.map(async ({ match, team_players }) => {
        const ranking = await match.ranking.fetch()
        const teams_text = team_players
          .map(team => team.map(mp => mp.player.data.name).join('+'))
          .join(' vs ')
        const when = (match.data.time_finished ?? match.data.time_started)?.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }) ?? ''
        const label = `#${match.data.number} · ${ranking.data.name} · ${teams_text}${when ? ` · ${when}` : ''}${status_label[match.data.status]}`
        return {
          id: match.data.id,
          number: match.data.number,
          name: label.length > 100 ? label.slice(0, 97) + '...' : label,
        }
      }),
    )

    const filtered = partial
      ? formatted.filter(
          c => String(c.id) === partial || String(c.number).startsWith(partial) || c.name.toLowerCase().includes(partial),
        )
      : formatted

    return {
      choices: filtered.slice(0, 25).map(c => ({ name: c.name, value: c.id })),
    }
  },

  onCommand: async (ctx, app) => {
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
          await app.matches.cancel(app, match, ctx.interaction)
          await ctx.edit({
            content: `Match ${match.data.id} has been reverted`,
          })
        } else if (subcommand === subcommandnames.set_draw) {
          await app.matches.setMatchDraw(app, match, ctx.interaction)
          return void (await ctx.edit({
            content: `Match ${match.data.id} has been set as a draw`,
          }))
        } else if (subcommand === subcommandnames.set_winner) {
          if (!options.user?.id) {
            throw new UserError(`Please specify the player to set as winner`)
          }
          const winner = await app.players.getOrCreatePlayerByUser(app, options.user.id, match.ranking)
          await app.matches.setWinner(app, match, winner, ctx.interaction)
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
