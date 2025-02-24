import * as D from 'discord-api-types/v10'
import { AnyChatInputCommandSignature, AnyCommandSignature, AnyHandler, AnyViewSignature } from '../types'
import { CommandHandler, ViewHandler } from '../views'

export function isCommandSignature(
  signature: AnyViewSignature | AnyCommandSignature,
): signature is AnyCommandSignature {
  return signature.config.hasOwnProperty('type')
}

export function isViewSignature(signature: AnyViewSignature | AnyCommandSignature): signature is AnyViewSignature {
  return !isCommandSignature(signature)
}
export function isChatInputCommandSignature(
  signature: AnyViewSignature | AnyCommandSignature,
): signature is AnyChatInputCommandSignature {
  return isCommandSignature(signature) && signature.config.type === D.ApplicationCommandType.ChatInput
}

export function isCommandHandler(handler: AnyHandler): handler is CommandHandler<AnyCommandSignature, any> {
  return isCommandSignature(handler.signature)
}

export function isViewHandler(handler: AnyHandler): handler is ViewHandler<AnyViewSignature, any> {
  return isViewSignature(handler.signature)
}

export function isChatInputCommandHandler(
  handler: AnyHandler,
): handler is CommandHandler<AnyChatInputCommandSignature, any> {
  return isCommandHandler(handler) && handler.signature.config.type === D.ApplicationCommandType.ChatInput
}
