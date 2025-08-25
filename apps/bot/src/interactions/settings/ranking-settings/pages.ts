import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  MessageActionRowComponentBuilder,
  RoleSelectMenuBuilder,
  SectionBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
} from '@discordjs/builders'
import { OutcomeType, RatingStrategy } from '@repo/db/models'
import { Context } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { syncMatchesChannel } from '../../../services/matches/logging/matches-channel'
import { DEFAULT_LB_COLOR, liveLbMsgLink, outcome_type_name } from '../../../services/rankings/properties'
import { rating_strategy_name } from '../../../services/rankings/ratings'
import { commandMention, dateTimestamp, escapeMd } from '../../../services/utils/strings'
import { App } from '../../../setup/app'
import { challenge_1v1_cmd, help_cmd, join_cmd, leaderboard_cmd, send_cmd } from '../../all-interaction-handlers'
import { scnames } from '../../misc-commands/send-cmd'
import { makeSettingsPage } from './common'
import {
  onDeleteConfirmBtn,
  onQueuePingRoleSelect,
  onRankRoleSelect,
  onRatingMethodSelect,
  onToggleChallenge,
  onToggleDraws,
  onToggleLiveLeaderboard,
  onToggleQueue,
  onUnsetRankRole,
  sendColorModal,
  sendEditRangeModal,
  sendQueueJoinTimeoutModal,
  sendRankRolesPage,
  sendRatingParamsModal,
  setOutcomeType,
  unsetQueuePingRole,
} from './handlers'
import { ranking_settings_view_sig } from './view'

/**
 * The main ranking settings page
 */
export async function main(
  app: App,
  ctx: Context<typeof ranking_settings_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const { guild, guild_ranking, ranking } = await app.db.guild_rankings.fetch({
    guild_id: ctx.interaction.guild_id,
    ranking_id: ctx.state.get.ranking_id(),
  })

  const props = app.rankings.getProperties(ranking)

  const lb_msg_link = liveLbMsgLink(guild_ranking)

  // Get the match logs channel if it's enabled
  const match_logs_channel_id = guild_ranking.data.display_settings?.log_matches
    ? (await syncMatchesChannel(app, guild_ranking.guild))?.id
    : undefined

  const description =
    `# ${escapeMd(ranking.data.name)}\n` +
    `This is the settings panel for the ranking ${escapeMd(ranking.data.name)}. Use the dropdown below to manage the settings.`

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder({
        content:
          description +
          `\n## General\n` +
          (lb_msg_link
            ? `- The live leaderboard is displayed in ${lb_msg_link}`
            : `- View the leaderboard with ${await commandMention(app, leaderboard_cmd, guild.data.id)}`) +
          `\n- This ranking was created on ${dateTimestamp(ranking.data.time_created)}` +
          (app.config.IsDev ? `\n- Ranking id: \`${ranking.data.id}\`` : ``),
      }),
    )

    .addTextDisplayComponents(
      new TextDisplayBuilder({
        content:
          `## Matches\n` +
          `- Match type: **${props.match_type_name}**` +
          (match_logs_channel_id
            ? `\n- Matches are logged in <#${match_logs_channel_id}>`
            : `\n- Matches are not logged anywhere`) +
          `\n- Matchmaking queue: ` +
          (props.matchmaking_settings.queue_enabled ? `**✅ Enabled**` : `**❌ Disabled**`) +
          `\n- Direct challenges (via ${await commandMention(app, challenge_1v1_cmd, guild_ranking.data.guild_id)} \`${ranking.data.name}\`): ` +
          (props.matchmaking_settings.direct_challenge_enabled ? `**✅ Enabled**` : `**❌ Disabled**`) +
          `\n- Draws are ` +
          (ranking.data.match_settings?.draws_allowed ? `**✅ Allowed**` : `**❌ Disabled**`) +
          `\n- Matches are assumed to be a best of **${props.matchmaking_settings.default_best_of}**`,
      }),
    )

    .addTextDisplayComponents(
      new TextDisplayBuilder({
        content:
          `## Ratings\n` + `- Rating method: **${rating_strategy_name[ranking.data.rating_settings.rating_strategy]}**`,
      }),
    )

  return makeSettingsPage(ctx, [container], ranking, guild_ranking, true)
}

