export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface PayCoreLogger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

function emit(
  level: LogLevel,
  message: string,
  base: Record<string, unknown>,
  fields: Record<string, unknown>,
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...base,
    ...fields,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function createLogger(base: Record<string, unknown> = {}): PayCoreLogger {
  return {
    debug: (message, fields = {}) => emit('debug', message, base, fields),
    info: (message, fields = {}) => emit('info', message, base, fields),
    warn: (message, fields = {}) => emit('warn', message, base, fields),
    error: (message, fields = {}) => emit('error', message, base, fields),
  };
}

export function log(
  level: LogLevel,
  message: string,
  fields: Record<string, unknown> = {},
): void {
  emit(level, message, {}, fields);
}