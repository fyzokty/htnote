export const appErrorCodes = [
  "NOTE_NOT_FOUND",
  "NOT_A_FOLDER",
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

export function toErrorMessageKey(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err &&
    appErrorCodes.some((code) => code === err.code)) {
    return `errors.${err.code}`;
  }
  return "errors.UNKNOWN";
}

export function notifyError(err: unknown): void {
  console.error(err);
  useUiStore.getState().pushToast({ kind: "error", messageKey: toErrorMessageKey(err) });
}
import { useUiStore } from "@/stores/uiStore";
