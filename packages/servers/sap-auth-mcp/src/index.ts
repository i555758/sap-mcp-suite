#!/usr/bin/env node
/**
 * SAP Auth MCP Server - Entry Point
 *
 * This MCP provides manual authentication controls to Claude, allowing users to:
 * - Trigger authentication for SAP systems (wiki, jira, teams, graph)
 * - Check authentication status
 * - Clear stored credentials
 * - Make authenticated requests
 *
 * This is a thin wrapper around the shared sap-auth package.
 */
import { SAPAuthServer } from "./server.js";

const server = new SAPAuthServer();
server.run().catch(console.error);
