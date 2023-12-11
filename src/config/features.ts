export const features = (environment: string) => {
  const dev = environment === 'development'

  return {
    ROLE_CONNECTIONS_METADATA: dev,
    QUEUE_MESSAGE: dev,
    DETAILED_ERROR_MESSAGES: dev,
    EXPERIMENTAL_VIEWS: dev,
    ALL_COMMANDS_GUILD: dev,
  }
}