/**
 *
 * Select menu to select a rating method.
 * Redirects to the ranking settings page's rating method select handler
 */
export async function scoringSettings(
  app: App,
  ctx: Context<typeof ranking_settings_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const { ranking, guild_ranking } = await app.db.guild_rankings.fetch({
    guild_id: ctx.interaction.guild_id,
    ranking_id: ctx.state.get.ranking_id(),
  })

  const props = app.rankings.getProperties(ranking)
  
  // Outcomes
  const draws_allowed = props.match_settings.draws_allowed
  const outcome_type = props.match_settings.outcome_type


  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder({
      content: `## Scoring Settings for **${escapeMd(ranking.data.name)}**`
    }))


    container
      .addSeparatorComponents(new SeparatorBuilder({ spacing: D.SeparatorSpacingSize.Large }))
  
      .addTextDisplayComponents(
        new TextDisplayBuilder({
          content:
            `### 📝 Match Outcome Type: ${outcome_type_name[outcome_type]}` +
            `\nThe match outcome type determines the information required in order to record a match in this ranking. Your options are:` +
            `\n- **${outcome_type_name[OutcomeType.WinLossDraw]}**: The simplest outcome. There is either a single winner, or the match is a full draw (if enabled).` +
            `\n- **${outcome_type_name[OutcomeType.Ranks]}**: The teams finish in a certain order, with ranks such as 1st place, 2nd place, 3rd place, etc.` +
            `\n- **${outcome_type_name[OutcomeType.Points]}**: Each team accumulates a certain number of points. Allows the rating algorithm to take into account margin of victory. Useful for free-for-alls, "best-of" series results, or games like like tennis.`,
        }),
      )
      .addActionRowComponents(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder({
            label: outcome_type_name[OutcomeType.WinLossDraw],
            style: D.ButtonStyle.Secondary,
            custom_id: ctx.state.set.handler(setOutcomeType).set.selected_outcome_type(OutcomeType.WinLossDraw).cId(),
            disabled: outcome_type === OutcomeType.WinLossDraw,
          }),
          new ButtonBuilder({
            label: outcome_type_name[OutcomeType.Ranks],
            style: D.ButtonStyle.Secondary,
            custom_id: ctx.state.set.handler(setOutcomeType).set.selected_outcome_type(OutcomeType.Ranks).cId(),
            disabled: outcome_type === OutcomeType.Ranks,
          }),
          new ButtonBuilder({
            label: outcome_type_name[OutcomeType.Points],
            style: D.ButtonStyle.Secondary,
            custom_id: ctx.state.set.handler(setOutcomeType).set.selected_outcome_type(OutcomeType.Points).cId(),
            disabled: outcome_type === OutcomeType.Points,
          }),
        ),
      )
  
    if (outcome_type === OutcomeType.WinLossDraw) {
      // Add the draws setting if the outcome type is WinLossDraw
      container
        .addSeparatorComponents(new SeparatorBuilder({ spacing: D.SeparatorSpacingSize.Large }))
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder({
                content: `**🤝 Draws (${draws_allowed ? `allowed` : `disabled`})**: If enabled, matches can end in a draw. Note: unlike canceled matches, draws may have an effect on player ratings.`,
              }),
            )
            .setButtonAccessory(
              new ButtonBuilder({
                style: draws_allowed ? D.ButtonStyle.Success : D.ButtonStyle.Danger,
                custom_id: ctx.state.set.handler(onToggleDraws).cId(),
                label: draws_allowed ? `Disable` : `Allow`,
              }),
            ),
        )
    }

  container.addSeparatorComponents(new SeparatorBuilder({ spacing: D.SeparatorSpacingSize.Large }))
  // Rating strategies

  const compatible_rating_strategies = await app.rankings.getCompatibleRatingStrategies(ranking)

  container.addTextDisplayComponents(
      new TextDisplayBuilder({
        content:
          `### Rating Strategy` +
          `\nCustomize the algorithm that updates players' ratings as they play games. Use ${await commandMention(app, help_cmd)} for more information.` +
          `\nWhen you make changes to the rating method, every player's rating will be retroactively recalculated according to the new algorithm. The result will be no different than if you used the new algorithm from the start. This may take a few seconds for large servers` + 
          `\nCurrently using the **${rating_strategy_name[ranking.data.rating_settings.rating_strategy]}** rating method\n`,
      }),
    )

    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().setComponents(
        compatible_rating_strategies.map(strategy => {
          return new ButtonBuilder({
            label: rating_strategy_name[strategy],
            style:
              ranking.data.rating_settings.rating_strategy === strategy
                ? D.ButtonStyle.Success
                : D.ButtonStyle.Secondary,
            custom_id: ctx.state
              .setAll({ selected_rating_strategy: strategy, handler: onRatingMethodSelect })
              .cId(),
            disabled: ranking.data.rating_settings.rating_strategy === strategy,
          })
        })

      )
      // new ActionRowBuilder<StringSelectMenuBuilder>().setComponents(
      //   new StringSelectMenuBuilder({
      //     custom_id: ctx.state.set.handler(onRatingMethodSelect).cId(),
      //     placeholder: 'Change rating method to...',
      //     options: [
      //       {
      //         label: 'Bayesian',
      //         value: RatingStrategy.Bayesian.toString(),
      //         description: `A Bayesian rating algorithm`,
      //       },
      //       {
      //         label: 'Glicko',
      //         value: RatingStrategy.Glicko.toString(),
      //         description: `A widely used Bayesian rating system`,
      //       },
      //       {
      //         label: 'Trueskill2',
      //         value: RatingStrategy.TrueSkill.toString(),
      //         description: `Microsoft's TrueSkill2 rating algorithm`,
      //       },
      //       {
      //         label: 'Elo',
      //         value: RatingStrategy.Elo.toString(),
      //         description: `The standard Elo rating system used in Chess`,
      //       },
      //       {
      //         label: 'Wins Minus Losses',
      //         value: RatingStrategy.WinsMinusLosses.toString(),
      //         description: `Gain 1 point for winning, lose 1 point for losing`,
      //       },
      //     ],
      //   }),
      // ),
    )
    .addSeparatorComponents(new SeparatorBuilder({ spacing: D.SeparatorSpacingSize.Large }))

    .addTextDisplayComponents(
      new TextDisplayBuilder({
        content:
          `### Algorithm Parameters` +
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
          )}\n\`\`\``,
      }),
    )

    .addActionRowComponents(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder({
          label: `Edit Parameters`,
          style: D.ButtonStyle.Primary,
          custom_id: ctx.state.set.handler(sendRatingParamsModal).cId(),
        }),
      ),
    )

  return makeSettingsPage(ctx, [container], ranking, guild_ranking)
}

