import { Context, MessageData } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import {
  challenge_cmd,
  create_ranking_cmd,
  join_cmd,
  leave_cmd,
  matches_cmd,
  profile_cmd,
  record_match_cmd,
  settings_cmd,
  settle_match_cmd,
  start_match_cmd,
} from '../../../setup/all-interaction-handlers'
import { App } from '../../../setup/app'
import { breadcrumbsTitle, Colors, commandMention, dateTimestamp, Messages } from '../../../utils'
import { getOrAddGuild } from '../../guilds/manage-guilds'
import { setup_cmd } from '../../setup-ui/setup-cmd'
import { helpComponents } from './components'
import { help_view_sig } from './view'


type Page = (app: App, ctx: Context<typeof help_view_sig>) => Promise<MessageData>

export const overviewPage: Page = async (app, ctx) => {
  const last_deployed = (await app.db.settings.getOrUpdate()).data.last_updated

  const lastDeployed = last_deployed ? dateTimestamp(last_deployed) : 'unknown'

  const embed: D.APIEmbed = {
    title: '🏅 Leaderboards',
    description:
      Messages.concise_description +
      `\n\nType ${await commandMention(app, settings_cmd, ctx.interaction.guild_id)} to get started.`,
    fields: [
      {
        name: `Source Code`,
        value: `This bot is open source! [Source Code](${app.config.GithubUrl})`,
        inline: true,
      },
      {
        name: `Version`,
        value: `Last updated on ${lastDeployed}`,
        inline: true,
      },
      {
        name: `Support Server`,
        value: `${app.config.SupportServerInvite}`,
        inline: true,
      },
    ],
    color: Colors.EmbedBackground,
  }

  return new MessageData({
    embeds: [embed],
    components: await helpComponents(app, ctx),
  })
}

export const adminGuidePage: Page = async (app, ctx) => {
  const guild = ctx.interaction.guild_id ? await getOrAddGuild(app, ctx.interaction.guild_id) : undefined
  const guild_id = guild?.data.id

  const embed = {
    title: breadcrumbsTitle('Help', 'Admin Guide'),
    fields: [
      {
        name: `Setup`,
        value:
          `Every player, match, and rating that this bot tracks belongs to a **ranking**.` +
          ` You might want to have a separate ranking for different games or gamemodes.` +
          `\n- ${await commandMention(app, setup_cmd)}: Quick start to set up the bot in this server.` +
          `\n- ${await commandMention(app, create_ranking_cmd)} \`name\`: create one or more rankings.` +
          `\n- ${await commandMention(app, settings_cmd, guild_id)} \`ranking\`: manage rankings in this server. Enter a specific ranking to view or manage it.`,
      },
      {
        name: `Recording Matches`,
        value:
          `There are multiple ways to initiate matches between other players.` +
          `\n- ${await commandMention(app, start_match_cmd, guild_id)}: Admins can start a match between two players.` +
          `\n- ${await commandMention(app, record_match_cmd, guild_id)}: Admins can directly record the result of a match that has already been played.` +
          `\n> -# When you use this command, you can provide a [unix timestamp](https://www.unixtimestamp.com/) or Discord ID for the \`when\` parameter.` +
          ` All Discord IDs are [associated with a timestamp](https://discord.com/developers/docs/reference#snowflakes). If you provide a Discord ID, the bot will use the timestamp from that ID to set the match's date and time. This means that, for instance, you can copy and paste the ID of a message that was sent when the match was played to set the match's time.`,
      },
      {
        name: `Managing Matches`,
        value:
          `View or manage matches with the following commands:` +
          `\n- ${await commandMention(app, matches_cmd, guild_id)} \`player\`: View the match history for this server.` +
          `\n- ${await commandMention(app, settle_match_cmd)}: Revert or set the outcome of a specific match. The \`match-id\` parameter is optional, and defaults to the last match that the selected player was in.` +
          ` Reverting a match undoes the effect it had on the players' ratings.` +
          `\n> -# Note: changing the outcome of an old match may have a cascading effect on the ratings of players who were in subsequent matches, because of the way ratings are calculated.`,
      },
      {
        name: `Admin & Settings`,
        value:
          `In order do anything that requires permissions, such as overriding match results, you either need server admin perms or the` +
          ` ${guild?.data.admin_role_id ? `<@&${guild.data.admin_role_id}> role` : `admin role, which can be configured using ${await commandMention(app, setup_cmd)}`}. `,
      },
    ],
    color: Colors.EmbedBackground,
  }

  return new MessageData({
    embeds: [embed],
    components: await helpComponents(app, ctx),
  })
}

