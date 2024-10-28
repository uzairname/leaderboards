
export class RequestTimeoutError extends Error {
  constructor(request_name: string, timeout_ms: number) {
    super(`"${request_name}" timed out after ${timeout_ms} ms`)
    this.name = RequestTimeoutError.name
  }
}
