import { FileLogger } from './fileLogger.js';

/**
 * Logger utility for structured logging with different levels
 */
export class Logger {
  private context: string;
  private isDebugEnabled: boolean;
  private fileLogger?: FileLogger;
  private isFileLoggingEnabled: boolean;

  constructor(context: string) {
    this.context = context;
    this.isDebugEnabled = process.env.LUDUS_DEBUG === 'true' || process.env.NODE_ENV === 'development';
    // Always enable file logging for debugging purposes
    this.isFileLoggingEnabled = true;
    
    if (this.isFileLoggingEnabled) {
      try {
        this.fileLogger = new FileLogger('ludus-mcp');
      } catch (error) {
        console.error('Failed to initialize file logging:', error);
      }
    }
  }

  /**
   * Log debug messages (only in debug mode)
   */
  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.isDebugEnabled) {
      this.log('DEBUG', message, meta);
    }
  }

  /**
   * Log info messages
   */
  info(message: string, meta?: Record<string, unknown>): void {
    this.log('INFO', message, meta);
  }

  /**
   * Log warning messages
   */
  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('WARN', message, meta);
  }

  /**
   * Log error messages
   */
  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    const errorMeta = error instanceof Error 
      ? { 
          message: error.message, 
          stack: error.stack,
          name: error.name,
          ...meta
        }
      : { error: String(error), ...meta };
    
    this.log('ERROR', message, errorMeta);
  }

  /**
   * Core logging method
   */
  private log(level: string, message: string, meta?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      context: this.context,
      message,
      ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
    };

    // Always write to file if enabled
    if (this.fileLogger) {
      this.fileLogger.log(level, this.context, message, meta);
    }

    // Output all logs to stderr to avoid interfering with MCP protocol on stdout
    const output = console.error;
    
    if (process.env.LUDUS_LOG_FORMAT === 'json') {
      output(JSON.stringify(logEntry));
    } else {
      const metaStr = meta && Object.keys(meta).length > 0 
        ? ` ${JSON.stringify(meta)}`
        : '';
      output(`[${timestamp}] ${level} [${this.context}] ${message}${metaStr}`);
    }
  }

  /**
   * Get the file log path if file logging is enabled
   */
  getLogPath(): string | null {
    return this.fileLogger?.getLogPath() || null;
  }

  /**
   * Get the log directory if file logging is enabled
   */
  getLogDirectory(): string | null {
    return this.fileLogger?.getLogDirectory() || null;
  }
} 