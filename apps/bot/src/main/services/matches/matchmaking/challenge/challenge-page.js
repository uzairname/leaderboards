'use strict'
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value)
          })
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value))
        } catch (e) {
          reject(e)
        }
      }
      function rejected(value) {
        try {
          step(generator['throw'](value))
        } catch (e) {
          reject(e)
        }
      }
      function step(result) {
        result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected)
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next())
    })
  }
var __generator =
  (this && this.__generator) ||
  function (thisArg, body) {
    var _ = {
        label: 0,
        sent: function () {
          if (t[0] & 1) throw t[1]
          return t[1]
        },
        trys: [],
        ops: [],
      },
      f,
      y,
      t,
      g = Object.create((typeof Iterator === 'function' ? Iterator : Object).prototype)
    return (
      (g.next = verb(0)),
      (g['throw'] = verb(1)),
      (g['return'] = verb(2)),
      typeof Symbol === 'function' &&
        (g[Symbol.iterator] = function () {
          return this
        }),
      g
    )
    function verb(n) {
      return function (v) {
        return step([n, v])
      }
    }
    function step(op) {
      if (f) throw new TypeError('Generator is already executing.')
      while ((g && ((g = 0), op[0] && (_ = 0)), _))
        try {
          if (
            ((f = 1),
            y &&
              (t =
                op[0] & 2
                  ? y['return']
                  : op[0]
                    ? y['throw'] || ((t = y['return']) && t.call(y), 0)
                    : y.next) &&
              !(t = t.call(y, op[1])).done)
          )
            return t
          if (((y = 0), t)) op = [op[0] & 2, t.value]
          switch (op[0]) {
            case 0:
            case 1:
              t = op
              break
            case 4:
              _.label++
              return { value: op[1], done: false }
            case 5:
              _.label++
              y = op[1]
              op = [0]
              continue
            case 7:
              op = _.ops.pop()
              _.trys.pop()
              continue
            default:
              if (
                !((t = _.trys), (t = t.length > 0 && t[t.length - 1])) &&
                (op[0] === 6 || op[0] === 2)
              ) {
                _ = 0
                continue
              }
              if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
                _.label = op[1]
                break
              }
              if (op[0] === 6 && _.label < t[1]) {
                _.label = t[1]
                t = op
                break
              }
              if (t && _.label < t[2]) {
                _.label = t[2]
                _.ops.push(op)
                break
              }
              if (t[2]) _.ops.pop()
              _.trys.pop()
              continue
          }
          op = body.call(thisArg, _)
        } catch (e) {
          op = [6, e]
          y = 0
        } finally {
          f = t = 0
        }
      if (op[0] & 5) throw op[1]
      return { value: op[0] ? op[1] : void 0, done: true }
    }
  }
