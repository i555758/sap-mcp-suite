#!/usr/bin/env node

import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";
import { readFileSync, existsSync } from "fs";
import { spawn } from "child_process";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json to get version
const packageJsonPath = join(__dirname, "..", "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

function showHelp() {
  console.log(`
SAP Jira MCP Server v${packageJson.version}
${packageJson.description}

Usage:
  sap-jira-mcp [options]

Options:
  --help, -h           Show this help message
  --version, -v        Show version information

Examples:
  # Start the MCP server
  sap-jira-mcp

  # Use with Claude Desktop via stdio
  echo '{"method":"tools/list"}' | sap-jira-mcp

Environment Variables:
  AUTH_COOKIE_DIR      Directory to store authentication cookies

For more information:
  GitHub: https://github.com/i555758/sap-mcp-suite
  Issues: https://github.com/i555758/sap-mcp-suite/issues
`);
}

function showVersion() {
  console.log(packageJson.version);
}

async function buildProject() {
  console.error("Building TypeScript project...");

  return new Promise((resolve, reject) => {
    const buildProcess = spawn("npm", ["run", "build"], {
      cwd: join(__dirname, ".."),
      stdio: "inherit",
      shell: process.platform === "win32", // Enable shell on Windows
    });

    buildProcess.on("close", (code) => {
      if (code === 0) {
        console.error("✅ Build completed successfully");
        resolve();
      } else {
        reject(new Error(`Build failed with exit code ${code}`));
      }
    });

    buildProcess.on("error", (error) => {
      reject(new Error(`Build process error: ${error.message}`));
    });
  });
}

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    showHelp();
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    showVersion();
    process.exit(0);
  }

  // Check if the dist directory and main file exist
  const distPath = join(__dirname, "..", "dist");
  const serverPath = join(distPath, "index.js");

  if (!existsSync(serverPath)) {
    console.error("⚠️  Compiled files not found. Building project...");

    try {
      await buildProject();
    } catch (buildError) {
      console.error("❌ Auto-build failed:", buildError.message);
      console.error("\nTry running manually:");
      console.error("  npm install");
      console.error("  npm run build");
      process.exit(1);
    }
  }

  // Import and run the main server
  try {
    console.error("🚀 Starting SAP Jira MCP Server...");
    // Convert file path to file:// URL for Windows ESM compatibility
    const serverFileUrl = pathToFileURL(serverPath).href;
    await import(serverFileUrl);
  } catch (error) {
    console.error("❌ Error starting SAP Jira MCP Server:");
    console.error(error.message);

    if (error.code === "MODULE_NOT_FOUND") {
      console.error("\nThis might be a dependency issue. Try:");
      console.error("  npm install");
      console.error("  npm run build");
    }

    process.exit(1);
  }
}

// Handle unhandled rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  process.exit(1);
});

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