export const playerGuidePage: Page = async (app, ctx) => {
  const guild = ctx.interaction.guild_id ? await getOrAddGuild(app, ctx.interaction.guild_id) : undefined
  const guild_id = guild?.data.id

  const embed = {
    title: breadcrumbsTitle('Help', 'Player Guide'),
    fields: [
      {
        name: `Playing Ranked Matches`,
        value:
          `There are multiple ways to initiate matches.` +
          `\n- ${await commandMention(app, challenge_cmd, guild_id)} \`[opponent]\`: Challenge someone to a 1v1 match.` +
          ` They will have ${app.config.ChallengeTimeoutMinutes} minutes to accept.` +
          `\n- ${await commandMention(app, join_cmd, guild_id)}: If the queue is enabled, you can join the queue for a ranking. Once enough players join the queue, matches are automatically created based on estimated skill. Enter ${await commandMention(app, leave_cmd, guild_id)} to leave all queues you are in.` +
          `\n- Once a match is initiated, the bot creates a temporary thread where players can discuss the match and record its result.`,
      },
      {
        name: `Viewing Matches & Stats`,
        value:
          `- ${await commandMention(app, matches_cmd, guild_id)} \`[player] [ranking]\`: View the match history for a particular player or ranking.` +
          `\n- ${await commandMention(app, profile_cmd, guild_id)} \`[player]\`: View the profile and stats of a player in this server.`,
      },
    ],
    color: Colors.EmbedBackground,
  }

  return new MessageData({
    embeds: [embed],
    components: await helpComponents(app, ctx),
  })
}

export const ratingsPage: Page = async (app, ctx) => {
  const guild = ctx.interaction.guild_id ? await getOrAddGuild(app, ctx.interaction.guild_id) : undefined

  const guild_id = guild?.data.id

  const embed = {
    title: breadcrumbsTitle('Help', 'Ratings'),
    description: `The bot tracks every player's **estimated skill level** (Also known as their rating, elo, score, number of points, etc.) as they play matches. 
    
For each ranking, you can choose any of the following rating methods that the bot can use to calculate ratings. You can then modify their parameters (such the starting rating and standard deviation) to tweak the algorithm to your liking.

To do edit these, use ${await commandMention(app, settings_cmd, guild_id)} \`[ranking] "Rating Algorithm"\`
### Rating Methods
**Wins - Losses**
-# The simplest method. Awards one point to a player for winning a game, and deducts one point for losing.
**[Elo](https://en.wikipedia.org/wiki/Elo_rating_system)**
-# The standard chess Elo rating system. Awards more points for unlikely wins, and deducts more points for unlikely losses.
**[Glicko](https://en.wikipedia.org/wiki/Glicko_rating_system)**
-# A Bayesian enhancement of Elo. Introduces the "Ratings Deviation" (RD) to quantify the uncertainty of a player's skill level. Inactive players have a higher RD, causing their ratings to change more dramatically.
**[TrueSkill2](https://en.wikipedia.org/wiki/TrueSkill)**
-# Designed by Microsoft for multiplayer games with more than two participants. It represents skill as a bell curve (mean and variance) and updates every player's rating based on their individual rating and team's performance in a match.
    `,
  }

  return new MessageData({
    embeds: [embed],
    components: await helpComponents(app, ctx),
  })
}
