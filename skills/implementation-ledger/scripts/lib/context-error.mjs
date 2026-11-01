export class ContextError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ContextError";
    this.diagnostic = { code, message, ...details };
  }
}
