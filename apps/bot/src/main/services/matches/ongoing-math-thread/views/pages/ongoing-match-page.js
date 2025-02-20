'use strict'
var __assign =
  (this && this.__assign) ||
  function () {
    __assign =
      Object.assign ||
      function (t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
          s = arguments[i]
          for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p]
        }
        return t
      }
    return __assign.apply(this, arguments)
  }
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
exports.ongoing_series_page_config = void 0
exports.ongoingMatchPage = ongoingMatchPage
var matches_1 = require('database/models/matches')
var D = require('discord-api-types/v10')
var discord_framework_1 = require('discord-framework')
var utils_1 = require('utils')
var StringData_1 = require('../../../../../../../../../packages/utils/StringData')
var sentry_1 = require('../../../../../../logging/sentry')
var UserError_1 = require('../../../../../errors/UserError')
var ViewModule_1 = require('../../../../ViewModule')
var manage_ongoing_match_1 = require('../../manage-ongoing-match')
var ongoing_1v1_match_message_1 = require('../../ongoing-1v1-match-message')
exports.ongoing_series_page_config = new discord_framework_1.MessageView({
  name: 'Ongoing series message',
  custom_id_prefix: 'om',
  state_schema: {
    match_id: StringData_1.field.Int(),
    claim: StringData_1.field.Int(),
    teams_to_rematch: StringData_1.field.Array(StringData_1.field.Boolean()),
    teams_to_cancel: StringData_1.field.Array(StringData_1.field.Boolean()),
    handler: StringData_1.field.Choice({
      vote: vote,
      rematch: rematch,
    }),
  },
})
exports.default = new ViewModule_1.AppView(exports.ongoing_series_page_config, function (app) {
  return exports.ongoing_series_page_config.onComponent(function (ctx) {
    return __awaiter(void 0, void 0, void 0, function () {
      var handler
      return __generator(this, function (_a) {
        handler = ctx.state.get.handler()
        if (!handler) throw new Error('no callback')
        return [
          2 /*return*/,
          ctx.defer(
            {
              type: D.InteractionResponseType.DeferredMessageUpdate,
            },
            function (ctx_) {
              return __awaiter(void 0, void 0, void 0, function () {
                return __generator(this, function (_a) {
                  return [2 /*return*/, handler(app, ctx_)]
                })
              })
            },
          ),
        ]
      })
    })
  })
})
function ongoingMatchPage(app, state) {
  return __awaiter(this, void 0, void 0, function () {
    var match, team_players, message, components
    return __generator(this, function (_a) {
      switch (_a.label) {
        case 0:
          return [4 /*yield*/, app.db.matches.fetch(state.get.match_id())]
        case 1:
          match = _a.sent()
          return [4 /*yield*/, match.players()]
        case 2:
          team_players = _a.sent()
          if (
            !app.config.features.AllowNon1v1 &&
            !(
              team_players.length === 2 &&
              team_players.every(function (t) {
                return t.length === 1
              })
            )
          ) {
            throw new Error('Invalid match team dimensions '.concat(team_players))
          }
          return [
            4 /*yield*/,
            (0, ongoing_1v1_match_message_1.ongoingMatch1v1Message)(
              app,
              match,
              team_players.flat(),
            ),
          ]
        case 3:
          message = _a.sent()
          components = []
          if (match.data.status === matches_1.MatchStatus.Ongoing) {
            components = components.concat([
              {
                type: D.ComponentType.ActionRow,
                components: [
                  {
                    type: D.ComponentType.Button,
                    style: D.ButtonStyle.Success,
                    label: 'I won',
                    custom_id: state
                      .setAll({
                        handler: vote,
                        claim: matches_1.Vote.Win,
                      })
                      .cId(),
                  },
                  {
                    type: D.ComponentType.Button,
                    style: D.ButtonStyle.Danger,
                    label: 'I lost',
                    custom_id: state
                      .setAll({
                        handler: vote,
                        claim: matches_1.Vote.Loss,
                      })
                      .cId(),
                  },
                  {
                    type: D.ComponentType.Button,
                    style: D.ButtonStyle.Secondary,
                    label: 'Cancel',
                    custom_id: state
                      .setAll({
                        handler: vote,
                        claim: matches_1.Vote.Cancel,
                      })
                      .cId(),
                  },
                ],
              },
            ])
          } else if (
            match.data.status === matches_1.MatchStatus.Finished ||
            match.data.status === matches_1.MatchStatus.Canceled
          ) {
            components = components.concat([
              {
                type: D.ComponentType.ActionRow,
                components: [
                  {
                    type: D.ComponentType.Button,
                    style: D.ButtonStyle.Primary,
                    label: 'Rematch?',
                    custom_id: state.set.handler(rematch).cId(),
                  },
                ],
              },
            ])
          }
          return [
            2 /*return*/,
            new discord_framework_1.MessageData(
              __assign(__assign({}, message), { components: components }),
            ),
          ]
      }
    })
  })
}
function vote(app, ctx) {
  return __awaiter(this, void 0, void 0, function () {
    var match, outcome, winner_index, team_players, winner, thread_id, _a, _b
    return __generator(this, function (_c) {
      switch (_c.label) {
        case 0:
          return [4 /*yield*/, app.db.matches.fetch(ctx.state.get.match_id())]
        case 1:
          match = _c.sent()
          return [
            4 /*yield*/,
            (0, manage_ongoing_match_1.castPlayerVote)(
              app,
              match,
              ctx.interaction.member.user.id,
              ctx.state.get.claim(),
            ),
          ]
        case 2:
          _c.sent()
          if (!(match.data.status === matches_1.MatchStatus.Finished)) return [3 /*break*/, 5]
          outcome = (0, utils_1.nonNullable)(match.data.outcome, 'finished match outcome')
          winner_index = (0, utils_1.maxIndex)(outcome)
          return [4 /*yield*/, match.players()]
        case 3:
          team_players = _c.sent()
          winner = team_players[winner_index][0]
          return [
            4 /*yield*/,
            ctx.send({ content: '### <@'.concat(winner.player.data.user_id, '> wins!') }),
          ]
        case 4:
          _c.sent()
          _c.label = 5
        case 5:
          if (
            !(
              match.data.status === matches_1.MatchStatus.Finished ||
              match.data.status === matches_1.MatchStatus.Canceled
            )
          )
            return [3 /*break*/, 7]
          thread_id = match.data.ongoing_match_channel_id
          if (!thread_id) return [3 /*break*/, 7]
          return [4 /*yield*/, app.discord.editChannel(thread_id, { archived: true })]
        case 6:
          _c.sent()
          _c.label = 7
        case 7:
          _b = (_a = ctx).edit
          return [4 /*yield*/, ongoingMatchPage(app, ctx.state)]
        case 8:
          return [4 /*yield*/, _b.apply(_a, [_c.sent().as_response])]
        case 9:
          _c.sent()
          return [2 /*return*/]
      }
    })
  })
}
function rematch(app, ctx) {
  return __awaiter(this, void 0, void 0, function () {
    var old_match,
      team_players,
      user_id,
      team_index,
      teams_to_rematch,
      expires_at,
      _a,
      guild_ranking,
      thread,
      _b,
      _c
    var _d, _e, _f, _g
    return __generator(this, function (_h) {
      switch (_h.label) {
        case 0:
          return [4 /*yield*/, app.db.matches.fetch(ctx.state.get.match_id())]
        case 1:
          old_match = _h.sent()
          return [
            4 /*yield*/,
            old_match.players(),
            // check if user is in the match
          ]
        case 2:
          team_players = _h.sent()
          user_id = ctx.interaction.member.user.id
          team_index = team_players.findIndex(function (team) {
            return team.some(function (p) {
              return p.player.data.user_id === user_id
            })
          })
          if (team_index == -1)
            throw new UserError_1.UserError("You aren't participating in this match")
          teams_to_rematch =
            (_d = ctx.state.data.teams_to_rematch) !== null && _d !== void 0
              ? _d
              : team_players.map(function (_) {
                  return false
                })
          if (!!teams_to_rematch[team_index]) return [3 /*break*/, 4]
          teams_to_rematch[team_index] = true
          ctx.state.save.teams_to_rematch(teams_to_rematch)
          return [
            4 /*yield*/,
            ctx.send({
              content: '<@'.concat(user_id, '> wants to rematch'),
              allowed_mentions: { parse: [] },
            }),
          ]
        case 3:
          _h.sent()
          _h.label = 4
        case 4:
          if (
            !teams_to_rematch.every(function (v) {
              return v
            })
          )
            return [3 /*break*/, 10]
          expires_at = new Date(
            ((_f =
              (_e = old_match.data.time_finished) === null || _e === void 0
                ? void 0
                : _e.getTime()) !== null && _f !== void 0
              ? _f
              : Date.now()) +
              app.config.RematchTimeoutMinutes * 60 * 1000,
          )
          if (new Date() > expires_at) {
            throw new UserError_1.UserError('Rematch window has expired')
          }
          // archive thread
          _a = old_match.data.ongoing_match_channel_id
          if (!_a)
            // archive thread
            return [3 /*break*/, 6]
          return [
            4 /*yield*/,
            app.discord.editChannel(old_match.data.ongoing_match_channel_id, { archived: true }),
          ]
        case 5:
          _a = _h.sent()
          _h.label = 6
        case 6:
          // archive thread
          _a
          return [
            4 /*yield*/,
            app.db.guild_rankings.fetch({
              guild_id: ctx.interaction.guild_id,
              ranking_id: old_match.data.ranking_id,
            }),
          ]
        case 7:
          guild_ranking = _h.sent().guild_ranking
          return [
            4 /*yield*/,
            (0, manage_ongoing_match_1.start1v1SeriesThread)(
              app,
              guild_ranking,
              team_players.map(function (t) {
                return t.map(function (p) {
                  return p.player
                })
              }),
              (_g = old_match.data.metadata) === null || _g === void 0 ? void 0 : _g.best_of,
            ),
          ]
        case 8:
          thread = _h.sent().thread
          ctx.state.save.teams_to_rematch(null)
          return [
            4 /*yield*/,
            ctx.send({
              content: 'New match started in <#'.concat(thread.id, '>'),
            }),
          ]
        case 9:
          _h.sent()
          _h.label = 10
        case 10:
          sentry_1.sentry.debug('teams to rematch '.concat(ctx.state.data.teams_to_rematch))
          _c = (_b = ctx).edit
          return [4 /*yield*/, ongoingMatchPage(app, ctx.state)]
        case 11:
          return [2 /*return*/, void _c.apply(_b, [_h.sent().as_response])]
      }
    })
  })
}
