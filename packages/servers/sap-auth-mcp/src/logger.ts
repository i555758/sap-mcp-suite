import { existsSync, mkdirSync, appendFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LoggerConfig {
  verbose: boolean;
  logDir: string;
  logFile: string;
}

class Logger {
  private config: LoggerConfig;
  private initialized = false;

  constructor() {
    const verbose = process.env.VERBOSE === "true";
    const logDir = join(homedir(), ".sap-mcp", "logs");
    const logFile = join(logDir, "sap-auth-mcp.log");

    this.config = {
      verbose,
      logDir,
      logFile,
    };

    if (verbose) {
      this.ensureLogDirectory();
      this.initialized = true;
      this.info("Logger initialized in VERBOSE mode");
      this.debug(`Log file: ${logFile}`);
    }
  }

  private ensureLogDirectory(): void {
    try {
      if (!existsSync(this.config.logDir)) {
        mkdirSync(this.config.logDir, { recursive: true });
      }
    } catch (error) {
      console.error(`Failed to create log directory: ${this.config.logDir}`, error);
    }
  }

  private formatMessage(level: LogLevel, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const levelUpper = level.toUpperCase().padEnd(5);
    let formatted = `[${timestamp}] [${levelUpper}] ${message}`;

    if (data !== undefined) {
      if (typeof data === "object") {
        formatted += `\n${JSON.stringify(data, null, 2)}`;
      } else {
        formatted += ` ${data}`;
      }
    }

    return formatted;
  }

  private writeToFile(message: string): void {
    if (!this.config.verbose) return;

    try {
      appendFileSync(this.config.logFile, message + "\n", "utf8");
    } catch (error) {
      // Silently fail if we can't write to log file
    }
  }

  private log(level: LogLevel, message: string, data?: any): void {
    const formatted = this.formatMessage(level, message, data);

    // Always write to stderr for MCP compatibility
    if (level === "error") {
      console.error(formatted);
    } else if (level === "warn") {
      console.error(formatted);
    } else if (level === "info") {
      console.error(message); // Keep info messages simple for console
    }

    // Write detailed logs to file in verbose mode
    if (this.config.verbose) {
      this.writeToFile(formatted);
    }
  }

  /**
   * Debug level - only outputs when VERBOSE=true
   */
  debug(message: string, data?: any): void {
    if (this.config.verbose) {
      const formatted = this.formatMessage("debug", message, data);
      console.error(`[DEBUG] ${message}`);
      this.writeToFile(formatted);
    }
  }

  /**
   * Info level - always outputs to console, detailed to file in verbose mode
   */
  info(message: string, data?: any): void {
    this.log("info", message, data);
  }

  /**
   * Warn level - always outputs
   */
  warn(message: string, data?: any): void {
    this.log("warn", message, data);
  }

  /**
   * Error level - always outputs
   */
  error(message: string, data?: any): void {
    this.log("error", message, data);
  }

  /**
   * Check if verbose mode is enabled
   */
  isVerbose(): boolean {
    return this.config.verbose;
  }

  /**
   * Get the log file path
   */
  getLogFilePath(): string {
    return this.config.logFile;
  }

  /**
   * Log separator for visual clarity in log file
   */
  separator(title?: string): void {
    if (this.config.verbose) {
      const line = "=".repeat(60);
      if (title) {
        this.writeToFile(`\n${line}\n${title}\n${line}`);
      } else {
        this.writeToFile(`\n${line}`);
      }
    }
  }

  /**
   * Log function entry with parameters (for detailed tracing)
   */
  enter(functionName: string, params?: any): void {
    if (this.config.verbose) {
      this.debug(`>>> ENTER: ${functionName}`, params);
    }
  }

  /**
   * Log function exit with result (for detailed tracing)
   */
  exit(functionName: string, result?: any): void {
    if (this.config.verbose) {
      this.debug(`<<< EXIT: ${functionName}`, result);
    }
  }

  /**
   * Log HTTP request details
   */
  httpRequest(method: string, url: string, headers?: any, body?: any): void {
    if (this.config.verbose) {
      this.debug(`HTTP ${method} ${url}`, { headers, body });
    }
  }

  /**
   * Log HTTP response details
   */
  httpResponse(status: number, url: string, headers?: any, body?: any): void {
    if (this.config.verbose) {
      this.debug(`HTTP Response ${status} from ${url}`, { headers, bodyPreview: body?.substring?.(0, 500) });
    }
  }

  /**
   * Log browser action
   */
  browser(action: string, details?: any): void {
    if (this.config.verbose) {
      this.debug(`[Browser] ${action}`, details);
    }
  }

  /**
   * Log cookie operation
   */
  cookie(operation: string, details?: any): void {
    if (this.config.verbose) {
      this.debug(`[Cookie] ${operation}`, details);
    }
  }

  /**
   * Log token operation
   */
  token(operation: string, details?: any): void {
    if (this.config.verbose) {
      this.debug(`[Token] ${operation}`, details);
    }
  }

  /**
   * Log authentication step
   */
  auth(step: string, details?: any): void {
    if (this.config.verbose) {
      this.debug(`[Auth] ${step}`, details);
    }
  }
}

// Singleton instance
export const logger = new Logger();
