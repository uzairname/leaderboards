import { ActionRowBuilder, ButtonBuilder, ContainerBuilder, EmbedBuilder, MessageActionRowComponentBuilder, SectionBuilder, SeparatorBuilder, StringSelectMenuBuilder, TextDisplayBuilder } from '@discordjs/builders'
import { RatingStrategy } from '@repo/db/models'
import { Context, MessageData } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { RankingSettingsHandlers } from '.'
import { challenge_cmd, help_cmd, join_cmd } from '../../../setup/all-interaction-handlers'
import { App } from '../../../setup/app'
import { breadcrumbsTitle, Colors, commandMention, dateTimestamp, escapeMd } from '../../../utils'
import { leaderboard_cmd } from '../../leaderboard/ui/cmd'
import { syncMatchesChannel } from '../../matches/logging/matches-channel'
import { matches_view_sig } from '../../matches/ui/matches/view'
import {
  DEFAULT_LB_COLOR,
  default_matchmaking_settings,
  liveLbMsgLink,
  rating_strategy_name,
} from '../../rankings/properties'
import { settings_view_sig } from '../settings/view'
import { settingsOptions } from './common'
import { ranking_settings_view_sig } from './view'

/**
 * Edits the page to the main ranking settings page
 * Must be from a deferred context bc it might take a while to load
 */
export async function main(
  app: App,
  ctx: Context<typeof ranking_settings_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const { guild, guild_ranking, ranking } = await app.db.guild_rankings.fetch({
    guild_id: ctx.interaction.guild_id,
    ranking_id: ctx.state.get.ranking_id(),
  })

  const time_created = ranking.data.time_created
  const teams_per_match = ranking.data.teams_per_match
  const players_per_team = ranking.data.players_per_team

  // Get the match logs channel if it's enabled
  const match_logs_channel_id = guild_ranking.data.display_settings?.log_matches
    ? (await syncMatchesChannel(app, guild_ranking.guild))?.id
    : undefined

  const lb_msg_link = liveLbMsgLink(guild_ranking)

  const description =
    `# ${escapeMd(ranking.data.name)}\n` +
    `This is the settings panel for the ranking ${escapeMd(ranking.data.name)}. Use the dropdown below to manage the settings.`


  const select_menu_row = new ActionRowBuilder<StringSelectMenuBuilder>().setComponents(
    new StringSelectMenuBuilder({
      placeholder: 'Select a setting to change',
      custom_id: ctx.state.set.handler(RankingSettingsHandlers.onSettingSelect).cId(),
      options: Object.entries(settingsOptions({ guild_ranking, ranking })).map(([key, option]) => ({
        ...option,
        value: key,
      })),
    }),
  )

  const back_btn_row = new ActionRowBuilder<ButtonBuilder>().setComponents(
    new ButtonBuilder({
      label: `Back`,
      style: D.ButtonStyle.Secondary,
      custom_id: settings_view_sig.newState().cId(),
      emoji: { name: '⬅️' },
    }),
  )

  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder({
      content: description +
        `\n## General\n` + (lb_msg_link
          ? `- The live leaderboard is displayed in ${lb_msg_link}`
          : `- View the leaderboard with ${await commandMention(app, leaderboard_cmd, guild.data.id)}`) +
        `\n- This ranking was created on ${dateTimestamp(time_created)}` +
        (app.config.IsDev ? `\n- Ranking id: \`${ranking.data.id}\`` : ``)
      ,
    }))
    .addTextDisplayComponents(new TextDisplayBuilder({
      content: `## Matches\n` +
        `- Match type: **` + new Array(teams_per_match).fill(players_per_team).join('v') + `**` +
        (match_logs_channel_id
          ? `\n- Matches are logged in <#${match_logs_channel_id}>`
          : `\n- Matches are not logged anywhere`) +
        `\n- Matchmaking queue: ` +
        (ranking.data.matchmaking_settings.queue_enabled ? `**✅ Enabled**` : `**❌ Disabled**`) +
        `\n- Direct challenges (via ${await commandMention(app, challenge_cmd, guild_ranking.data.guild_id)} \`${ranking.data.name}\`): ` +
        (ranking.data.matchmaking_settings.direct_challenge_enabled ? `**✅ Enabled**` : `**❌ Disabled**`) +
        `\n- Draws are ` + (ranking.data.match_settings?.draws_allowed ? `**✅ Allowed**` : `**❌ Disabled**`) +
        `\n- Matches are assumed to be a best of **${ranking.data.matchmaking_settings.default_best_of ?? default_matchmaking_settings.default_best_of}**`
    }))
    .addTextDisplayComponents(new TextDisplayBuilder({
      content: `## Ratings\n` +
        `- Rating method: **${rating_strategy_name[ranking.data.rating_settings.rating_strategy]}**`
    }))

    .addActionRowComponents(select_menu_row)

    .setAccentColor(guild_ranking.data.display_settings?.color ?? DEFAULT_LB_COLOR)


  const msg = new MessageData({
    components: [container.toJSON(), back_btn_row.toJSON()],
  }).addFlags(D.MessageFlags.Ephemeral | D.MessageFlags.IsComponentsV2)

  return msg.response_data
}

