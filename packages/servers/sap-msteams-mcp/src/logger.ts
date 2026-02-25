/**
 * Logger module for SAP MS Teams MCP
 *
 * Supports verbose mode via VERBOSE=true environment variable.
 * When verbose mode is enabled, logs are written to ~/.sap-mcp/logs/sap-msteams-mcp.log
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ============================================================================
// Configuration
// ============================================================================

const LOG_DIR = path.join(os.homedir(), ".sap-mcp", "logs");
const LOG_FILE = path.join(LOG_DIR, "sap-msteams-mcp.log");
const VERBOSE = process.env.VERBOSE?.toLowerCase() === "true";

// ============================================================================
// Log File Setup
// ============================================================================

let logStream: fs.WriteStream | null = null;

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getLogStream(): fs.WriteStream {
  if (!logStream) {
    ensureLogDir();
    logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });
  }
  return logStream;
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: string, prefix: string, message: string, ...args: any[]): string {
  const argsStr = args.length > 0 ? " " + args.map(a =>
    typeof a === "object" ? JSON.stringify(a) : String(a)
  ).join(" ") : "";
  return `[${formatTimestamp()}] [${level}] [${prefix}] ${message}${argsStr}`;
}

// ============================================================================
// Logger Class
// ============================================================================

class Logger {
  private prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  /**
   * Write to log file (only in verbose mode)
   */
  private writeToFile(message: string): void {
    if (VERBOSE) {
      const stream = getLogStream();
      stream.write(message + "\n");
    }
  }

  /**
   * Info level - always output to stderr, write to file in verbose mode
   */
  info(message: string, ...args: any[]): void {
    const formatted = formatMessage("INFO", this.prefix, message, ...args);
    console.error(formatted);
    this.writeToFile(formatted);
  }

  /**
   * Error level - always output to stderr, write to file in verbose mode
   */
  error(message: string, ...args: any[]): void {
    const formatted = formatMessage("ERROR", this.prefix, message, ...args);
    console.error(formatted);
    this.writeToFile(formatted);
  }

  /**
   * Debug level - only in verbose mode (both stderr and file)
   */
  debug(message: string, ...args: any[]): void {
    if (VERBOSE) {
      const formatted = formatMessage("DEBUG", this.prefix, message, ...args);
      console.error(formatted);
      this.writeToFile(formatted);
    }
  }

  /**
   * Verbose level - only in verbose mode, only to file (not stderr)
   */
  verbose(message: string, ...args: any[]): void {
    if (VERBOSE) {
      const formatted = formatMessage("VERBOSE", this.prefix, message, ...args);
      this.writeToFile(formatted);
    }
  }
}

// ============================================================================
// Export
// ============================================================================

export function createLogger(prefix: string): Logger {
  return new Logger(prefix);
}

export function isVerbose(): boolean {
  return VERBOSE;
}

export function getLogFilePath(): string {
  return LOG_FILE;
}

export default Logger;