Object.defineProperty(exports, '__esModule', { value: true })
exports.challenge_message_signature = void 0
exports.challengeMessage = challengeMessage
var D = require('discord-api-types/v10')
var discord_framework_1 = require('discord-framework')
var interaction_checks_1 = require('discord-framework/interactions/utils/interaction-checks')
var utils_1 = require('utils')
var StringData_1 = require('../../../../../../../../packages/utils/StringData')
var constants_1 = require('../../../../ui-helpers/constants')
var strings_1 = require('../../../../ui-helpers/strings')
var manage_players_1 = require('../../../players/manage-players')
var manage_rankings_1 = require('../../../rankings/manage-rankings')
var ViewModule_1 = require('../../../ViewModule')
var manage_ongoing_match_1 = require('../../ongoing-math-thread/manage-ongoing-match')
exports.challenge_message_signature = new discord_framework_1.MessageView({
  name: 'Challenge Message',
  custom_id_prefix: 'c',
  state_schema: {
    ranking_id: StringData_1.field.Int(),
    initiator_id: StringData_1.field.String(),
    opponent_id: StringData_1.field.String(),
    time_sent: StringData_1.field.Date(),
    best_of: StringData_1.field.Int(),
    opponent_accepted: StringData_1.field.Boolean(),
    ongoing_match_channel_id: StringData_1.field.String(),
    callback: StringData_1.field.Choice({
      accept: accept,
    }),
  },
})
exports.default = new ViewModule_1.AppView(exports.challenge_message_signature, function (app) {
  return exports.challenge_message_signature.onComponent(function (ctx) {
    return __awaiter(void 0, void 0, void 0, function () {
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            if (!ctx.state.data.callback) throw new Error('Unhandled state')
            return [4 /*yield*/, ctx.state.data.callback(app, ctx)]
          case 1:
            return [2 /*return*/, _a.sent()]
        }
      })
    })
  })
})
function challengeMessage(app, data) {
  return __awaiter(this, void 0, void 0, function () {
    var state, initiator_id, opponent_id, expires_at, ranking, best_of, content, embeds, components
    var _a, _b
    return __generator(this, function (_c) {
      switch (_c.label) {
        case 0:
          state = exports.challenge_message_signature.newState(data)
          initiator_id = state.get.initiator_id()
          opponent_id = state.get.opponent_id()
          expires_at = new Date(state.get.time_sent().getTime() + app.config.ChallengeTimeoutMs)
          return [4 /*yield*/, app.db.rankings.fetch(state.get.ranking_id())]
        case 1:
          ranking = _c.sent()
          best_of =
            (_b =
              (_a = state.get.best_of()) !== null && _a !== void 0
                ? _a
                : ranking.data.matchmaking_settings.default_best_of) !== null && _b !== void 0
              ? _b
              : manage_rankings_1.default_best_of
          content = '### <@'
            .concat(initiator_id, '> challenges <@')
            .concat(opponent_id, '> to a 1v1')
          embeds = [
            {
              title: '',
              description: ""
                                + "Ranking: **".concat(ranking.data.name, "**")
                                + "\nBest of **".concat(best_of, "**")
                                + "\n" + ((state.is.opponent_accepted() && state.data.ongoing_match_channel_id)
                                ? "Challenge accepted. New match started in <#".concat(state.data.ongoing_match_channel_id, ">")
                                : "*Awaiting response*")
                                + "\n\n-# Expires ".concat((0, strings_1.relativeTimestamp)(expires_at))
                                + "", // prettier-ignore
              color: constants_1.Colors.Primary,
            },
          ]
          components = !state.is.opponent_accepted()
            ? [
                {
                  type: D.ComponentType.ActionRow,
                  components: [
                    {
                      type: D.ComponentType.Button,
                      style: D.ButtonStyle.Primary,
                      custom_id: state.set.callback(accept).cId(),
                      label: 'Accept',
                    },
                  ],
                },
              ]
            : []
          return [
            2 /*return*/,
            new discord_framework_1.MessageData({
              content: content,
              embeds: embeds,
              components: components,
              allowed_mentions: { users: [opponent_id] },
            }),
          ]
      }
    })
  })
}
function accept(app, ctx) {
  return __awaiter(this, void 0, void 0, function () {
    var expires_at, interaction, _a, guild_ranking, ranking
    var _this = this
    var _b, _c, _d, _e
    return __generator(this, function (_f) {
      switch (_f.label) {
        case 0:
          expires_at = new Date(ctx.state.get.time_sent().getTime() + app.config.ChallengeTimeoutMs)
          if (!(new Date() > expires_at)) return [3 /*break*/, 2]
          return [
            4 /*yield*/,
            app.discord.deleteMessageIfExists(
              (_b = ctx.interaction.channel) === null || _b === void 0 ? void 0 : _b.id,
              (_c = ctx.interaction.message) === null || _c === void 0 ? void 0 : _c.id,
            ),
          ]
        case 1:
          _f.sent()
          return [
            2 /*return*/,
            {
              type: D.InteractionResponseType.ChannelMessageWithSource,
              data: { content: 'This challenge has expired', flags: D.MessageFlags.Ephemeral },
            },
          ]
        case 2:
          interaction = (0, interaction_checks_1.checkGuildInteraction)(ctx.interaction)
          return [
            4 /*yield*/,
            app.db.guild_rankings.get(interaction.guild_id, ctx.state.get.ranking_id()).fetch(),
          ]
        case 3:
          ;(_a = _f.sent()), (guild_ranking = _a.guild_ranking), (ranking = _a.ranking)
          if (!!ranking.data.matchmaking_settings.direct_challenge_enabled) return [3 /*break*/, 5]
          return [
            4 /*yield*/,
            app.discord.deleteMessageIfExists(
              (_d = ctx.interaction.channel) === null || _d === void 0 ? void 0 : _d.id,
              (_e = ctx.interaction.message) === null || _e === void 0 ? void 0 : _e.id,
            ),
          ]
        case 4:
          _f.sent()
          return [
            2 /*return*/,
            {
              type: D.InteractionResponseType.ChannelMessageWithSource,
              data: {
                content: 'The ranking **'.concat(
                  ranking.data.name,
                  '** does not allow direct challenges',
                ),
                flags: D.MessageFlags.Ephemeral,
              },
            },
          ]
        case 5:
          // ensure that the acceptor is the opponent, and that the challenge hasn't been accepted yet
          if (
            !ctx.state.is.opponent_id(interaction.member.user.id) ||
            ctx.state.is.opponent_accepted()
          )
            return [
              2 /*return*/,
              { type: D.InteractionResponseType.DeferredMessageUpdate },
              // accept the challenge
            ]
          // accept the challenge
          return [
            2 /*return*/,
            ctx.defer(
              {
                type: D.InteractionResponseType.DeferredMessageUpdate,
              },
              function (ctx) {
                return __awaiter(_this, void 0, void 0, function () {
                  var user_ids, players, thread, _a, _b
                  return __generator(this, function (_c) {
                    switch (_c.label) {
                      case 0:
                        ctx.state.save.opponent_accepted(true)
                        user_ids = [[ctx.state.get.initiator_id()], [ctx.state.get.opponent_id()]]
                        return [
                          4 /*yield*/,
                          (0, utils_1.sequential)(
                            user_ids.map(function (team) {
                              return function () {
                                return (0, utils_1.sequential)(
                                  team.map(function (i) {
                                    return function () {
                                      return (0, manage_players_1.getRegisterPlayer)(
                                        app,
                                        i,
                                        ranking,
                                      )
                                    }
                                  }),
                                )
                              }
                            }),
                          ),
                          // Start the match
                        ]
                      case 1:
                        players = _c.sent()
                        return [
                          4 /*yield*/,
                          (0, manage_ongoing_match_1.start1v1SeriesThread)(
                            app,
                            guild_ranking,
                            players,
                            ctx.state.data.best_of,
                          ),
                          // Update the challenge message
                        ]
                      case 2:
                        thread = _c.sent().thread
                        // Update the challenge message
                        ctx.state.save.ongoing_match_channel_id(thread.id)
                        _b = (_a = ctx).edit
                        return [4 /*yield*/, challengeMessage(app, ctx.state.data)]
                      case 3:
                        return [4 /*yield*/, _b.apply(_a, [_c.sent().as_response])]
                      case 4:
                        _c.sent()
                        return [2 /*return*/]
                    }
                  })
                })
              },
            ),
          ]
      }
    })
  })
}
