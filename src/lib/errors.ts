export const appErrorCodes = [
  "NOTE_NOT_FOUND",
  "NAME_CONFLICT",
  "INVALID_NAME",
  "PATH_OUTSIDE_ROOT",
  "IO_ERROR",
  "JSON_ERROR",
  "INTERNAL",
] as const;

export type AppErrorCode = (typeof appErrorCodes)[number];

export interface AppError {
  code: AppErrorCode;
  message: string;
}

export function isAppError(value: unknown): value is AppError {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.code === "string" &&
    appErrorCodes.some((code) => code === candidate.code) &&
    typeof candidate.message === "string"
  );
}
