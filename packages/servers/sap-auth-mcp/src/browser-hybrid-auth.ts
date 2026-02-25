import puppeteer, { Browser, Page } from "puppeteer";
import { existsSync } from "fs";
import { join } from "path";
import { CookieStore } from "./cookie-storage.js";
import { TokenExtractor } from "./token-extractor.js";
import { logger } from "./logger.js";

/**
 * Cross-platform helpers for User-Agent and client hints.
 */
function buildUserAgent(): string {
  if (process.env.FORCE_UA) return process.env.FORCE_UA;
  switch (process.platform) {
    case "win32":
      // Use Edge User-Agent for Windows
      return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
    case "linux":
      return "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    case "darwin":
    default:
      return "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  }
}

function buildSecChPlatform(): string {
  if (process.env.FORCE_PLATFORM_HEADER)
    return process.env.FORCE_PLATFORM_HEADER;
  switch (process.platform) {
    case "win32":
      return '"Windows"';
    case "linux":
      return '"Linux"';
    case "darwin":
    default:
      return '"macOS"';
  }
}

export class SAP_BrowserHybridAuth {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private cookies: any[] = [];
  private cookieStore: CookieStore;
  private readonly SAP_DOMAIN: string;
  private readonly BROWSER_PATH: string;
  private readonly USER_EMAIL = process.env.SAP_AUTH_ACCOUNT;
  private readonly IN_PRIVATE = process.env.IN_PRIVATE === "true";
  private readonly VISIBLE_MODE = process.env.VISIBLE_MODE === "true";
  private readonly FORCE_MANUAL_FALLBACK =
    process.env.FORCE_MANUAL_FALLBACK === "true";
  private readonly ENTRY_URL: string;

  // Dynamic UA & client hints
  private readonly DYNAMIC_USER_AGENT: string = buildUserAgent();
  private readonly SEC_CH_PLATFORM: string = buildSecChPlatform();

  // Platform-specific flags
  private readonly MAC_FLAGS: string[] = [
    "--use-mock-keychain=true",
    "--password-store=basic",
    "--disable-keychain-reauthorization",
    "--disable-mac-overlays",
  ];

  private readonly WINDOWS_FLAGS: string[] = [
    "--disable-gpu",
    "--window-size=1200,800",
  ];

  private readonly LINUX_FLAGS: string[] = [
    "--disable-gpu",
    "--window-size=1200,800",
  ];

  // Browser instance management
  private isInitialized = false;
  private currentMode: "headless" | "visible" | null = null;
  private cleanupHandlersSetup = false;

  constructor(entryUrl: string, storePath?: string) {
    this.ENTRY_URL = entryUrl;
    // Extract domain from entryUrl for backward compatibility
    try {
      const url = new URL(entryUrl);
      this.SAP_DOMAIN = url.hostname;
    } catch (error) {
      console.warn(`Invalid entry URL: ${entryUrl}, using default domain`);
      this.SAP_DOMAIN = "wiki.one.int.sap";
    }

    // Initialize cookie store (will create directory if needed)
    try {
      this.cookieStore = new CookieStore(storePath);
    } catch (error) {
      console.error("❌ Failed to initialize cookie storage:", error);
      throw error;
    }

    // Resolve browser executable path (env override > platform defaults)
    const envBrowserPath = process.env.BROWSER_PATH;
    if (envBrowserPath && existsSync(envBrowserPath)) {
      this.BROWSER_PATH = envBrowserPath;
    } else {
      let resolved: string | undefined;
      if (process.platform === "win32") {
        // Use Edge as default for Windows
        const winCandidates = [
          "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        ];
        resolved = winCandidates.find((p) => existsSync(p)) || winCandidates[0];
      } else if (process.platform === "darwin") {
        resolved =
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
      } else {
        // Linux candidates
        const linuxCandidates = [
          "/usr/bin/google-chrome",
          "/usr/bin/google-chrome-stable",
          "/usr/bin/chromium-browser",
          "/usr/bin/chromium",
          "/snap/bin/chromium",
          "/opt/google/chrome/chrome",
        ];
        resolved =
          linuxCandidates.find((p) => existsSync(p)) ||
          "/usr/bin/google-chrome";
      }
      this.BROWSER_PATH = resolved;
    }
    console.log(
      `🧭 Browser executable path resolved: ${this.BROWSER_PATH}${existsSync(this.BROWSER_PATH) ? "" : " (not found - Puppeteer default fallback)"}`,
    );

    console.log(`🖥️ Node platform: ${process.platform}`);
    console.log(`🛠️ Using dynamic User-Agent: ${this.DYNAMIC_USER_AGENT}`);
    console.log(`🧩 sec-ch-ua-platform: ${this.SEC_CH_PLATFORM}`);

    if (this.USER_EMAIL) {
      console.log(`🔐 SAP Auth Account (from env): ${this.USER_EMAIL}`);
    } else {
      console.log("🔐 SAP Auth Auth Account: Auto-select first available");
    }
    console.log(`🎯 Entry URL: ${this.ENTRY_URL}`);
    console.log(`🏠 Domain: ${this.SAP_DOMAIN}`);
    console.log(`🕵️ Private Mode: ${this.IN_PRIVATE ? "Enabled" : "Disabled"}`);
    console.log(
      `👁️ Visible Mode: ${this.VISIBLE_MODE ? "Enabled (visible browser for debugging)" : "Disabled (hybrid mode)"}`,
    );
    console.log(
      `🔧 Force Manual Fallback: ${this.FORCE_MANUAL_FALLBACK ? "Enabled (testing complete automation failure)" : "Disabled"}`,
    );
    if (storePath) {
      console.log(`📁 Cookie store path: ${storePath}/sap_cookies.json`);
    }

    // Log verbose mode status
    if (logger.isVerbose()) {
      console.log(
        `📝 VERBOSE mode enabled - logs at: ${logger.getLogFilePath()}`,
      );
      logger.separator("SAP_BrowserHybridAuth Initialized");
      logger.debug("Constructor parameters", { entryUrl, storePath });
      logger.debug("Environment configuration", {
        USER_EMAIL: this.USER_EMAIL,
        IN_PRIVATE: this.IN_PRIVATE,
        VISIBLE_MODE: this.VISIBLE_MODE,
        FORCE_MANUAL_FALLBACK: this.FORCE_MANUAL_FALLBACK,
        BROWSER_PATH: this.BROWSER_PATH,
        platform: process.platform,
      });
    }
  }

  async initialize(): Promise<void> {
    logger.enter("initialize");

    // Skip initialization if already initialized to prevent multiple instances
    if (this.isInitialized && this.browser) {
      console.log("🔄 Browser already initialized, reusing existing instance");
      return;
    }

    // If VISIBLE_MODE is enabled, skip headless initialization to avoid double browser instances
    if (this.VISIBLE_MODE) {
      console.log("👁️ Visible mode: Skipping headless browser initialization");
      console.log(
        "   ✅ Browser will be initialized as visible browser when authentication starts",
      );

      // Still do cleanup even in visible mode
      console.log("🧹 Cleanup: checking for any lingering Chrome processes...");
      await this.killRemainingChromeProcesses();

      this.isInitialized = true;
      return;
    }

    try {
      // Use unified browser launch method
      await this.launchBrowser(true); // true = headless mode
      console.log("Hybrid browser initialized successfully (headless mode)");
    } catch (error) {
      console.error("Failed to initialize browser:", error);
      await this.emergencyCleanup();
      throw error;
    }
  }

  /**
   * Get common browser args (excluding platform-specific ones added elsewhere)
   */
  private getCommonChromeArgs(): string[] {
    const baseArgs = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--no-first-run",
      "--disable-default-apps",
      "--use-system-certificate-store",
      "--auth-server-whitelist=*.sap.com,*.one.int.sap,*.wdf.sap.corp",
      "--auth-negotiate-delegate-whitelist=*.sap.com,*.one.int.sap,*.wdf.sap.corp",
      "--auth-schemes=basic,digest,ntlm,negotiate",
      "--window-size=1200,800",
    ];

    return baseArgs;
  }

  /**
   * Set up process cleanup handlers to prevent memory leaks
   */
  private setupProcessCleanup(): void {
    const cleanup = async () => {
      console.log("🧹 Process cleanup: Closing browser...");
      await this.close();
      process.exit(0);
    };

    // Handle various exit signals
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("exit", () => {
      if (this.browser) {
        console.log("🧹 Process exit: Force closing browser...");
        // Use synchronous close for process exit
        this.browser.close().catch(() => {});
      }
    });
    process.on("uncaughtException", async (error) => {
      console.error("🚨 Uncaught exception, cleaning up browser:", error);
      await this.emergencyCleanup();
      process.exit(1);
    });
    process.on("unhandledRejection", async (reason) => {
      console.error("🚨 Unhandled rejection, cleaning up browser:", reason);
      await this.emergencyCleanup();
      process.exit(1);
    });
  }

  /**
   * Safe browser close method - prevents hanging Chrome instances
   */
  private async safeBrowserClose(): Promise<void> {
    if (!this.browser) return;

    let browserProcess: any = null;

    try {
      console.log("🔄 Safely closing existing browser instance...");

      // Get the browser process reference before closing
      browserProcess = this.browser.process();

      // First try to close all pages
      const pages = await this.browser.pages();
      for (const page of pages) {
        try {
          await page.close();
        } catch (error) {
          console.warn("⚠️ Warning: Error closing page:", error);
        }
      }

      // Then close the browser
      await this.browser.close();
      console.log("✅ Browser instance closed successfully");
    } catch (error) {
      console.warn("⚠️ Warning: Error during safe browser close:", error);
    }

    // Always try to kill the process forcefully as a backup
    try {
      if (browserProcess && !browserProcess.killed) {
        console.log("🔪 Force killing browser process to ensure cleanup...");

        // Try different kill signals
        try {
          browserProcess.kill("SIGTERM");
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second

          if (!browserProcess.killed) {
            console.log("🔪 SIGTERM didn't work, trying SIGKILL...");
            browserProcess.kill("SIGKILL");
            await new Promise((resolve) => setTimeout(resolve, 500)); // Wait 0.5 seconds
          }
        } catch (killError) {
          console.warn("⚠️ Warning: Error killing browser process:", killError);
        }

        // Final check
        if (browserProcess.killed) {
          console.log("✅ Browser process terminated successfully");
        } else {
          console.warn("⚠️ Warning: Browser process may still be running");
        }
      }
    } catch (processError) {
      console.warn(
        "⚠️ Warning: Error accessing browser process:",
        processError,
      );
    }

    // Additional system-level cleanup for macOS
    try {
      await this.killRemainingChromeProcesses();
    } catch (systemError) {
      console.warn("⚠️ Warning: System-level cleanup failed:", systemError);
    }

    // Reset all references
    this.browser = null;
    this.page = null;
    this.currentMode = null;
    this.isInitialized = false;
  }

  /**
   * Kill any remaining Chrome processes that might be lingering
   */
  private async killRemainingChromeProcesses(): Promise<void> {
    try {
      // Find Chrome processes that contain our specific flags
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      // Look for Chrome processes with puppeteer-specific flags
      const { stdout } = await execAsync(
        `ps aux | grep "Chrome.*--remote-debugging-port" | grep -v grep`,
      );

      if (stdout.trim()) {
        console.log("🔍 Found lingering Chrome processes, cleaning up...");

        // Extract PIDs and kill them
        const lines = stdout.trim().split("\n");
        for (const line of lines) {
          const match = line.match(/\s+(\d+)\s+/);
          if (match) {
            const pid = match[1];
            try {
              await execAsync(`kill -9 ${pid}`);
              console.log(`🔪 Killed lingering Chrome process ${pid}`);
            } catch (killError) {
              console.warn(
                `⚠️ Warning: Failed to kill process ${pid}:`,
                killError,
              );
            }
          }
        }
      }
    } catch (error) {
      // Silent fail - this is just a cleanup attempt
      console.warn("⚠️ Warning: System cleanup attempt failed:", error);
    }
  }

  /**
   * Emergency cleanup for critical errors
   */
  private async emergencyCleanup(): Promise<void> {
    try {
      await this.safeBrowserClose();
    } catch (error) {
      console.error("Emergency cleanup failed:", error);
    }
  }

  /**
   * Unified browser launch method - prevents multiple instances
   */
  private async launchBrowser(headless: boolean = true): Promise<void> {
    // Skip if browser is already running in the desired mode
    const desiredMode = headless ? "headless" : "visible";
    if (this.browser && this.currentMode === desiredMode) {
      console.log(
        `🔄 Browser already running in ${desiredMode} mode, reusing instance`,
      );
      return;
    }

    // Close existing browser if switching modes
    if (this.browser && this.currentMode !== desiredMode) {
      console.log(
        `🔄 Switching from ${this.currentMode} to ${desiredMode} mode`,
      );
      await this.safeBrowserClose();
    }

    // Pre-launch cleanup: ensure no lingering Chrome processes
    console.log(
      "🧹 Pre-launch cleanup: checking for lingering Chrome processes...",
    );
    await this.killRemainingChromeProcesses();

    try {
      const platformSpecificFlags =
        process.platform === "darwin"
          ? this.MAC_FLAGS
          : process.platform === "win32"
            ? this.WINDOWS_FLAGS
            : this.LINUX_FLAGS;

      const launchOptions: any = {
        headless: headless ? "new" : false,
        devtools: !headless,
        executablePath: existsSync(this.BROWSER_PATH)
          ? this.BROWSER_PATH
          : undefined,
        args: [
          ...this.getCommonChromeArgs(),
          ...platformSpecificFlags,
          // Additional args for headless mode
          ...(headless
            ? [
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-popup-blocking",
              ]
            : []),
          // Private/Incognito mode - proper configuration
          ...(this.IN_PRIVATE
            ? [
                "--incognito",
                "--disable-background-networking",
                "--disable-background-timer-throttling",
                "--disable-renderer-backgrounding",
                "--disable-backgrounding-occluded-windows",
                "--disable-client-side-phishing-detection",
                "--disable-default-apps",
                "--disable-extensions",
                "--disable-sync",
                "--disable-translate",
                "--hide-scrollbars",
                "--metrics-recording-only",
                "--mute-audio",
                "--no-first-run",
                "--safebrowsing-disable-auto-update",
                "--disable-ipc-flooding-protection",
              ]
            : []),
        ],
      };

      console.log(`🚀 Launching ${desiredMode} browser...`);
      this.browser = await puppeteer.launch(launchOptions);
      this.currentMode = desiredMode;

      // Set up process cleanup handlers (only once)
      if (!this.cleanupHandlersSetup) {
        this.setupProcessCleanup();
        this.cleanupHandlersSetup = true;
      }

      // Use the first (default) page instead of creating a new one to avoid multiple windows
      const pages = await this.browser.pages();
      if (pages.length > 0) {
        this.page = pages[0];
        console.log(
          "🪟 Using default browser page (avoiding duplicate windows)",
        );
      } else {
        // Fallback if no default page exists
        this.page = await this.browser.newPage();
        console.log("🪟 Created new browser page");
      }

      // Configure page
      await this.configurePageDefaults();
      this.isInitialized = true;

      console.log(`✅ ${desiredMode} browser launched successfully`);
    } catch (error) {
      console.error(`❌ Failed to launch ${desiredMode} browser:`, error);
      await this.emergencyCleanup();
      throw error;
    }
  }

  /**
   * Configure default page settings
   */
  private async configurePageDefaults(): Promise<void> {
    if (!this.page) return;

    // If in private mode, ensure we start fresh without any cached data
    if (this.IN_PRIVATE) {
      console.log(
        "🕵️ Private mode: Clearing all browser data and starting fresh...",
      );
      await this.page.evaluateOnNewDocument(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
    }

    // Set dynamic user agent
    await this.page.setUserAgent(this.DYNAMIC_USER_AGENT);

    // Set viewport
    await this.page.setViewport({ width: 1920, height: 1080 });

    // Load stored cookies for MCP integration
    await this.loadStoredCookies();
    if (this.IN_PRIVATE) {
      console.log(
        "🕵️ Private mode: Loading stored cookies for MCP integration",
      );
    }
  }

  /**
   * Hybrid authentication: Start headless, switch to visible if needed
   */
  async authenticateWithHybridMode(): Promise<boolean> {
    const url = this.ENTRY_URL;
    logger.separator("Starting Authentication");
    logger.auth("authenticateWithHybridMode started", {
      url,
      VISIBLE_MODE: this.VISIBLE_MODE,
    });

    if (this.VISIBLE_MODE) {
      console.log("🔄 Starting visible mode authentication...");
      console.log(
        "   📝 Strategy: Direct visible browser for debugging (you can watch the automation)",
      );
      console.log("\n📋 Visible Mode: Full Visible Browser Authentication");

      // Close any existing headless browser first (if initialized)
      if (this.browser) {
        console.log(
          "   🔄 Closing existing headless browser for visible mode...",
        );
        try {
          await this.browser.close();
        } catch (error) {
          console.warn(
            "Warning: Error closing existing headless browser:",
            error,
          );
        }
        this.browser = null;
        this.page = null;
      } else {
        console.log(
          "   ✅ No headless browser to close (visible mode optimization)",
        );
      }

      return await this.startVisibleModeAuthentication();
    }

    console.log("🔄 Starting hybrid authentication mode...");
    console.log(
      "   📝 Strategy: Headless email clicking → Visible fallback for complex auth",
    );

    // Teams SSO can require multiple authentication rounds
    // We'll retry up to 3 times before falling back to visible mode
    const MAX_SSO_RETRIES = 3;
    const isTeamsAuth = TokenExtractor.isTeamsUrl(this.ENTRY_URL);

    for (let ssoAttempt = 1; ssoAttempt <= MAX_SSO_RETRIES; ssoAttempt++) {
      try {
        console.log(
          `\n📋 SSO Attempt ${ssoAttempt}/${MAX_SSO_RETRIES}: Headless Email Account Selection`,
        );
        logger.debug(`SSO attempt ${ssoAttempt}/${MAX_SSO_RETRIES}`, {
          isTeamsAuth,
        });

        const headlessSuccess = await this.attemptHeadlessEmailClick();

        if (headlessSuccess.clicked) {
          console.log(
            `✅ SSO Attempt ${ssoAttempt}: Email account clicked successfully`,
          );

          // Check if we need additional authentication (MFA, etc.)
          if (headlessSuccess.needsUserInteraction) {
            console.log(
              "\n📋 Phase 2: Switching to Visible Browser for User Interaction",
            );
            return await this.switchToVisibleForCompletion();
          }

          // Wait 3 seconds and check if we're on target page or redirected back to SSO
          console.log(
            "   ⏳ Waiting 3s to confirm we're on target page (Teams may have double SSO)...",
          );
          await new Promise((resolve) => setTimeout(resolve, 3000));

          const currentUrl = this.page?.url() || "";
          const isOnLoginPage =
            currentUrl.includes("login") ||
            currentUrl.includes("microsoftonline.com") ||
            currentUrl.includes("accounts.sap.com");

          const isOnTargetPage = isTeamsAuth
            ? TokenExtractor.isTeamsUrl(currentUrl) && !isOnLoginPage
            : currentUrl.includes(this.SAP_DOMAIN) && !isOnLoginPage;

          logger.debug(`After 3s wait check`, {
            currentUrl,
            isOnTargetPage,
            isOnLoginPage,
          });

          if (isOnTargetPage) {
            console.log("🎉 Confirmed on target page! Capturing session...");
            const captured = await this.captureAuthenticatedSession();
            if (captured) {
              return true;
            } else {
              console.log(
                "⚠️ Session capture returned false, will retry SSO...",
              );
            }
          } else {
            console.log(
              `   ⚠️ Redirected back to SSO page after attempt ${ssoAttempt}`,
            );
            if (ssoAttempt < MAX_SSO_RETRIES) {
              console.log(
                `   🔄 Will retry SSO (attempt ${ssoAttempt + 1}/${MAX_SSO_RETRIES})...`,
              );
              // Small delay before retry
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
        } else {
          console.log(
            `❌ SSO Attempt ${ssoAttempt} FAILED: Headless email clicking failed`,
          );
          // If clicking failed, no point retrying - go to visible mode
          break;
        }
      } catch (error) {
        console.error(`❌ SSO Attempt ${ssoAttempt} error:`, error);
        if (ssoAttempt === MAX_SSO_RETRIES) {
          break;
        }
      }
    }

    // All retries exhausted or failed, fallback to visible mode
    console.log(
      `\n📋 All ${MAX_SSO_RETRIES} SSO attempts exhausted, falling back to visible browser`,
    );
    return await this.fallbackToFullVisible();
  }

  /**
   * Phase 1: Attempt headless email account clicking
   */
  private async attemptHeadlessEmailClick(): Promise<{
    clicked: boolean;
    needsUserInteraction: boolean;
  }> {
    if (!this.page) return { clicked: false, needsUserInteraction: false };

    // Check if we should force manual fallback for testing
    if (this.FORCE_MANUAL_FALLBACK) {
      console.log(
        "🔧 FORCE_MANUAL_FALLBACK enabled - skipping all automation attempts",
      );
      console.log("   ⚠️ Simulating complete automation failure for testing");
      console.log("   ❌ No email input field detection");
      console.log("   ❌ No account selection detection");
      console.log(
        "   🔄 Will trigger fallback to visible browser with manual completion",
      );
      return { clicked: false, needsUserInteraction: true };
    }

    try {
      console.log("🤖 Attempting headless email account selection...");

      // Navigate to SAP system (will redirect to Microsoft SSO)
      console.log(`   🌐 Navigating to ${this.ENTRY_URL}...`);
      await this.page.goto(this.ENTRY_URL, {
        waitUntil: "networkidle2",
        timeout: 45000,
      });

      await new Promise((resolve) => setTimeout(resolve, 3000));
      const currentUrl = this.page.url();
      console.log(`   📍 Current URL: ${currentUrl.substring(0, 80)}...`);

      // Check if we're on Microsoft login page
      if (!currentUrl.includes("microsoftonline.com")) {
        if (currentUrl.includes(this.SAP_DOMAIN)) {
          console.log("   ✅ Already authenticated! No email clicking needed.");
          return { clicked: true, needsUserInteraction: false };
        } else {
          console.log("   ❌ Unexpected page, not Microsoft SSO");
          return { clicked: false, needsUserInteraction: true };
        }
      }

      // Look for email account elements or email input field
      console.log(
        "   🔍 Searching for email account elements or email input field...",
      );

      // First, check if there's an email input field
      const emailInput = await this.page.$('input[type="email"]');
      if (emailInput) {
        // If we started in headless mode (VISIBLE_MODE=false) and detected email input,
        // switch to visible mode for complete authentication flow
        if (!this.VISIBLE_MODE) {
          console.log("   📧 Email input field detected in headless mode");
          console.log(
            "   🔄 Switching to visible mode for complete authentication flow",
          );
          console.log(
            "   📝 This ensures user can see email input, submit, and any 2FA prompts",
          );

          // Switch to visible mode and continue authentication there
          return await this.switchToVisibleModeForEmailAuth();
        } else {
          // Already in visible mode, handle normally
          console.log("   📧 Found email input field, will fill and submit...");
          return await this.handleEmailInputField(emailInput);
        }
      }

      let accountElement = null;
      let usedSelector = "";

      if (this.USER_EMAIL) {
        // If environment variable is set, look for specific email
        console.log(`   🎯 Looking for specific email: ${this.USER_EMAIL}`);
        const specificSelectors = [
          `div[data-test-id*="${this.USER_EMAIL}"]`,
          `div[title*="${this.USER_EMAIL}"]`,
          `button[data-test-id*="${this.USER_EMAIL}"]`,
        ];

        for (const selector of specificSelectors) {
          try {
            const elements = await this.page.$$(selector);
            for (const element of elements) {
              const text = await element.evaluate((el) => el.textContent || "");
              if (text.includes(this.USER_EMAIL)) {
                accountElement = element;
                usedSelector = selector;
                console.log(
                  `   ✅ Found target email with selector: ${selector}`,
                );
                console.log(`   📝 Element text: ${text.substring(0, 60)}...`);
                break;
              }
            }
            if (accountElement) break;
          } catch (e) {
            // Continue to next selector
          }
        }
      } else {
        // If no environment variable, auto-select first available account
        console.log(
          "   🔄 No SAP_AUTH_ACCOUNT set, auto-selecting first available account...",
        );
        const generalSelectors = [
          ".table-row",
          '[data-test-id*="@"]',
          'div[title*="@"]',
          'button[data-test-id*="@"]',
          ".ms-List-cell",
          ".ms-Persona-primaryText",
        ];

        for (const selector of generalSelectors) {
          try {
            const elements = await this.page.$$(selector);
            for (const element of elements) {
              const text = await element.evaluate((el) => el.textContent || "");
              // Look for email-like patterns
              if (
                text.includes("@") &&
                (text.includes("sap.com") || text.includes(".com"))
              ) {
                accountElement = element;
                usedSelector = selector;
                console.log(
                  `   ✅ Auto-selected first account with selector: ${selector}`,
                );
                console.log(`   📝 Element text: ${text.substring(0, 60)}...`);
                break;
              }
            }
            if (accountElement) break;
          } catch (e) {
            // Continue to next selector
          }
        }
      }

      if (!accountElement) {
        if (this.USER_EMAIL) {
          console.log(
            `   ❌ Specific email account (${this.USER_EMAIL}) not found in headless mode`,
          );
        } else {
          console.log(
            "   ❌ No available email accounts found for auto-selection in headless mode",
          );
        }
        console.log("   🔄 Will fallback to non-headless authentication mode");
        return { clicked: false, needsUserInteraction: true };
      }

      // Click the email account
      console.log("   🖱️  Clicking email account in headless mode...");
      await this.page.evaluate((el) => el.scrollIntoView(), accountElement);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await accountElement.click();
      console.log("   ✅ Email account clicked successfully");

      // Wait for response and check what happens next
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const newUrl = this.page.url();
      console.log(`   📍 After click URL: ${newUrl.substring(0, 80)}...`);

      // Analyze the post-click state
      const isTeamsAuth = TokenExtractor.isTeamsUrl(this.ENTRY_URL);
      const reachedTarget = isTeamsAuth
        ? TokenExtractor.isTeamsUrl(newUrl) && !newUrl.includes("login")
        : newUrl.includes(this.SAP_DOMAIN) && !newUrl.includes("login");

      if (reachedTarget) {
        // Wait 3 seconds to confirm no SSO redirect (Teams SSO sometimes has double redirects)
        console.log(
          isTeamsAuth
            ? "   🔷 Detected Teams URL, waiting 3s to confirm no SSO redirect..."
            : "   🔷 Detected target URL, waiting 3s to confirm no SSO redirect...",
        );
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const confirmedUrl = this.page.url();
        const stillOnTarget = isTeamsAuth
          ? TokenExtractor.isTeamsUrl(confirmedUrl) &&
            !confirmedUrl.includes("login") &&
            !confirmedUrl.includes("microsoftonline.com")
          : confirmedUrl.includes(this.SAP_DOMAIN) &&
            !confirmedUrl.includes("login") &&
            !confirmedUrl.includes("microsoftonline.com");

        if (stillOnTarget) {
          console.log(
            isTeamsAuth
              ? "   🎉 Complete success: Reached Microsoft Teams directly!"
              : "   🎉 Complete success: Reached SAP system directly!",
          );
          return { clicked: true, needsUserInteraction: false };
        } else {
          console.log(
            "   ⚠️ SSO redirect detected after initial target URL, need user interaction",
          );
          return { clicked: true, needsUserInteraction: true };
        }
      } else if (
        newUrl.includes("microsoftonline.com") ||
        newUrl.includes("accounts.sap.com")
      ) {
        console.log(
          "   ⚠️  Email clicked, but additional authentication required",
        );

        // Check for common authentication prompts
        const pageContent = await this.page.evaluate(
          () => document.body.textContent || "",
        );
        const needsInteraction =
          pageContent.includes("code") ||
          pageContent.includes("verify") ||
          pageContent.includes("certificate") ||
          pageContent.includes("Authenticator") ||
          pageContent.includes("Choose a certificate") ||
          pageContent.length < 500; // Likely needs user interaction if very short

        if (needsInteraction) {
          console.log(
            "   🔐 Detected MFA/Certificate prompt - user interaction needed",
          );
          return { clicked: true, needsUserInteraction: true };
        } else {
          // Try to handle automatic prompts (like "Stay signed in")
          await this.handleAutomaticPrompts();
          await new Promise((resolve) => setTimeout(resolve, 3000));

          const finalUrl = this.page.url();
          const reachedFinalTarget = isTeamsAuth
            ? TokenExtractor.isTeamsUrl(finalUrl) && !finalUrl.includes("login")
            : finalUrl.includes(this.SAP_DOMAIN);

          if (reachedFinalTarget) {
            // Wait additional 3 seconds to confirm no SSO redirect
            console.log("   🔷 Target URL reached, waiting 3s to confirm...");
            await new Promise((resolve) => setTimeout(resolve, 3000));

            const confirmedFinalUrl = this.page.url();
            const stillOnFinalTarget = isTeamsAuth
              ? TokenExtractor.isTeamsUrl(confirmedFinalUrl) &&
                !confirmedFinalUrl.includes("login") &&
                !confirmedFinalUrl.includes("microsoftonline.com")
              : confirmedFinalUrl.includes(this.SAP_DOMAIN) &&
                !confirmedFinalUrl.includes("login");

            if (stillOnFinalTarget) {
              console.log("   ✅ Automatic prompt handling successful!");
              return { clicked: true, needsUserInteraction: false };
            } else {
              console.log("   ⚠️ SSO redirect detected, need user interaction");
              return { clicked: true, needsUserInteraction: true };
            }
          } else {
            return { clicked: true, needsUserInteraction: true };
          }
        }
      } else {
        console.log("   ⚠️  Unexpected redirect after email click");
        return { clicked: true, needsUserInteraction: true };
      }
    } catch (error) {
      console.log(
        `   ❌ Headless email clicking failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      return { clicked: false, needsUserInteraction: true };
    }
  }

  /**
   * Handle email input field - fill email and submit
   */
  private async handleEmailInputField(
    emailInput: any,
  ): Promise<{ clicked: boolean; needsUserInteraction: boolean }> {
    if (!this.page) return { clicked: false, needsUserInteraction: false };

    try {
      // Determine which email to use
      const emailToUse = this.USER_EMAIL || "your.email@sap.com"; // fallback if not set
      if (!this.USER_EMAIL) {
        console.log(
          "   ⚠️ No SAP_AUTH_ACCOUNT set, using placeholder email. Please set environment variable.",
        );
        return { clicked: false, needsUserInteraction: true };
      }

      console.log(`   📧 Filling email input with: ${emailToUse}`);

      // Clear and fill the email input
      await emailInput.click();
      await emailInput.evaluate((el: HTMLInputElement) => (el.value = ""));
      await emailInput.type(emailToUse);

      // Look for submit button
      console.log("   🔍 Looking for submit button...");
      const submitButton =
        (await this.page.$('input[type="submit"]')) ||
        (await this.page.$('button[type="submit"]')) ||
        (await this.page.$('button:has-text("Next")')) ||
        (await this.page.$('button:has-text("Continue")')) ||
        (await this.page.$("#idSIButton9")); // Microsoft's "Next" button ID

      if (!submitButton) {
        console.log("   ❌ Could not find submit button");
        return { clicked: false, needsUserInteraction: true };
      }

      console.log("   🖱️ Clicking submit button...");
      await submitButton.click();

      // Wait for response
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const newUrl = this.page.url();
      console.log(`   📍 After submit URL: ${newUrl.substring(0, 80)}...`);

      // Check for Microsoft Authenticator number matching
      const authenticatorNumber = await this.checkForAuthenticatorNumber();
      if (authenticatorNumber) {
        // Since we switch to visible mode when email input is detected,
        // we should always be in visible mode when we reach 2FA
        return await this.handleAuthenticatorNumberMatching(
          authenticatorNumber,
        );
      }

      // Check other post-submit scenarios
      const isTeamsAuth = TokenExtractor.isTeamsUrl(this.ENTRY_URL);
      const reachedTarget = isTeamsAuth
        ? TokenExtractor.isTeamsUrl(newUrl) && !newUrl.includes("login")
        : newUrl.includes(this.SAP_DOMAIN) && !newUrl.includes("login");

      if (reachedTarget) {
        // Wait 3 seconds to confirm no SSO redirect (Teams SSO sometimes has double redirects)
        console.log(
          isTeamsAuth
            ? "   🔷 Detected Teams URL after submit, waiting 3s to confirm no SSO redirect..."
            : "   🔷 Detected target URL after submit, waiting 3s to confirm no SSO redirect...",
        );
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const confirmedUrl = this.page.url();
        const stillOnTarget = isTeamsAuth
          ? TokenExtractor.isTeamsUrl(confirmedUrl) &&
            !confirmedUrl.includes("login") &&
            !confirmedUrl.includes("microsoftonline.com")
          : confirmedUrl.includes(this.SAP_DOMAIN) &&
            !confirmedUrl.includes("login") &&
            !confirmedUrl.includes("microsoftonline.com");

        if (stillOnTarget) {
          console.log(
            isTeamsAuth
              ? "   🎉 Direct success after email submit! Reached Microsoft Teams."
              : "   🎉 Direct success after email submit!",
          );
          return { clicked: true, needsUserInteraction: false };
        } else {
          console.log(
            "   ⚠️ SSO redirect detected after initial target URL, need user interaction",
          );
          return { clicked: true, needsUserInteraction: true };
        }
      } else if (
        newUrl.includes("microsoftonline.com") ||
        newUrl.includes("accounts.sap.com")
      ) {
        // Check if we need user interaction
        const pageContent = await this.page.evaluate(
          () => document.body.textContent || "",
        );
        const needsInteraction =
          pageContent.includes("password") ||
          pageContent.includes("verification") ||
          pageContent.includes("authenticate") ||
          pageContent.includes("MFA") ||
          pageContent.length < 500;

        if (needsInteraction) {
          console.log("   🔐 Additional authentication steps required");
          return { clicked: true, needsUserInteraction: true };
        }
      }

      console.log("   ✅ Email submitted successfully, continuing...");
      return { clicked: true, needsUserInteraction: false };
    } catch (error) {
      console.log(
        `   ❌ Email input handling failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      return { clicked: false, needsUserInteraction: true };
    }
  }

  /**
   * Check for Microsoft Authenticator number matching display
   */
  private async checkForAuthenticatorNumber(): Promise<string | null> {
    if (!this.page) return null;

    try {
      // Wait a bit for the page to fully load
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Look for the specific ID mentioned
      const numberElement = await this.page.$("#idRemoteNGC_DisplaySign");
      if (numberElement) {
        const numberText = await numberElement.evaluate(
          (el) => el.textContent?.trim() || "",
        );
        if (numberText && /^\d+$/.test(numberText)) {
          console.log(`   🔢 Found Authenticator number: ${numberText}`);
          return numberText;
        }
      }

      // Also check for other common selectors for authenticator numbers
      const alternativeSelectors = [
        ".ms-TextField-field",
        ".ms-Label",
        '[data-testid*="number"]',
        ".number-display",
        ".auth-number",
      ];

      for (const selector of alternativeSelectors) {
        try {
          const elements = await this.page.$$(selector);
          for (const element of elements) {
            const text = await element.evaluate(
              (el) => el.textContent?.trim() || "",
            );
            if (text && /^\d{2,3}$/.test(text)) {
              // 2-3 digit numbers are typical for MS Authenticator
              console.log(
                `   🔢 Found potential Authenticator number with ${selector}: ${text}`,
              );
              return text;
            }
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      return null;
    } catch (error) {
      console.log(
        `   ⚠️ Error checking for authenticator number: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      return null;
    }
  }

  /**
   * Handle Microsoft Authenticator number matching flow
   */
  private async handleAuthenticatorNumberMatching(
    number: string,
  ): Promise<{ clicked: boolean; needsUserInteraction: boolean }> {
    if (!this.page) return { clicked: false, needsUserInteraction: false };

    try {
      // Determine the service name from the URL for user guidance
      const currentUrl = this.page.url();
      let serviceName = "SAP system";
      if (currentUrl.includes("jira")) serviceName = "Jira";
      else if (currentUrl.includes("wiki")) serviceName = "Wiki";
      else if (currentUrl.includes("confluence")) serviceName = "Confluence";

      console.log("   🔐 Microsoft Authenticator Number Matching Required");
      console.log("   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`   📱 PLEASE OPEN Microsoft Authenticator App`);
      console.log(
        `   🎯 Find the ${serviceName} account in your Authenticator`,
      );
      console.log(`   🔢 Enter this number: ${number}`);
      console.log("   ⏱️ You have 1 minute to complete this step");
      console.log("   🔄 The browser will refresh automatically when approved");
      console.log("   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      // Wait for up to 1 minute for the user to approve in Authenticator app
      const startTime = Date.now();
      const timeoutMs = 60000; // 1 minute
      let attempts = 0;
      const maxAttempts = 20; // Check every 3 seconds

      while (attempts < maxAttempts) {
        const elapsed = Date.now() - startTime;
        if (elapsed > timeoutMs) {
          console.log(
            "   ⏰ Authenticator approval timeout (1 minute exceeded)",
          );
          console.log("   🔄 Falling back to manual authentication...");
          return { clicked: true, needsUserInteraction: true };
        }

        await new Promise((resolve) => setTimeout(resolve, 3000));
        attempts++;

        // Check if page has changed/refreshed (indicating approval)
        try {
          const newUrl = this.page.url();

          // Check if we've progressed past the authenticator page
          if (
            newUrl !== currentUrl ||
            !(await this.page.$("#idRemoteNGC_DisplaySign")) ||
            newUrl.includes(this.SAP_DOMAIN)
          ) {
            console.log(
              "   ✅ Authenticator approval detected! Page refreshed.",
            );

            // Give a moment for the page to fully load
            await new Promise((resolve) => setTimeout(resolve, 2000));

            const finalUrl = this.page.url();
            if (finalUrl.includes(this.SAP_DOMAIN)) {
              console.log(
                "   🎉 Successfully reached SAP system after Authenticator approval!",
              );
              return { clicked: true, needsUserInteraction: false };
            } else {
              console.log(
                "   🔄 Authenticator approved, but additional steps may be needed",
              );
              return { clicked: true, needsUserInteraction: true };
            }
          }

          // Show progress every 15 seconds
          if (attempts % 5 === 0) {
            const remainingSeconds = Math.ceil((timeoutMs - elapsed) / 1000);
            console.log(
              `   ⏳ Waiting for Authenticator approval... ${remainingSeconds}s remaining`,
            );
          }
        } catch (error) {
          console.log(
            `   ⚠️ Error checking approval status: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
          // Continue waiting
        }
      }

      console.log("   ⏰ Timeout waiting for Authenticator approval");
      return { clicked: true, needsUserInteraction: true };
    } catch (error) {
      console.log(
        `   ❌ Authenticator number matching failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      return { clicked: true, needsUserInteraction: true };
    }
  }

  /**
   * Handle automatic prompts that don't need user interaction
   */
  private async handleAutomaticPrompts(): Promise<void> {
    if (!this.page) return;

    try {
      console.log(
        "   🤖 Checking for automatic prompts (Stay signed in, etc.)...",
      );

      const automaticSelectors = [
        "#idSIButton9", // Stay signed in - Yes
        'input[value="Yes"]',
        'button:has-text("Yes")',
        'input[value="Accept"]',
        'button:has-text("Accept")',
      ];

      for (const selector of automaticSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            const text = await element.evaluate(
              (el) => el.textContent || (el as HTMLInputElement).value || "",
            );
            console.log(`   🖱️  Auto-clicking: ${selector} ("${text}")`);
            await element.click();
            await new Promise((resolve) => setTimeout(resolve, 2000));
            return; // Only click the first found element
          }
        } catch (e) {
          // Continue
        }
      }

      console.log("   ℹ️  No automatic prompts found");
    } catch (error) {
      console.log(
        "   ⚠️  Error handling automatic prompts:",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }

  /**
   * Switch to visible mode for email authentication - start fresh visible session
   */
  private async switchToVisibleModeForEmailAuth(): Promise<{
    clicked: boolean;
    needsUserInteraction: boolean;
  }> {
    console.log("🔄 Switching to visible mode for email authentication...");

    try {
      // Switch to visible browser using unified method
      await this.launchBrowser(false); // false = visible mode

      console.log("   ✅ Visible browser ready");
      console.log(
        "   👁️ You can now watch the complete authentication process",
      );
      console.log(
        "   🤖 Running automated email input and authentication in visible mode...",
      );

      // Navigate to the entry URL and handle email authentication in visible mode
      console.log(`   🌐 Navigating to ${this.ENTRY_URL} in visible mode...`);
      await this.page!.goto(this.ENTRY_URL, {
        waitUntil: "networkidle2",
        timeout: 45000,
      });

      await new Promise((resolve) => setTimeout(resolve, 3000));
      const currentUrl = this.page!.url();
      console.log(`   📍 Current URL: ${currentUrl.substring(0, 80)}...`);

      // Now handle email input in visible mode
      const emailInput = await this.page!.$('input[type="email"]');
      if (emailInput) {
        console.log(
          "   📧 Found email input field in visible mode, will fill and submit...",
        );
        const automationResult = await this.handleEmailInputField(emailInput);

        if (
          automationResult.clicked &&
          !automationResult.needsUserInteraction
        ) {
          console.log("   ✅ Complete visible mode authentication successful!");
          return { clicked: true, needsUserInteraction: false };
        } else if (
          automationResult.clicked &&
          automationResult.needsUserInteraction
        ) {
          console.log(
            "   ⚠️ Email submitted, waiting for user to complete 2FA or other steps...",
          );
          // Wait for user to complete authentication
          const success = await this.waitForAuthenticationCompletion();
          return { clicked: true, needsUserInteraction: !success };
        } else {
          console.log("   ❌ Email input handling failed in visible mode");
          return { clicked: false, needsUserInteraction: true };
        }
      } else {
        // No email input found, maybe we have account selection instead
        console.log(
          "   🔄 No email input found, trying account selection in visible mode...",
        );
        const automationResult = await this.attemptHeadlessEmailClick();

        if (
          automationResult.clicked &&
          !automationResult.needsUserInteraction
        ) {
          console.log("   ✅ Complete visible mode authentication successful!");
          return { clicked: true, needsUserInteraction: false };
        } else if (
          automationResult.clicked &&
          automationResult.needsUserInteraction
        ) {
          console.log(
            "   ⚠️ Automation partially successful, user interaction needed",
          );
          console.log(
            "   👤 Please complete any remaining steps in the visible browser...",
          );
          const success = await this.waitForAuthenticationCompletion();
          return { clicked: true, needsUserInteraction: !success };
        } else {
          console.log("   ❌ Automation failed in visible mode");
          console.log(
            "   👤 Please complete authentication manually in the visible browser...",
          );
          const success = await this.waitForAuthenticationCompletion();
          return { clicked: true, needsUserInteraction: !success };
        }
      }
    } catch (error) {
      console.error(
        "❌ Error switching to visible mode for email auth:",
        error,
      );
      return { clicked: false, needsUserInteraction: true };
    }
  }

  /**
   * Switch to visible mode specifically for 2FA - preserve authentication state
   */
  private async switchToVisibleModeFor2FA(
    authenticatorNumber: string,
  ): Promise<{ clicked: boolean; needsUserInteraction: boolean }> {
    console.log("🔄 Switching to visible mode for 2FA completion...");

    try {
      // Get current state before switching
      const currentUrl = this.page?.url() || "";
      const currentCookies = this.page ? await this.page.cookies() : [];

      // Determine service name for user guidance
      let serviceName = "SAP system";
      if (currentUrl.includes("jira")) serviceName = "Jira";
      else if (currentUrl.includes("wiki")) serviceName = "Wiki";
      else if (currentUrl.includes("confluence")) serviceName = "Confluence";

      console.log("   📱 2FA Information:");
      console.log(`   🔢 Authenticator Number: ${authenticatorNumber}`);
      console.log(`   🎯 Service: ${serviceName}`);
      console.log("   🔄 Opening visible browser for user interaction...");

      // Switch to visible browser using unified method
      await this.launchBrowser(false); // false = visible mode

      // Restore cookies and navigate to current state
      if (currentCookies.length > 0) {
        await this.page!.setCookie(...currentCookies);
        console.log(
          `   🍪 Restored ${currentCookies.length} cookies to visible browser`,
        );
      }

      if (currentUrl) {
        console.log(
          "   🌐 Restoring 2FA authentication state in visible browser...",
        );
        await this.page!.goto(currentUrl, {
          waitUntil: "networkidle2",
          timeout: 30000,
        });
      }

      console.log("   ✅ Visible browser ready for 2FA completion");
      console.log("   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`   📱 PLEASE OPEN Microsoft Authenticator App`);
      console.log(
        `   🎯 Find the ${serviceName} account in your Authenticator`,
      );
      console.log(`   🔢 Enter this number: ${authenticatorNumber}`);
      console.log("   👁️ You can see the number in the visible browser window");
      console.log("   ⏱️ Complete this step to finish authentication");
      console.log("   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      // Wait for user to complete authentication in visible browser
      const success = await this.waitForAuthenticationCompletion();

      if (success) {
        console.log("   ✅ 2FA completed successfully in visible mode!");
        return { clicked: true, needsUserInteraction: false };
      } else {
        console.log("   ⏰ 2FA completion timeout or failed");
        return { clicked: true, needsUserInteraction: true };
      }
    } catch (error) {
      console.error("❌ Error switching to visible mode for 2FA:", error);
      return { clicked: false, needsUserInteraction: true };
    }
  }

  /**
   * Phase 2: Switch to visible browser for completion
   */
  private async switchToVisibleForCompletion(): Promise<boolean> {
    console.log("🔄 Switching to visible browser for user interaction...");

    try {
      // Save current state
      const currentUrl = this.page?.url() || "";
      const currentCookies = this.page ? await this.page.cookies() : [];

      // Switch to visible browser using unified method
      await this.launchBrowser(false); // false = visible mode

      // Restore cookies and state
      if (currentCookies.length > 0) {
        await this.page!.setCookie(...currentCookies);
        console.log(
          `   🍪 Restored ${currentCookies.length} cookies to visible browser`,
        );
      }

      // Navigate to current state
      if (currentUrl) {
        console.log(
          "   🌐 Restoring authentication state in visible browser...",
        );
        await this.page!.goto(currentUrl, {
          waitUntil: "networkidle2",
          timeout: 30000,
        });
      } else {
        await this.page!.goto(`https://${this.SAP_DOMAIN}/`, {
          waitUntil: "networkidle2",
          timeout: 30000,
        });
      }

      console.log("   ✅ Visible browser ready for user interaction");
      console.log(
        "   👤 Please complete any remaining authentication steps...",
      );

      // Wait for user to complete authentication
      return await this.waitForAuthenticationCompletion();
    } catch (error) {
      console.error("❌ Error switching to visible browser:", error);
      return false;
    }
  }

  /**
   * Start visible mode authentication - runs automation in visible browser for debugging
   */
  private async startVisibleModeAuthentication(): Promise<boolean> {
    console.log("🔄 Starting visible mode authentication with automation...");

    try {
      // Use unified browser launch method
      await this.launchBrowser(false); // false = visible mode

      console.log(
        "   👁️ Visible browser ready - you can now watch the automation process",
      );
      console.log(
        "   🤖 Running automated authentication with visible browser...",
      );

      // Run the same automation logic but in visible browser
      const automationResult = await this.attemptHeadlessEmailClick();

      if (automationResult.clicked && !automationResult.needsUserInteraction) {
        console.log("   ✅ Visible mode automation completed successfully!");
        const captured = await this.captureAuthenticatedSession();
        if (!captured) {
          // Not actually on target page, wait for user to complete
          console.log(
            "⚠️ Session capture failed, waiting for authentication completion...",
          );
          return await this.waitForAuthenticationCompletion();
        }
        return captured;
      } else if (
        automationResult.clicked &&
        automationResult.needsUserInteraction
      ) {
        console.log(
          "   ⚠️ Automation partially successful, user interaction needed",
        );
        console.log(
          "   👤 Please complete any remaining steps manually in the visible browser...",
        );
        return await this.waitForAuthenticationCompletion();
      } else {
        console.log(
          "   ❌ Automation failed, please complete authentication manually",
        );
        console.log(
          "   👤 Please complete authentication manually in the visible browser...",
        );
        // Navigate to entry URL for manual completion
        await this.page!.goto(this.ENTRY_URL, {
          waitUntil: "networkidle2",
          timeout: 60000,
        });
        return await this.waitForAuthenticationCompletion();
      }
    } catch (error) {
      console.error("❌ Visible mode authentication failed:", error);
      return false;
    }
  }

  /**
   * Phase 2 Alternative: Fallback to full visible authentication
   */
  private async fallbackToFullVisible(): Promise<boolean> {
    console.log("🔄 Falling back to full visible browser authentication...");

    try {
      // Use unified browser launch method
      await this.launchBrowser(false); // false = visible mode

      // Navigate to SAP system
      console.log("   🌐 Opening SAP system in visible browser...");
      await this.page!.goto(this.ENTRY_URL, {
        waitUntil: "networkidle2",
        timeout: 60000,
      });

      console.log(
        "   👤 Please complete authentication in the visible browser...",
      );
      return await this.waitForAuthenticationCompletion();
    } catch (error) {
      console.error("❌ Fallback to visible browser failed:", error);
      return false;
    }
  }

  /**
   * Wait for authentication completion and capture session
   */
  private async waitForAuthenticationCompletion(): Promise<boolean> {
    if (!this.page) return false;

    console.log("⏳ Waiting for authentication to complete...");
    logger.enter("waitForAuthenticationCompletion");

    // Determine if this is a Teams authentication flow
    const isTeamsAuth = TokenExtractor.isTeamsUrl(this.ENTRY_URL);
    if (isTeamsAuth) {
      console.log("   🔷 Microsoft Teams authentication flow detected");
      logger.debug("Teams authentication mode enabled");
    }

    let attempts = 0;
    const maxAttempts = 72; // 6 minutes total (5-second intervals)

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      attempts++;

      // Check if page is still available
      if (!this.page) {
        console.log("⚠️ Page reference lost during authentication wait");
        logger.warn("Page reference lost during authentication wait");
        return false;
      }

      const currentUrl = this.page.url();

      if (attempts % 6 === 0) {
        // Every 30 seconds
        console.log(
          `   ⏳ Check ${attempts}/${maxAttempts} (${Math.round((attempts * 5) / 60)} min) - URL: ${currentUrl.substring(0, 60)}...`,
        );
        logger.debug("Authentication check", {
          attempts,
          maxAttempts,
          currentUrl,
        });
      }

      // Check if authentication is complete
      const isLoginPage =
        currentUrl.includes("login") ||
        currentUrl.includes("auth") ||
        currentUrl.includes("microsoftonline.com") ||
        currentUrl.includes("accounts.sap.com");

      if (isTeamsAuth) {
        // For Teams, check if we've reached any valid Teams URL (not login)
        if (TokenExtractor.isTeamsUrl(currentUrl) && !isLoginPage) {
          // Teams SSO sometimes has a second redirect back to SSO page
          // Wait 3 seconds and verify we're still on Teams
          console.log(
            "   🔷 Detected Teams URL, waiting 3s to confirm no SSO redirect...",
          );
          logger.debug("Teams URL detected, waiting for confirmation", {
            url: currentUrl,
          });
          await new Promise((resolve) => setTimeout(resolve, 3000));

          const confirmedUrl = this.page.url();
          const stillOnTarget =
            TokenExtractor.isTeamsUrl(confirmedUrl) &&
            !confirmedUrl.includes("login") &&
            !confirmedUrl.includes("microsoftonline.com");

          if (stillOnTarget) {
            console.log(
              "✅ Authentication completed! Reached Microsoft Teams.",
            );
            logger.auth("Teams authentication completed", {
              url: confirmedUrl,
            });
            return await this.captureAuthenticatedSession();
          } else {
            console.log("   ⚠️ SSO redirect detected, continuing to wait...");
            logger.debug("SSO redirect detected after Teams URL", {
              originalUrl: currentUrl,
              newUrl: confirmedUrl,
            });
            // Continue waiting loop
          }
        }
      } else {
        // For SAP systems, check if we've reached the SAP domain
        if (currentUrl.includes(this.SAP_DOMAIN) && !isLoginPage) {
          // Wait 3 seconds and verify we're still on target (in case of redirect)
          console.log(
            "   🔷 Detected SAP URL, waiting 3s to confirm no SSO redirect...",
          );
          await new Promise((resolve) => setTimeout(resolve, 3000));

          const confirmedUrl = this.page.url();
          const stillOnTarget =
            confirmedUrl.includes(this.SAP_DOMAIN) &&
            !confirmedUrl.includes("login") &&
            !confirmedUrl.includes("microsoftonline.com");

          if (stillOnTarget) {
            console.log("✅ Authentication completed! Reached SAP system.");
            logger.auth("SAP authentication completed", { url: confirmedUrl });
            return await this.captureAuthenticatedSession();
          } else {
            console.log("   ⚠️ SSO redirect detected, continuing to wait...");
            // Continue waiting loop
          }
        }
      }
    }

    console.log("⏰ Authentication timeout after 6 minutes");
    logger.warn("Authentication timeout after 6 minutes");
    return false;
  }

  /**
   * Capture authenticated session and cookies
   */
  private async captureAuthenticatedSession(): Promise<boolean> {
    if (!this.page) return false;
    logger.separator("Capturing Authenticated Session");
    logger.enter("captureAuthenticatedSession");

    try {
      // Wait for page to stabilize (Teams does multiple internal navigations)
      console.log("⏳ Waiting for page to stabilize...");
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Wait for network to be idle
      try {
        await this.page.waitForNetworkIdle({ timeout: 10000 });
      } catch (e) {
        console.log("⚠️ Network idle timeout, continuing anyway...");
      }

      const url = this.page.url();
      let title = "Unknown";
      try {
        title = await this.page.title();
      } catch (e) {
        console.log("⚠️ Could not get page title, continuing...");
      }

      // CRITICAL: Verify we're actually on the target page, not still on SSO
      const isTeamsAuth = TokenExtractor.isTeamsUrl(this.ENTRY_URL);
      const isOnLoginPage =
        url.includes("login") ||
        url.includes("microsoftonline.com") ||
        url.includes("accounts.sap.com") ||
        url.includes("auth");

      const isOnTargetPage = isTeamsAuth
        ? TokenExtractor.isTeamsUrl(url) && !isOnLoginPage
        : url.includes(this.SAP_DOMAIN) && !isOnLoginPage;

      if (!isOnTargetPage) {
        console.log(`⚠️ Not on target page yet, still on login/SSO page`);
        console.log(`   Current URL: ${url}`);
        console.log(`   Title: ${title}`);
        logger.warn(
          "captureAuthenticatedSession called but not on target page",
          { url, title, isTeamsAuth },
        );
        return false;
      }

      console.log(`📊 Authenticated session captured:`);
      console.log(`   Title: ${title}`);
      console.log(`   URL: ${url}`);
      logger.auth("Session captured", { title, url });

      // Get cookies from authenticated session
      // For Teams, we need to get cookies from multiple domains
      let cookies: any[] = [];
      if (
        TokenExtractor.isTeamsUrl(url) ||
        TokenExtractor.isTeamsUrl(this.ENTRY_URL)
      ) {
        // Teams stores auth tokens in various domains
        const teamsDomains = [
          "https://teams.microsoft.com",
          "https://teams.cloud.microsoft",
          "https://teams.live.com",
          "https://teams.office.com",
          "https://login.microsoftonline.com",
          "https://login.live.com",
          "https://*.microsoft.com",
          "https://*.office.com",
          "https://*.teams.microsoft.com",
        ];

        // Get cookies from all Teams-related domains
        for (const domain of teamsDomains) {
          try {
            const domainCookies = await this.page.cookies(domain);
            cookies = cookies.concat(domainCookies);
          } catch (e) {
            // Some domains may not have cookies, ignore
          }
        }

        // Also get current page cookies
        const pageCookies = await this.page.cookies();
        cookies = cookies.concat(pageCookies);

        // Remove duplicates by name+domain
        const seen = new Set<string>();
        cookies = cookies.filter((c) => {
          const key = `${c.name}:${c.domain}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      } else {
        cookies = await this.page.cookies();
      }

      console.log(
        `🍪 Retrieved ${cookies.length} cookies from authenticated session`,
      );
      logger.cookie("Retrieved cookies", {
        count: cookies.length,
        domains: [...new Set(cookies.map((c: any) => c.domain))],
      });

      // Save cookies to specified store path (required for MCP integration)
      await this.cookieStore.saveCookies(cookies, this.SAP_DOMAIN);
      if (this.IN_PRIVATE) {
        console.log(
          "💾 Cookies saved to storage (private mode - saved to specified MCP path)",
        );
      } else {
        console.log("💾 Cookies saved to storage");
      }

      // For Microsoft Teams URLs, also extract Graph API tokens from localStorage
      if (
        TokenExtractor.isTeamsUrl(url) ||
        TokenExtractor.isTeamsUrl(this.ENTRY_URL)
      ) {
        console.log(
          "🔑 Microsoft Teams detected, extracting Graph API tokens...",
        );
        await this.extractAndSaveGraphTokens();
      }

      // Completely close browser after authentication
      console.log("🔄 Closing browser completely after authentication...");
      await this.safeBrowserClose();

      if (this.IN_PRIVATE) {
        console.log(
          "✅ Private mode: Authentication completed, cookies saved for MCP integration, browser closed",
        );
      } else {
        console.log(
          "✅ Authentication completed, cookies saved, browser closed completely",
        );
      }

      return true;
    } catch (error) {
      console.error("❌ Error capturing authenticated session:", error);
      return false;
    }
  }

  /**
   * Make authenticated HTTP requests using the browser session
   */
  async makeAuthenticatedRequest(url: string, options: any = {}): Promise<any> {
    // Initialize browser if not already running (since authentication closes it)
    if (!this.browser || !this.page) {
      console.log("🔄 Browser not running, initializing for API request...");
      await this.initialize();

      if (!this.page) {
        throw new Error(
          "Failed to initialize browser for authenticated request",
        );
      }
    }

    try {
      console.log("Making authenticated HTTP request...");

      // Ensure we're on the SAP domain first for same-origin requests
      const currentUrl = this.page.url();
      console.log(`Current page URL: ${currentUrl}`);

      // Always navigate to SAP domain for consistent state
      console.log("Navigating to SAP domain for same-origin API request...");
      await this.page.goto(`https://${this.SAP_DOMAIN}/`, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
      // Wait a moment for page to fully load
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check final URL
      const finalUrl = this.page.url();
      console.log(`Final page URL: ${finalUrl}`);

      // If we're redirected to Microsoft SSO, we need authentication
      if (
        finalUrl.includes("microsoftonline.com") ||
        finalUrl.includes("accounts.sap.com")
      ) {
        console.log("Detected SSO redirect, authentication may be needed");
        throw new Error(
          "Authentication required - please run hybrid authentication first",
        );
      }

      // Use evaluate to make HTTP request with proper headers
      const response = await this.page.evaluate(
        async (requestUrl, requestOptions) => {
          const fetchOptions = {
            method: requestOptions.method || "GET",
            credentials: "include" as RequestCredentials,
            headers: {
              accept: "*/*",
              "accept-language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
              "cache-control": "no-cache, no-store, must-revalidate",
              dnt: "1",
              expires: "0",
              pragma: "no-cache",
              priority: "u=1, i",
              referer: window.location.href,
              "sec-ch-ua":
                '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
              "sec-ch-ua-mobile": "?0",
              "sec-ch-ua-platform": this.SEC_CH_PLATFORM,
              "sec-fetch-dest": "empty",
              "sec-fetch-mode": "cors",
              "sec-fetch-site": "same-origin",
              "user-agent": this.DYNAMIC_USER_AGENT,
              ...requestOptions.headers,
            },
          };

          if (requestOptions.body) {
            (fetchOptions as any).body = JSON.stringify(requestOptions.body);
            fetchOptions.headers["content-type"] = "application/json";
          }

          const response = await fetch(requestUrl, fetchOptions);
          return {
            status: response.status,
            ok: response.ok,
            text: await response.text(),
            headers: Object.fromEntries(response.headers.entries()),
          };
        },
        url,
        options,
      );

      if (!response) {
        throw new Error("No response received from API");
      }

      const status = response.status;
      console.log(`API HTTP response status: ${status}`);

      if (status === 401) {
        throw new Error("Authentication failed - HTTP 401");
      }

      if (!response.ok) {
        console.error(
          `HTTP ${status} response text:`,
          response.text.substring(0, 500),
        );
        throw new Error(`HTTP ${status}: Request failed`);
      }

      const responseText = response.text;
      if (!responseText || responseText.trim() === "") {
        throw new Error("Empty response from API");
      }

      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error(
          "Failed to parse JSON response:",
          responseText.substring(0, 500),
        );
        throw new Error(
          `Invalid JSON response from API: ${parseError instanceof Error ? parseError.message : "Unknown parse error"}`,
        );
      }

      console.log(`Request completed successfully`);

      // Close browser after API request to prevent instance accumulation
      console.log("🔄 Closing browser after API request...");
      await this.safeBrowserClose();

      return result;
    } catch (error) {
      console.error("Authenticated request failed:", error);

      // Also close browser on error to prevent instance accumulation
      console.log("🔄 Closing browser after API request error...");
      await this.safeBrowserClose();

      throw error;
    }
  }

  async close(): Promise<void> {
    await this.safeBrowserClose();
  }

  async getCookieStorageInfo(): Promise<any> {
    return await this.cookieStore.getStorageInfo();
  }

  async clearStoredCookies(): Promise<void> {
    await this.cookieStore.clearCookies();
  }

  /**
   * Clean up any lingering Chrome processes - can be called externally
   */
  async cleanupChromeProcesses(): Promise<void> {
    console.log(
      "🧹 Manual cleanup: searching for lingering Chrome processes...",
    );
    await this.killRemainingChromeProcesses();
    console.log("✅ Manual cleanup completed");
  }

  private async loadStoredCookies(): Promise<void> {
    if (!this.page) return;

    try {
      const storedCookies = await this.cookieStore.loadCookies();

      if (storedCookies && storedCookies.length > 0) {
        const puppeteerCookies =
          this.cookieStore.convertToPuppeteerFormat(storedCookies);
        await this.page.setCookie(...puppeteerCookies);
        // this.cookies = puppeteerCookies;
        console.log(`Loaded ${storedCookies.length} stored cookies`);
      } else {
        console.log(
          "No valid stored cookies found, will need fresh authentication",
        );
      }
    } catch (error) {
      console.error("Failed to load stored cookies:", error);
    }
  }

  /**
   * Extract and save Graph API tokens from browser's localStorage
   */
  private async extractAndSaveGraphTokens(): Promise<void> {
    if (!this.page) return;

    try {
      const tokens = await TokenExtractor.extractGraphTokensFromPage(this.page);

      if (tokens.length > 0) {
        const storeDir = this.cookieStore.getStoreDirectory();
        const tokenPath = join(storeDir, "sap_tokens.json");
        await TokenExtractor.saveTokens(tokens, tokenPath);
        console.log(`✅ Graph API tokens saved to ${tokenPath}`);
      } else {
        console.log("ℹ️ No Graph API tokens found in localStorage");
      }
    } catch (error) {
      console.warn("⚠️ Failed to extract Graph API tokens:", error);
    }
  }
}
