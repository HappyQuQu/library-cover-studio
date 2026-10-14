/** Machine-readable failures keep interface language out of data and async state. */
export class CodedError extends Error {
  constructor(public readonly code: string, message = code) { super(message); this.name = 'CodedError'; }
}
