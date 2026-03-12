# SAP Universal Authentication MCP Server

English | [中文](./README-zh_CN.md)

A Model Context Protocol (MCP) server that provides centralized SAP authentication services for other MCP modules. This server handles complex SAP Single Sign-On (SSO) flows using automated browser authentication and provides standardized cookie management for downstream services.

> This server is part of [sap-mcp-suite](../../README.md). See the root README for installation and setup.

## Overview

The SAP Auth MCP is designed as a **shared authentication service** that other MCP modules can utilize to handle SAP authentication. Instead of each MCP implementing its own authentication logic, they can delegate this responsibility to this centralized service.

In principle, this MCP will invoke a browser and attempt to automate the authentication process. When silent mode cannot obtain valid cookies, it will automatically fallback to explicit browser manual interaction mode.

## Key Features

- **Hybrid Authentication**: Combines headless and visible browser automation for optimal user experience
- **Centralized Cookie Management**: Standardized cookie storage and sharing across MCP modules
- **Multi-Domain Support**: Handles authentication for various SAP systems (Jira, Wiki, etc.)
- **Persistent Sessions**: ~24*7 hours cookie persistence
- **Error Standardization**: Consistent error responses to guide AI clients

## Available MCP Tools

### `sap_authenticate`

Performs SAP system authentication and saves cookies to specified location.

**Parameters:**
- `entry_url` (required): The SAP system entry URL (e.g., `https://jira.tools.sap/`, `https://wiki.one.int.sap/`)
- `store_path` (required): Directory path where `sap_cookies.json` will be saved

### `sap_make_request`

Makes authenticated HTTP requests using stored session cookies.

**Parameters:**
- `url` (required): Target URL for the request
- `method` (optional): HTTP method (default: GET)
- `headers` (optional): Additional headers
- `body` (optional): Request body for POST/PUT requests

### `sap_get_cookie_info`

Retrieves information about stored authentication cookies.

**Parameters:**
- `store_path` (optional): Directory path to check (uses default if not provided)

### `sap_clear_cookies`

Clears stored authentication cookies from specified location.

**Parameters:**
- `store_path` (optional): Directory path to clear (uses default if not provided)

## Environment Variables

- `SAP_AUTH_ACCOUNT` (optional): Specific SAP email account to use for authentication. If not set, will auto-select the first available account.
- `IN_PRIVATE` (optional): Set to `true` to enable private/incognito mode for browser sessions. Useful for testing without cached data. Default: `false`.
- `VISIBLE_MODE` (optional): Set to `true` to run automation in a visible browser so you can watch the process. Default: `false` (hybrid mode with headless first, visible fallback).
- `VERBOSE` (optional): Set to `true` to enable detailed logging to `~/.sap-mcp/logs/sap-auth-mcp.log`. Default: `false`.
- `BROWSER_PATH` (optional): Custom path to a Chrome or Edge browser executable. If not set, the server auto-detects the browser based on the platform.
