
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class FileLogger {
  private logDir: string;
  private logFile: string;
  private maxFileSize: number;
  private maxFiles: number;

  constructor(
    logName: string = 'ludus-mcp', 
    maxFileSize: number = 10 * 1024 * 1024, // 10MB
    maxFiles: number = 5
  ) {
    // Create logs directory in user's temp/home directory
    this.logDir = path.join(os.homedir(), '.ludus-mcp', 'logs');
    this.logFile = path.join(this.logDir, `${logName}.log`);
    this.maxFileSize = maxFileSize;
    this.maxFiles = maxFiles;

    this.ensureLogDirectory();
  }

  private ensureLogDirectory(): void {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (error) {
      console.error('Failed to create log directory:', error);
    }
  }

  private rotateIfNeeded(): void {
    try {
      if (!fs.existsSync(this.logFile)) {
        return;
      }

      const stats = fs.statSync(this.logFile);
      if (stats.size >= this.maxFileSize) {
        this.rotateFiles();
      }
    } catch (error) {
      console.error('Error checking log file size:', error);
    }
  }

  private rotateFiles(): void {
    try {
      // Move current log to .1, .1 to .2, etc.
      for (let i = this.maxFiles - 1; i >= 1; i--) {
        const oldFile = `${this.logFile}.${i}`;
        const newFile = `${this.logFile}.${i + 1}`;
        
        if (fs.existsSync(oldFile)) {
          if (i === this.maxFiles - 1) {
            fs.unlinkSync(oldFile); // Delete oldest
          } else {
            fs.renameSync(oldFile, newFile);
          }
        }
      }

      // Move current log to .1
      if (fs.existsSync(this.logFile)) {
        fs.renameSync(this.logFile, `${this.logFile}.1`);
      }
    } catch (error) {
      console.error('Error rotating log files:', error);
    }
  }

  private formatValue(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    
    // Handle Error objects specially
    if (value instanceof Error) {
      return `${value.name}: ${value.message}\n${value.stack || 'No stack trace'}`;
    }
    
    // Handle objects that might have circular references or non-enumerable properties
    try {
      // First try regular JSON.stringify
      return JSON.stringify(value, null, 2);
    } catch (jsonError) {
      // Fallback: try to extract common error properties manually
      if (value && typeof value === 'object') {
        const errorProps: string[] = [];
        
        // Try to get common error properties
        const commonProps = ['message', 'code', 'errno', 'syscall', 'path', 'name', 'stack', 'signal', 'status', 'stderr', 'stdout'];
        for (const prop of commonProps) {
          if (prop in value && value[prop] !== undefined) {
            errorProps.push(`${prop}: ${String(value[prop])}`);
          }
        }
        
        // If we found some properties, use them
        if (errorProps.length > 0) {
          return errorProps.join('\n');
        }
        
        // Last resort: try to get all enumerable properties
        try {
          const props = Object.keys(value).map(key => `${key}: ${String(value[key])}`);
          if (props.length > 0) {
            return props.join('\n');
          }
        } catch (e) {
          // Even this failed
        }
      }
      
      // Final fallback
      return `[Complex object - toString: ${String(value)}]`;
    }
  }

  log(level: string, context: string, message: string, meta?: Record<string, any>): void {
    try {
      this.rotateIfNeeded();

      const timestamp = new Date().toISOString();
      let logLine = `[${timestamp}] ${level.toUpperCase()} [${context}] ${message}`;
      
      if (meta && Object.keys(meta).length > 0) {
        logLine += '\n  Metadata:';
        for (const [key, value] of Object.entries(meta)) {
          const formattedValue = this.formatValue(value);
          logLine += `\n    ${key}: ${formattedValue}`;
        }
      }
      
      logLine += '\n\n';
      
      fs.appendFileSync(this.logFile, logLine, 'utf8');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  getLogPath(): string {
    return this.logFile;
  }

  getLogDirectory(): string {
    return this.logDir;
  }
} 