/**
 *
 * Select menu to select a rating method.
 * Redirects to the ranking settings page's rating method select handler
 */
export async function ratingSettings(
  app: App,
  ctx: Context<typeof ranking_settings_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const { ranking, guild_ranking } = await app.db.guild_rankings.fetch({
    guild_id: ctx.interaction.guild_id,
    ranking_id: ctx.state.get.ranking_id(),
  })

  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder({

      content: `## Rating Settings` +
        `\nCustomize the algorithm that updates players' ratings as they play games. Use ${await commandMention(app, help_cmd)} for more information.` +
        `\nWhen you make changes to the rating method, every player's rating will be retroactively recalculated according to the new algorithm. The result will be no different than if you used the new algorithm from the start. This may take a few seconds for large servers`
    }))
    .addSeparatorComponents(new SeparatorBuilder({ spacing: D.SeparatorSpacingSize.Large }))

    .addTextDisplayComponents(new TextDisplayBuilder({
      content: `### Rating method\nCurrently using the **${rating_strategy_name[ranking.data.rating_settings.rating_strategy]}** rating method`
    }))
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>()
        .setComponents(
          new StringSelectMenuBuilder({
            custom_id: ctx.state.set.handler(RankingSettingsHandlers.onRatingMethodSelect).cId(),
            placeholder: 'Change rating method to...',
            options: [
              {
                label: 'Bayesian',
                value: RatingStrategy.Bayesian.toString(),
                description: `A Bayesian rating algorithm`,
              },
              {
                label: 'Glicko',
                value: RatingStrategy.Glicko.toString(),
                description: `A widely used Bayesian rating system`,
              },
              {
                label: 'Trueskill2',
                value: RatingStrategy.TrueSkill.toString(),
                description: `Microsoft's TrueSkill2 rating algorithm`,
              },
              {
                label: 'Elo',
                value: RatingStrategy.Elo.toString(),
                description: `The standard Elo rating system used in Chess`,
              },
              {
                label: 'Wins Minus Losses',
                value: RatingStrategy.WinsMinusLosses.toString(),
                description: `Gain 1 point for winning, lose 1 point for losing`,
              },
            ],
          }),
        )
    )
    .addSeparatorComponents((new SeparatorBuilder({ spacing: D.SeparatorSpacingSize.Large })))

    .addTextDisplayComponents(new TextDisplayBuilder({
      content: `### Algorithm Parameters` +
        `\n\`\`\`json\n${JSON.stringify(
          {
            mu: ranking.data.rating_settings.initial_rating.mu,
            rd: ranking.data.rating_settings.initial_rating.rd,
            vol: ranking.data.rating_settings.initial_rating.vol,
            tau: ranking.data.rating_settings.tau,
            k: ranking.data.rating_settings.k_factor,
          },
          null,
          2,
        )}\n\`\`\``
    }))

    .addActionRowComponents(
      new ActionRowBuilder<MessageActionRowComponentBuilder>()
        .addComponents(new ButtonBuilder({
          label: `Edit Parameters`,
          style: D.ButtonStyle.Primary,
          custom_id: ctx.state.set.handler(RankingSettingsHandlers.sendRatingParamsModal).cId(),
        }))
    )
    .setAccentColor(guild_ranking.data.display_settings?.color ?? DEFAULT_LB_COLOR)


  const back_btn_row = new ActionRowBuilder<MessageActionRowComponentBuilder>()
    .addComponents(new ButtonBuilder({
      label: `Back`,
      style: D.ButtonStyle.Secondary,
      custom_id: ctx.state.set.handler(RankingSettingsHandlers.sendMainPage).cId(),
      emoji: { name: '⬅️' },
    }))

  const msg = new MessageData({
    components: [container.toJSON(), back_btn_row.toJSON()],
  }).addFlags(D.MessageFlags.Ephemeral | D.MessageFlags.IsComponentsV2)

  return msg.response_data
}

