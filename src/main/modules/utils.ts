import { AppErrors } from '../app/errors'

export function validate(condition: boolean, message: string): void {
  if (!condition) {
    throw new AppErrors.ValidationError(message)
  }
}
