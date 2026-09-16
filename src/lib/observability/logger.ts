/**
 * Minimal structured logger — same shape/contract as the Web repo's
 * src/lib/observability/logger.ts (not a shared package; two small
 * independent copies, deliberately, per "não criar framework grande").
 * Zero dependency on Sentry: logging an event is not the same claim as
 * "this was an unexpected exception" — see capture.ts for that.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  [key: string]: unknown;
}

function emit(level: LogLevel, event: string, fields: LogFields = {}) {
  const line = { level, event, time: new Date().toISOString(), ...fields };
  const json = JSON.stringify(line);
  switch (level) {
    case "debug":
      if (isDebugEnabled()) console.debug(json);
      break;
    case "info":
      console.info(json);
      break;
    case "warn":
      console.warn(json);
      break;
    case "error":
      console.error(json);
      break;
  }
}

function isDebugEnabled(): boolean {
  try {
    return window.localStorage?.getItem("rotazro:log_debug") === "1";
  } catch {
    return false;
  }
}

export const logger = {
  debug: (event: string, fields?: LogFields) => emit("debug", event, fields),
  info: (event: string, fields?: LogFields) => emit("info", event, fields),
  warn: (event: string, fields?: LogFields) => emit("warn", event, fields),
  error: (event: string, fields?: LogFields) => emit("error", event, fields),
};