/**
 * Appearance settings page. Contains a button to change the leaderboard color.
 */
export async function appearance(
  app: App,
  ctx: Context<typeof ranking_settings_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const { ranking, guild_ranking } = await app.db.guild_rankings.fetch({
    guild_id: ctx.interaction.guild_id,
    ranking_id: ctx.state.get.ranking_id(),
  })

  const lb_msg_link = liveLbMsgLink(guild_ranking)

  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder({
      content: `# Appearance\nCustomize how the leaderboard looks when it's displayed in Discord`,
    }))
    .addSeparatorComponents(new SeparatorBuilder({ spacing: D.SeparatorSpacingSize.Large }))
    .addSectionComponents(
      new SectionBuilder(
      )
        .addTextDisplayComponents(new TextDisplayBuilder({
          content: `**Color**: The color of the leaderboard embed. You can use a [color picker](https://htmlcolorcodes.com/color-picker/) to find one. Enter the hex code`,
        }))
        .setButtonAccessory(
          new ButtonBuilder({
            style: D.ButtonStyle.Primary,
            custom_id: ctx.state.set.handler(RankingSettingsHandlers.sendColorModal).cId(),
            label: `Color`,
          }
          ))
    )
    .addSeparatorComponents(new SeparatorBuilder({ spacing: D.SeparatorSpacingSize.Small }))
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder({
          content: `**Live Leaderboard**: If enabled, the bot will maintain a public leaderboard message in real time. If disabled, you can always view the leaderboard using ${await commandMention(app, leaderboard_cmd, guild_ranking.data.guild_id)} \`${ranking.data.name}\`. Currently, ` +
            (lb_msg_link
              ? `the live leaderboard is displayed in ${lb_msg_link}`
              : `the live leaderboard is **disabled**`)
        }))
        .setButtonAccessory(
          new ButtonBuilder({
            style: guild_ranking.data.display_settings?.leaderboard_message
              ? D.ButtonStyle.Success
              : D.ButtonStyle.Danger,
            custom_id: ctx.state.set.handler(RankingSettingsHandlers.onToggleLiveLeaderboard).cId(),
            label: guild_ranking.data.display_settings?.leaderboard_message
              ? `📃 Disable`
              : `📃 Enable`,
          }))

    )
    .setAccentColor(guild_ranking.data.display_settings?.color ?? DEFAULT_LB_COLOR)

  const back_btn_row = new ActionRowBuilder<ButtonBuilder>()
    .setComponents(
      new ButtonBuilder({
        label: `Back`,
        custom_id: ctx.state.set.handler(RankingSettingsHandlers.sendMainPage).cId(),
        style: D.ButtonStyle.Secondary,
        emoji: { name: '⬅️' },
      }),
    )

  const msg = new MessageData({
    components: [container.toJSON(), back_btn_row.toJSON()],
  }).addFlags(D.MessageFlags.Ephemeral | D.MessageFlags.IsComponentsV2)

  return msg.response_data
}

