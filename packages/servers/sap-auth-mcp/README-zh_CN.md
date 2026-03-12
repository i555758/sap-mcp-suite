# SAP 通用认证 MCP 服务器

[English](./README.md) | 中文

一个模型上下文协议（MCP）服务器，为其他 MCP 模块提供集中化的 SAP 认证服务。该服务器使用自动化浏览器认证处理复杂的 SAP 单点登录（SSO）流程，并为下游服务提供标准化的 Cookie 管理。

> 此服务器是 [sap-mcp-suite](../../README.md) 的一部分。请参阅根目录 README 了解安装和设置。

## 概述

SAP Auth MCP 被设计为一个**共享认证服务**，其他 MCP 模块可以利用它来处理 SAP 认证。每个 MCP 不需要实现自己的认证逻辑，而是可以将这个责任委托给这个集中化服务。

原理上，这个MCP将调用一个浏览器并尝试自动化执行认证流程，当静默模式无法获得有效cookie时则会自动fallback到显式的浏览器手动交互模式。

## 主要特性

- **混合认证**：结合无头和可视化浏览器自动化，提供最佳用户体验
- **集中化 Cookie 管理**：跨 MCP 模块的标准化 Cookie 存储和共享
- **多域支持**：处理各种 SAP 系统（Jira、Wiki 等）的认证
- **持久会话**：～24*7 小时 Cookie 持久化
- **错误标准化**：一致的错误响应，指导 AI 客户端

## 可用的 MCP 工具

### `sap_authenticate`

执行 SAP 系统认证并将 Cookie 保存到指定位置。

**参数：**
- `entry_url`（必需）：SAP 系统入口 URL（例如：`https://jira.tools.sap/`、`https://wiki.one.int.sap/`）
- `store_path`（必需）：保存 `sap_cookies.json` 的目录路径

### `sap_make_request`

使用存储的会话 Cookie 进行认证的 HTTP 请求。

**参数：**
- `url`（必需）：请求的目标 URL
- `method`（可选）：HTTP 方法（默认：GET）
- `headers`（可选）：附加头部
- `body`（可选）：POST/PUT 请求的请求体

### `sap_get_cookie_info`

检索有关存储的认证 Cookie 的信息。

**参数：**
- `store_path`（可选）：要检查的目录路径（如果未提供则使用默认路径）

### `sap_clear_cookies`

从指定位置清除存储的认证 Cookie。

**参数：**
- `store_path`（可选）：要清除的目录路径（如果未提供则使用默认路径）

## 环境变量

- `SAP_AUTH_ACCOUNT`（可选）：用于认证的特定 SAP 邮箱账户。如果未设置，将自动选择第一个可用账户。
- `IN_PRIVATE`（可选）：设置为 `true` 启用隐身模式，用于在没有缓存数据的情况下测试。默认：`false`。
- `VISIBLE_MODE`（可选）：设置为 `true` 在可视化浏览器中运行自动化，可以观看过程。默认：`false`（混合模式，先无头，失败时转为可视化）。
- `VERBOSE`（可选）：设置为 `true` 启用详细日志记录到 `~/.sap-mcp/logs/sap-auth-mcp.log`。默认：`false`。
- `BROWSER_PATH`（可选）：Chrome 或 Edge 浏览器可执行文件的自定义路径。如果未设置，服务器将根据平台自动检测浏览器。
