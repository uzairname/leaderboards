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
exports.challenge_cmd_signature = void 0
var D = require('discord-api-types/v10')
var discord_framework_1 = require('discord-framework')
var utils_1 = require('utils')
var ranking_option_1 = require('../../../../ui-helpers/ranking-option')
var guilds_1 = require('../../../guilds/guilds')
var manage_players_1 = require('../../../players/manage-players')
var ViewModule_1 = require('../../../ViewModule')
var match_creation_1 = require('../../management/match-creation')
var main_1 = require('../main')
var challenge_page_1 = require('./challenge-page')
var optionnames = {
  opponent: 'opponent',
  ranking: 'ranking',
  best_of: 'best-of',
}
exports.challenge_cmd_signature = new discord_framework_1.CommandView({
  type: D.ApplicationCommandType.ChatInput,
  name: '1v1',
  description: 'Challenge someone to a 1v1',
})
exports.default = new ViewModule_1.GuildCommand(
  exports.challenge_cmd_signature,
  function (app, guild) {
    return __awaiter(void 0, void 0, void 0, function () {
      var result, _a, _b, _c, _d
      var _e
      return __generator(this, function (_f) {
        switch (_f.label) {
          case 0:
            return [4 /*yield*/, (0, main_1.getChallengeEnabledRankings)(app, guild)]
          case 1:
            result = _f.sent().map(function (i) {
              return i.ranking
            })
            if (result.length == 0) return [2 /*return*/, null]
            _a = discord_framework_1.CommandView.bind
            _b = [__assign({}, exports.challenge_cmd_signature.config)]
            _e = {}
            _d = (_c = [
              {
                type: D.ApplicationCommandOptionType.User,
                name: optionnames.opponent,
                description: 'Who to challenge',
                required: true,
              },
            ]).concat
            return [
              4 /*yield*/,
              (0, ranking_option_1.guildRankingsOption)(app, guild, optionnames.ranking, {
                available_choices: result,
              }),
            ]
          case 2:
            return [
              2 /*return*/,
              new (_a.apply(discord_framework_1.CommandView, [
                void 0,
                __assign.apply(
                  void 0,
                  _b.concat([
                    ((_e.options = _d.apply(_c, [_f.sent()]).concat({
                      type: D.ApplicationCommandOptionType.Integer,
                      name: optionnames.best_of,
                      description: 'Best of how many games? This affects rating calculation',
                      required: false,
                      choices: [
                        { name: '1', value: 1 },
                        { name: '3', value: 3 },
                        { name: '5', value: 5 },
                        { name: '7', value: 7 },
                      ],
                    })),
                    _e),
                  ]),
                ),
              ]))(),
            ]
        }
      })
    })
  },
  function (app) {
    return exports.challenge_cmd_signature.onCommand(function (ctx) {
      return __awaiter(void 0, void 0, void 0, function () {
        var _a, _b, _c, _d
        var _e
        return __generator(this, function (_f) {
          switch (_f.label) {
            case 0:
              _a = ranking_option_1.withSelectedRanking
              _b = [
                app,
                ctx,
                (0, discord_framework_1.getOptions)(ctx.interaction, {
                  ranking: { type: D.ApplicationCommandOptionType.Integer },
                }).ranking,
              ]
              _e = {}
              _c = main_1.getChallengeEnabledRankings
              _d = [app]
              return [4 /*yield*/, (0, guilds_1.getOrAddGuild)(app, ctx.interaction.guild_id)]
            case 1:
              return [4 /*yield*/, _c.apply(void 0, _d.concat([_f.sent()]))]
            case 2:
              return [
                2 /*return*/,
                _a.apply(
                  void 0,
                  _b.concat([
                    ((_e.available_guild_rankings = _f.sent()), _e),
                    function (ranking) {
                      return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                          return [
                            2 /*return*/,
                            ctx.defer(
                              {
                                type: D.InteractionResponseType.DeferredChannelMessageWithSource,
                                data: { flags: D.MessageFlags.Ephemeral },
                              },
                              function (ctx) {
                                return __awaiter(void 0, void 0, void 0, function () {
                                  var input,
                                    interaction,
                                    initiator,
                                    opponent_id,
                                    opponent,
                                    best_of,
                                    _a,
                                    _b
                                  var _c, _d, _e, _f
                                  return __generator(this, function (_g) {
                                    switch (_g.label) {
                                      case 0:
                                        input = (0, discord_framework_1.getOptions)(
                                          ctx.interaction,
                                          {
                                            opponent: {
                                              type: D.ApplicationCommandOptionType.User,
                                              required: true,
                                            },
                                            best_of: {
                                              type: D.ApplicationCommandOptionType.Integer,
                                            },
                                            ranking: {
                                              type: D.ApplicationCommandOptionType.Integer,
                                            },
                                          },
                                        )
                                        input.ranking
                                        interaction = ctx.interaction
                                        return [
                                          4 /*yield*/,
                                          (0, manage_players_1.getRegisterPlayer)(
                                            app,
                                            interaction.member.user.id,
                                            ranking,
                                          ),
                                        ]
                                      case 1:
                                        initiator = _g.sent()
                                        input.opponent
                                        opponent_id = (0, utils_1.nonNullable)(
                                          (_c = ctx.interaction.data.options) === null ||
                                            _c === void 0
                                            ? void 0
                                            : _c.find(function (o) {
                                                return o.name === optionnames.opponent
                                              }),
                                          'opponent option',
                                        ).value
                                        return [
                                          4 /*yield*/,
                                          (0, manage_players_1.getRegisterPlayer)(
                                            app,
                                            opponent_id,
                                            ranking,
                                          ),
                                        ]
                                      case 2:
                                        opponent = _g.sent()
                                        return [
                                          4 /*yield*/,
                                          (0, match_creation_1.ensurePlayersEnabled)(app, [
                                            initiator,
                                            opponent,
                                          ]),
                                        ]
                                      case 3:
                                        _g.sent()
                                        best_of =
                                          (_f =
                                            (_e =
                                              (_d = ctx.interaction.data.options) === null ||
                                              _d === void 0
                                                ? void 0
                                                : _d.find(function (o) {
                                                    return o.name === optionnames.best_of
                                                  })) === null || _e === void 0
                                              ? void 0
                                              : _e.value) !== null && _f !== void 0
                                            ? _f
                                            : 1
                                        if (opponent_id === initiator.data.user_id) {
                                          return [
                                            2 /*return*/,
                                            void ctx.edit({
                                              content: "You can't 1v1 yourself",
                                              flags: D.MessageFlags.Ephemeral,
                                            }),
                                          ]
                                        }
                                        _b = (_a = ctx).send
                                        return [
                                          4 /*yield*/,
                                          (0, challenge_page_1.challengeMessage)(app, {
                                            time_sent: new Date(),
                                            initiator_id: initiator.data.user_id,
                                            opponent_id: opponent_id,
                                            best_of: best_of,
                                            ranking_id: ranking.data.id,
                                          }),
                                        ]
                                      case 4:
                                        return [4 /*yield*/, _b.apply(_a, [_g.sent()])]
                                      case 5:
                                        _g.sent()
                                        return [
                                          2 /*return*/,
                                          void ctx.edit({
                                            content: 'Challenge sent',
                                            flags: D.MessageFlags.Ephemeral,
                                          }),
                                        ]
                                    }
                                  })
                                })
                              },
                            ),
                          ]
                        })
                      })
                    },
                  ]),
                ),
              ]
          }
        })
      })
    })
  },
)
