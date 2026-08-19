export class MediaGenError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly exitCode = 1,
    readonly help: string[] = [],
  ) {
    super(message)
    this.name = 'MediaGenError'
  }
}
