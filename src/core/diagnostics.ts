export type DiagnosticSeverity = "error" | "warning" | "info";

export interface SourcePosition {
  offset: number;
  line: number;
  column: number;
}

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  position?: SourcePosition;
  raw?: string;
}

export interface WithDiagnostics<T> {
  value: T;
  diagnostics: Diagnostic[];
}

export const emptyDiagnostics = <T>(value: T): WithDiagnostics<T> => ({
  value,
  diagnostics: []
});

export const warning = (code: string, message: string, raw?: string): Diagnostic => ({
  severity: "warning",
  code,
  message,
  raw
});

export const error = (code: string, message: string, raw?: string): Diagnostic => ({
  severity: "error",
  code,
  message,
  raw
});

