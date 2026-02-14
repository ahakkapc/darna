type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  level: LogLevel;
  msg: string;
  [key: string]: unknown;
}

function formatEntry(entry: LogEntry): string {
  const { level, msg, ...fields } = entry;
  const ts = new Date().toISOString();
  const extras = Object.keys(fields).length > 0 ? ' ' + JSON.stringify(fields) : '';
  return `${ts} [${level.toUpperCase()}] ${msg}${extras}`;
}

export const logger = {
  info(msg: string, fields: Record<string, unknown> = {}) {
    console.log(formatEntry({ level: 'info', msg, ...fields }));
  },
  warn(msg: string, fields: Record<string, unknown> = {}) {
    console.warn(formatEntry({ level: 'warn', msg, ...fields }));
  },
  error(msg: string, fields: Record<string, unknown> = {}) {
    console.error(formatEntry({ level: 'error', msg, ...fields }));
  },
  debug(msg: string, fields: Record<string, unknown> = {}) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(formatEntry({ level: 'debug', msg, ...fields }));
    }
  },
};