export async function matchSettings(
  app: App,
  ctx: Context<typeof ranking_settings_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const { ranking, guild_ranking } = await app.db.guild_rankings.fetch({
    guild_id: ctx.interaction.guild_id,
    ranking_id: ctx.state.get.ranking_id(),
  })

  const queue_enabled = ranking.data.matchmaking_settings?.queue_enabled
  const challenges_enabled = ranking.data.matchmaking_settings?.direct_challenge_enabled
  const draws_allowed = ranking.data.match_settings?.draws_allowed

  return {
    embeds: [
      new EmbedBuilder({
        title: breadcrumbsTitle(`Settings`, `Rankings`, escapeMd(ranking.data.name), `Match Settings`),
        description: `# Match Settings

Here you can manage the following:
- **Matchmaking Queue (${queue_enabled ? `enabled` : `disabled`}):** If enabled, players can join the matchmaking queue by using ${await commandMention(app, join_cmd, ctx.interaction.guild_id)} \`${ranking.data.name}\` to find a match. Only applies to this ranking.
- **Direct Challenges (${challenges_enabled ? `enabled` : `disabled`}):** If enabled, players can challenge each other using ${await commandMention(app, challenge_cmd, ctx.interaction.guild_id)} \`${ranking.data.name}\`. Only applies to this ranking.
- **Draws (${draws_allowed ? `allowed` : `disabled`}):** If enabled, matches can end in a draw. Note: unlike canceled matches, draws may have an effect on player ratings.
`,
        color: guild_ranking.data.display_settings?.color ?? DEFAULT_LB_COLOR,
      }).toJSON(),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>()
        .setComponents(
          new ButtonBuilder({
            label: `Back`,
            custom_id: ctx.state.set.handler(RankingSettingsHandlers.sendMainPage).cId(),
            style: D.ButtonStyle.Secondary,
            emoji: { name: '⬅️' },
          }),
          new ButtonBuilder({
            label: `🔎${queue_enabled ? `Disable` : `Enable`} the queue`,
            custom_id: ctx.state.set.handler(RankingSettingsHandlers.onToggleQueue).cId(),
            style: queue_enabled ? D.ButtonStyle.Success : D.ButtonStyle.Danger,
          }),
          new ButtonBuilder({
            label: challenges_enabled ? `⚔️ Disable Direct Challenges` : `⚔️ Enable Direct Challenges`,
            custom_id: ctx.state.set.handler(RankingSettingsHandlers.onToggleChallenge).cId(),
            style: ranking.data.matchmaking_settings?.direct_challenge_enabled
              ? D.ButtonStyle.Success
              : D.ButtonStyle.Danger,
          }),
          new ButtonBuilder({
            label: draws_allowed ? `🤝 Disable Draws` : `🤝 Allow Draws`,
            custom_id: ctx.state.set.handler(RankingSettingsHandlers.onToggleDraws).cId(),
            style: draws_allowed ? D.ButtonStyle.Success : D.ButtonStyle.Danger,
          }),
        )
        .toJSON(),
    ],
  }
}

export async function deleteConfirm(
  app: App,
  ctx: Context<typeof ranking_settings_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())

  return {
    embeds: [
      new EmbedBuilder({
        title: breadcrumbsTitle(`Settings`, `Rankings`, escapeMd(ranking.data.name), `Delete`),
        description: `# Delete ${escapeMd(ranking.data.name)}?
This will delete all of its players and match history`,
        color: Colors.EmbedBackground,
      }).toJSON(),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>()
        .setComponents(
          new ButtonBuilder({
            label: `Back`,
            custom_id: ctx.state.set.handler(RankingSettingsHandlers.sendMainPage).cId(),
            style: D.ButtonStyle.Secondary,
            emoji: { name: '⬅️' },
          }),
          new ButtonBuilder({
            label: `Delete`,
            custom_id: ctx.state.set.handler(RankingSettingsHandlers.onDeleteConfirmBtn).cId(),
            style: D.ButtonStyle.Danger,
          }),
        )
        .toJSON(),
    ],
    flags: D.MessageFlags.Ephemeral,
  }
}