export async function rankRolesSettings(
  app: App,
  ctx: Context<typeof ranking_settings_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const { ranking, guild_ranking } = await app.db.guild_rankings.fetch({
    guild_id: ctx.interaction.guild_id,
    ranking_id: ctx.state.get.ranking_id(),
  })

  const rank_roles = guild_ranking.data.rank_roles || []

  const containers: ContainerBuilder[] = []

  containers.push(
    new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder({
          content:
            `## Rank Roles Settings for ${escapeMd(ranking.data.name)}` +
            `\nRank roles are automatically assigned to players when their rating in this ranking enters a certain range.` +
            `\nThe roles must be below the bot's highest role in the server.` +
            `\n# Current Rank Roles and Their Ranges` +
            `\n` +
            (rank_roles.length > 0
              ? rank_roles
                  .reverse()
                  .map(rr => `<@&${rr.role_id}>: **${rr.min_rating ?? '-∞'} to ${rr.max_rating ?? '∞'}**`)
                  .join('\n')
              : `-# No rank roles are set for this ranking.`) +
            `\n\nYou can add a new role or edit an existing one by selecting it from the dropdown.`,
        }),
      )
      .addSeparatorComponents(new SeparatorBuilder({ spacing: D.SeparatorSpacingSize.Large }))
      .addActionRowComponents(
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
          new RoleSelectMenuBuilder({
            custom_id: ctx.state.set.handler(onRankRoleSelect).cId(),
            placeholder: `Select a Role`,
            min_values: 1,
            max_values: 1,
          }),
        ),
      )
      .setAccentColor(guild_ranking.data.display_settings?.color ?? DEFAULT_LB_COLOR),
  )

  if (ctx.state.data.selected_role_id) {
    containers.push(
      new ContainerBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder({
            content: `## Selected Role: <@&${ctx.state.data.selected_role_id}>`,
          }),
        )
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().setComponents(
            new ButtonBuilder({
              label: `Done`,
              custom_id: ctx.state.set.selected_role_id(null).set.handler(sendRankRolesPage).cId(),
              style: D.ButtonStyle.Secondary,
              emoji: { name: '✅' },
            }),
            new ButtonBuilder({
              label: `Edit Range`,
              custom_id: ctx.state.set.handler(sendEditRangeModal).cId(),
              style: D.ButtonStyle.Primary,
              emoji: { name: '↕️' },
            }),
            new ButtonBuilder({
              label: `Unset Role`,
              custom_id: ctx.state.set.handler(onUnsetRankRole).cId(),
              style: D.ButtonStyle.Secondary,
              emoji: { name: '❌' },
            }),
          ),
        ),
    )
  }

  return makeSettingsPage(ctx, containers, ranking, guild_ranking)
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
    .addTextDisplayComponents(
      new TextDisplayBuilder({
        content: `# Appearance\nCustomize how the leaderboard looks when it's displayed in Discord`,
      }),
    )
    .addSeparatorComponents(new SeparatorBuilder({ spacing: D.SeparatorSpacingSize.Large }))
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder({
            content: `**Color**: The color of the leaderboard embed. You can use a [color picker](https://htmlcolorcodes.com/color-picker/) to find one. Enter the hex code`,
          }),
        )
        .setButtonAccessory(
          new ButtonBuilder({
            style: D.ButtonStyle.Primary,
            custom_id: ctx.state.set.handler(sendColorModal).cId(),
            label: `Color`,
          }),
        ),
    )
    .addSeparatorComponents(new SeparatorBuilder({ spacing: D.SeparatorSpacingSize.Small }))
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder({
            content:
              `**Live Leaderboard**: If enabled, the bot will maintain a public leaderboard message in real time. If disabled, you can always view the leaderboard using ${await commandMention(app, leaderboard_cmd, guild_ranking.data.guild_id)} \`${ranking.data.name}\`.` + 
              `\nCurrently, ` +
              (lb_msg_link
                ? `the live leaderboard is displayed in ${lb_msg_link}`
                : `the live leaderboard is **disabled**`),
          }),
        )
        .setButtonAccessory(
          new ButtonBuilder({
            style: guild_ranking.data.display_settings?.leaderboard_message
              ? D.ButtonStyle.Success
              : D.ButtonStyle.Danger,
            custom_id: ctx.state.set.handler(onToggleLiveLeaderboard).cId(),
            label: guild_ranking.data.display_settings?.leaderboard_message ? `📃 Disable` : `📃 Enable`,
          }),
        ),
    )
    .setAccentColor(guild_ranking.data.display_settings?.color ?? DEFAULT_LB_COLOR)

  return makeSettingsPage(ctx, [container], ranking, guild_ranking)
}

