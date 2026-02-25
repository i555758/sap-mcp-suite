import { promises as fs, mkdirSync, appendFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

class Logger {
  private logFile: string | null = null;
  private isVerbose: boolean = false;
  private initializationFailed: boolean = false;

  constructor() {
    // Check VERBOSE environment variable
    const verbose = process.env.VERBOSE?.toLowerCase();
    this.isVerbose = verbose === "true" || verbose === "1";

    if (this.isVerbose) {
      const logDir = join(homedir(), ".sap-mcp", "logs");
      this.logFile = join(logDir, "sap-jira-mcp.log");

      try {
        // Synchronously ensure log directory exists
        // This prevents race conditions where log writes happen before directory is created
        mkdirSync(logDir, { recursive: true });

        // Verify we can write to the log file by attempting to create/open it
        // Using 'a' flag to append (or create if doesn't exist) without truncating
        appendFileSync(this.logFile, "", { flag: "a" });

        // Log startup - now safe to write
        this.info("=".repeat(80));
        this.info(`Jira MCP Server started at ${new Date().toISOString()}`);
        this.info(`Verbose logging enabled, output to: ${this.logFile}`);
        this.info("=".repeat(80));
      } catch (err) {
        // If initialization fails, disable verbose mode and log error
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(
          `[LOGGER_INIT_ERROR] Failed to initialize verbose logging: ${errorMessage}`,
        );
        console.error(`[LOGGER_INIT_ERROR] Log file path: ${this.logFile}`);
        console.error(`[LOGGER_INIT_ERROR] Verbose logging disabled`);

        this.isVerbose = false;
        this.initializationFailed = true;
        this.logFile = null;
      }
    }
  }

  private async writeToFile(level: string, message: string, ...args: any[]) {
    if (!this.isVerbose || !this.logFile) return;

    try {
      const timestamp = new Date().toISOString();
      const formattedArgs =
        args.length > 0
          ? " " +
            args
              .map((arg) =>
                typeof arg === "object"
                  ? JSON.stringify(arg, null, 2)
                  : String(arg),
              )
              .join(" ")
          : "";

      const logLine = `[${timestamp}] [${level}] ${message}${formattedArgs}\n`;

      await fs.appendFile(this.logFile, logLine, "utf8");
    } catch (error) {
      // Fail silently to avoid breaking the application
      console.error(`Failed to write to log file: ${(error as Error).message}`);
    }
  }

  debug(message: string, ...args: any[]) {
    if (this.isVerbose) {
      console.error(`[DEBUG] ${message}`, ...args);
      this.writeToFile("DEBUG", message, ...args);
    }
  }

  info(message: string, ...args: any[]) {
    console.error(message, ...args);
    if (this.isVerbose) {
      this.writeToFile("INFO", message, ...args);
    }
  }

  warn(message: string, ...args: any[]) {
    console.error(`[WARN] ${message}`, ...args);
    if (this.isVerbose) {
      this.writeToFile("WARN", message, ...args);
    }
  }

  error(message: string, ...args: any[]) {
    console.error(`[ERROR] ${message}`, ...args);
    if (this.isVerbose) {
      this.writeToFile("ERROR", message, ...args);
    }
  }

  getLogFile(): string | null {
    return this.logFile;
  }

  isVerboseMode(): boolean {
    return this.isVerbose;
  }
}

// Export singleton instance
export const logger = new Logger();
