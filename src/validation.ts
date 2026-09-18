export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
  severity: "error" | "warning";
}

export class ValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[], heading = "Validation failed") {
    const focus = issues.filter((item) => item.severity === "error");
    const listed = focus.length > 0 ? focus : issues;
    const details =
      heading === "BoardValidationError"
        ? listed.map((item) => `BoardValidationError: ${item.message}`).join("\n")
        : listed
            .map((item) => `[${item.severity}] ${item.path}: ${item.message} (${item.code})`)
            .join("\n");
    super(heading === "BoardValidationError" ? details : `${heading}\n${details}`);
    this.name = heading === "BoardValidationError" ? "BoardValidationError" : "ValidationError";
    this.issues = issues;
  }
}

export function errorsOnly(issues: ValidationIssue[]): ValidationIssue[] {
  return issues.filter((issue) => issue.severity === "error");
}

export function throwIfErrors(issues: ValidationIssue[], heading?: string): void {
  const errors = errorsOnly(issues);
  if (errors.length > 0) {
    throw new ValidationError(issues, heading);
  }
}

export function issue(
  code: string,
  path: string,
  message: string,
  severity: "error" | "warning" = "error",
): ValidationIssue {
  return { code, path, message, severity };
}
