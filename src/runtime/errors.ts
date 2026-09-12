import type { RuntimeErrorCode } from "./types.js";

export class RuntimeError extends Error {
  readonly code: RuntimeErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: RuntimeErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "RuntimeError";
    this.code = code;
    this.details = details;
  }
}
