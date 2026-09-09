export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
  severity: "error" | "warning";
}

export class ValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[], heading = "Validation failed") {
    const details = issues
      .map((issue) => `[${issue.severity}] ${issue.path}: ${issue.message} (${issue.code})`)
      .join("\n");
    super(`${heading}\n${details}`);
    this.name = "ValidationError";
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