export async function matchSettings(
  app: App,
  ctx: Context<typeof ranking_settings_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const { ranking, guild_ranking } = await app.db.guild_rankings.fetch({
    guild_id: ctx.interaction.guild_id,
    ranking_id: ctx.state.get.ranking_id(),
  })

  const props = app.rankings.getProperties(ranking)

  const queue_enabled = props.matchmaking_settings.queue_enabled
  const challenges_enabled = props.matchmaking_settings.direct_challenge_enabled
  const draws_allowed = props.match_settings.draws_allowed
  const q_timeout_mins = props.matchmaking_settings.queue_join_timeout_minutes

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder({
        content:
          `## Match Settings for **${escapeMd(ranking.data.name)}**` +
          `\nManage how matches are played in this ranking. Use the buttons below to toggle the settings.`,
      }),
    )

    .addSeparatorComponents(new SeparatorBuilder({ spacing: D.SeparatorSpacingSize.Large }))

    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder({
            content: `### 🔎 Matchmaking Queue: ${queue_enabled ? `enabled` : `disabled`}` + 
            `\nIf enabled, players can join the matchmaking queue using ${await commandMention(app, join_cmd, ctx.interaction.guild_id)} \`${ranking.data.name}\`. You can send a button to join the queue using ${await commandMention(app, send_cmd, ctx.interaction.guild_id, scnames.queue_message)}`,
          }),
        )
        .setButtonAccessory(
          new ButtonBuilder({
            style: queue_enabled ? D.ButtonStyle.Success : D.ButtonStyle.Danger,
            custom_id: ctx.state.set.handler(onToggleQueue).cId(),
            label: queue_enabled ? `Disable` : `Enable`,
          }),
        ),
    )

  if (queue_enabled) {
    container
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder({
              content: `- Role to ping when someone joins the queue: ${guild_ranking.data.matchmaking_settings?.queue_join_ping_role_id ? `<@&${guild_ranking.data.matchmaking_settings?.queue_join_ping_role_id}>` : `None`}.`,
            }),
          )
          .setButtonAccessory(
            new ButtonBuilder({
              style: D.ButtonStyle.Primary,
              label: `Unset Role`,
              custom_id: ctx.state.setAll({ handler: unsetQueuePingRole }).cId(),
            }),
          ),
      )
      .addActionRowComponents(
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
          new RoleSelectMenuBuilder({
            custom_id: ctx.state.set.handler(onQueuePingRoleSelect).cId(),
            placeholder: `Select a Role`,
            min_values: 1,
            max_values: 1,
          }),
        ),
      )

      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder({
              content: `- The bot automatically removes players from the queue after **${q_timeout_mins} minutes**.`,
            }),
          )
          .setButtonAccessory(
            new ButtonBuilder({
              style: D.ButtonStyle.Primary,
              label: `Change`,
              custom_id: ctx.state.set.handler(sendQueueJoinTimeoutModal).cId(),
            }),
          ),
      )
      .addSeparatorComponents(new SeparatorBuilder({ spacing: D.SeparatorSpacingSize.Large }))
  }

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder({
          content: `**Direct Challenges (${challenges_enabled ? `enabled` : `disabled`})**: If enabled, players can challenge each other using ${await commandMention(app, challenge_1v1_cmd, ctx.interaction.guild_id)} \`${ranking.data.name}\`.`,
        }),
      )
      .setButtonAccessory(
        new ButtonBuilder({
          style: challenges_enabled ? D.ButtonStyle.Success : D.ButtonStyle.Danger,
          custom_id: ctx.state.set.handler(onToggleChallenge).cId(),
          label: challenges_enabled ? `Disable` : `Enable`,
        }),
      ),
  )



  return makeSettingsPage(ctx, [container], ranking, guild_ranking)
}

export async function deleteConfirm(
  app: App,
  ctx: Context<typeof ranking_settings_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const { ranking, guild_ranking } = await app.db.guild_rankings.fetch({
    guild_id: ctx.interaction.guild_id,
    ranking_id: ctx.state.get.ranking_id(),
  })

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder({
        content:
          `## Delete Ranking?` +
          `\nThis will delete the ranking **${escapeMd(ranking.data.name)}** and all of its players and match history. This action cannot be undone.`,
      }),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().setComponents(
        new ButtonBuilder({
          label: `Delete`,
          custom_id: ctx.state.set.handler(onDeleteConfirmBtn).cId(),
          style: D.ButtonStyle.Danger,
        }),
      ),
    )

  return makeSettingsPage(ctx, [container], ranking, guild_ranking)
}
