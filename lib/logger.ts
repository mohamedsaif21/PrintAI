/**
 * Client-side error logging and monitoring setup
 * Currently configured for console logging
 * Ready for Sentry/LogRocket integration
 */

export interface LogContext {
  userId?: string;
  sessionId?: string;
  [key: string]: unknown;
}

let globalContext: LogContext = {};

/**
 * Set global context for all logs
 */
export function setLogContext(context: LogContext) {
  globalContext = { ...globalContext, ...context };
}

/**
 * Log an error event
 */
export function logError(error: Error | string, context?: LogContext) {
  const fullContext = { ...globalContext, ...context };
  const errorObj = typeof error === "string" ? new Error(error) : error;

  console.error("[PrintAI Error]", {
    message: errorObj.message,
    stack: errorObj.stack,
    context: fullContext,
    timestamp: new Date().toISOString(),
  });

  // TODO: Integrate with Sentry, LogRocket, or similar
  // Example:
  // Sentry.captureException(error, { contexts: { custom: fullContext } });
}

/**
 * Log a warning event
 */
export function logWarn(message: string, context?: LogContext) {
  const fullContext = { ...globalContext, ...context };

  console.warn("[PrintAI Warning]", {
    message,
    context: fullContext,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log an info event
 */
export function logInfo(message: string, context?: LogContext) {
  const fullContext = { ...globalContext, ...context };

  console.log("[PrintAI Info]", {
    message,
    context: fullContext,
    timestamp: new Date().toISOString(),
  });
}
