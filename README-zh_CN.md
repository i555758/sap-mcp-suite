# SAP 通用认证 MCP 服务器

[English](https://github.tools.sap/sfsfmcp/sap-auth-mcp/blob/main/README.md) | 中文

一个模型上下文协议（MCP）服务器，为其他 MCP 模块提供集中化的 SAP 认证服务。该服务器使用自动化浏览器认证处理复杂的 SAP 单点登录（SSO）流程，并为下游服务提供标准化的 Cookie 管理。

## 联系方式
如果有任何问题或者疑问，请联系 [Xeric Wei on Teams](https://teams.microsoft.com/l/chat/0/0?users=xeric.wei@sap.com)。

## 概述

SAP Auth MCP 被设计为一个**共享认证服务**，其他 MCP 模块可以利用它来处理 SAP 认证。每个 MCP 不需要实现自己的认证逻辑，而是可以将这个责任委托给这个集中化服务。

原理上，这个MCP将调用一个浏览器并尝试自动化执行认证流程，当静默模式无法获得有效cookie时则会自动fallback到显式的浏览器手动交互模式。

## 主要特性

- **混合认证**：结合无头和可视化浏览器自动化，提供最佳用户体验
- **集中化 Cookie 管理**：跨 MCP 模块的标准化 Cookie 存储和共享
- **多域支持**：处理各种 SAP 系统（Jira、Wiki 等）的认证
- **持久会话**：～24*7 小时 Cookie 持久化
- **错误标准化**：一致的错误响应，指导 AI 客户端

## 快速开始

### 使用前提
- 请确保你的环境有node套件，node version >= 20.0
- 注意，这个mcp单独使用并没有任何价值，是配合给像sap-jira-mcp和sap-wiki-mcp这样的mcp服务器使用的
- 请确保你能在运行的设备上正常认证后登录jira和wiki这样的sap服务
- 不推荐在没有进行sap enroll设备上运行（非sap IT管理的设备）

### ⚡️ 使用 npx 远程运行（推荐） ⚡️

最简单的开始方式：

先验证npx模式是否可以正常访问到远程的repo并运行
```bash
npx -y git+https://github.tools.sap/sfsfmcp/sap-auth-mcp.git --version
```

如果看到版本显示在终端 >= 1.1.0，则说明npx模式可以正常执行，注意，第一次可能会安装依赖和编译等一系列操作，会比后续的执行更慢一点。

## AI 客户端设置

#### 使用 npx（推荐）：

```json
{
  "mcpServers": {
    "sap-auth-mcp": {
      "command": "npx",
      "args": ["-y", "git+https://github.tools.sap/sfsfmcp/sap-auth-mcp.git"],
      "env": {
        "SAP_AUTH_ACCOUNT": "your.email@sap.com"
      }
    }
  }
}
```

至此，sap-auth-mcp已经可以在你的客户端正常运行了，请尝试使用其他依赖这个mcp的其他mcp server，比如 sap-wiki-mcp 和 sap-jira-mcp 来运行和测试吧。

如果你发现npx方式运行有问题，或者不希望已这种模式运行，或者希望通过本地repo clone后能更深入地掌控这个项目，则请进行本地安装运行：

### 本地安装

```bash
git clone https://github.tools.sap/sfsfmcp/sap-auth-mcp.git
cd sap-auth-mcp
npm install
npm run build
```

#### 使用本地安装：

```json
{
  "mcpServers": {
    "sap-auth-mcp": {
      "command": "node",
      "args": ["/path/to/sap-auth-mcp/dist/index.js"],
      "env": {
        "SAP_AUTH_ACCOUNT": "your.email@sap.com"
      }
    }
  }
}
```

### 配置说明

- 将 `/path/to/sap-auth-mcp/` 替换为您安装的实际绝对路径
- `SAP_AUTH_ACCOUNT` 环境变量是可选的但推荐设置，建议设置
- `IN_PRIVATE` 环境变量启用隐私模式进行测试，一般用于调试，可选
- `VISIBLE_MODE` 环境变量启用可视化浏览器进行调试自动化，一般用于调试，可选
- 如果clone repo后本地运行，确保 `dist/index.js` 文件存在（如需要，运行 `npm run build`）
- 配置更改后某些客户端需要刷新mcp或者重启您的 AI 客户端

### 验证

配置后，通过询问您的 AI 客户端来验证 MCP 是否已加载：
```
"有哪些 MCP 工具可用？"
```

您应该看到 SAP Auth MCP 工具列表：
- `sap_authenticate`
- `sap_make_request`
- `sap_get_cookie_info`
- `sap_clear_cookies`

## 环境配置

### 环境变量

- `SAP_AUTH_ACCOUNT`（可选）：用于认证的特定 SAP 邮箱账户
  - 如果未设置，将自动选择第一个可用账户
- `IN_PRIVATE`（可选）：为浏览器会话启用私有/隐身模式
  - 设置为 `true` 启用隐身模式，用于在没有缓存数据的情况下测试
  - 默认：`false`（正常浏览器模式）
- `VISIBLE_MODE`（可选）：启用可视化浏览器进行调试自动化
  - 设置为 `true` 在可视化浏览器中运行自动化（您可以观看过程）
  - 默认：`false`（混合模式，先无头，失败时转为可视化）
- `VERBOSE`（可选）：启用详细日志记录用于调试
  - 设置为 `true` 启用详细日志记录到 `~/.sap-mcp/logs/sap-auth-mcp.log`
  - 日志包含详细的认证流程、浏览器操作、Cookie/Token 操作
  - 默认：`false`（最小控制台输出）
- `BROWSER_PATH` (可选)：指定你浏览器的路径，现阶段测试过Chrome和Edge浏览器

### 私有模式使用

在以下情况下设置 `IN_PRIVATE=true`：
- **测试认证流程**，不使用缓存的浏览器数据
- **调试认证问题**，在干净的浏览器环境中
- **模拟新用户体验**，不使用存储的 Cookie 或会话数据
- **隔离认证问题**，从现有浏览器状态中

**注意**：私有模式会禁用浏览器会话之间的 Cookie 持久化，这可能需要更频繁的重新认证。

### 可视化模式使用

在以下情况下设置 `VISIBLE_MODE=true`：
- **调试认证自动化**，通过在可视化浏览器中观看自动化过程
- **了解自动化在做什么**，逐步观察
- **排除认证问题**，通过观察浏览器行为
- **开发和测试新的认证流程**，获得视觉反馈
- **验证自动化正确工作**，在部署到无头模式之前

**注意**：可视化模式运行相同的自动化逻辑，但在可视化浏览器中，允许您观看和了解过程。如果自动化失败，您仍然可以在同一个浏览器窗口中手动完成认证。

### 详细日志模式使用

在以下情况下设置 `VERBOSE=true`：
- **调试认证问题**，使用详细的逐步日志
- **了解认证流程**，通过查看日志文件
- **排查 Cookie/Token 提取**问题
- **报告 bug**，使用全面的诊断信息

**日志位置**：`~/.sap-mcp/logs/sap-auth-mcp.log`

**日志内容**：
- 带时间戳的认证流程步骤
- 浏览器导航和 URL 变化
- 账户选择和元素检测
- Cookie 获取和存储详情
- 从 localStorage 提取 Token
- 带堆栈跟踪的错误详情

**配置示例**：
```json
{
  "mcpServers": {
    "sap-auth-mcp": {
      "command": "npx",
      "args": ["-y", "git+https://github.tools.sap/sfsfmcp/sap-auth-mcp.git"],
      "env": {
        "SAP_AUTH_ACCOUNT": "your.email@sap.com",
        "VERBOSE": "true"
      }
    }
  }
}
```

**注意**：详细日志模式会创建详细的日志文件，随时间增长。建议在调试完成后禁用它。

### 系统要求

- **跨平台支持**：Windows、macOS 和 Linux
- Node.js 20+
- 浏览器：**Microsoft Edge**（Windows）、Google Chrome（macOS/Linux）或 Chromium
- 网络访问 SAP 系统

### 浏览器支持和平台特定建议

#### 🪟 **Windows**
- **推荐**：Microsoft Edge（自动检测）
- **默认路径**按顺序检查：
  1. `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`
  2. `C:\Program Files\Microsoft\Edge\Application\msedge.exe`
  3. Chrome 路径（备用）
- **为什么选择 Edge？**：由于 SAP Jira 的认证限制，Edge 在 Windows 上比 Chrome 提供更好的兼容性

#### 🍎 **macOS**
- **默认**：Google Chrome
- **路径**：`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`

#### 🐧 **Linux**
- **支持的浏览器**：Chrome、Chromium、Chrome Stable
- **默认路径**按顺序检查：
  1. `/usr/bin/google-chrome`
  2. `/usr/bin/google-chrome-stable`
  3. `/usr/bin/chromium-browser`
  4. `/usr/bin/chromium`
  5. `/snap/bin/chromium`
  6. `/opt/google/chrome/chrome`

### 自定义浏览器路径

使用 `BROWSER_PATH` 环境变量覆盖默认浏览器选择：

```json
{
  "mcpServers": {
    "sap-auth-mcp": {
      "command": "node",
      "args": ["/path/to/sap-auth-mcp/dist/index.js"],
      "env": {
        "BROWSER_PATH": "/custom/path/to/browser",
        "SAP_AUTH_ACCOUNT": "your.email@sap.com"
      }
    }
  }
}
```

**示例：**
- Windows Chrome：`"BROWSER_PATH": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"`
- macOS Brave：`"BROWSER_PATH": "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"`
- Linux Chromium：`"BROWSER_PATH": "/usr/bin/chromium-browser"`

### 长期运行服务器行为

此 MCP 服务器被设计为**长期运行进程**，在您的 AI 客户端会话期间保持活动状态：

- **持久进程**：服务器在您的 AI 客户端启动时开始，并持续运行直到客户端关闭
- **会话管理**：认证状态（`this.auth` 实例）在多个工具调用之间保持
- **性能优势**：避免每次认证请求的初始化开销
- **资源效率**：认证后浏览器实例被关闭，只保留会话 Cookie
- **后台操作**：服务器在后台静默运行，准备响应认证请求

**进程生命周期：**
1. **启动**：AI 客户端自动启动 MCP 服务器进程
2. **就绪状态**：服务器通过 stdio 传输监听工具调用
3. **工具执行**：根据需要处理认证请求
4. **持久**：在整个 AI 客户端会话期间保持活动状态
5. **关闭**：只有在 AI 客户端关闭时进程才终止

**资源管理：**
- **内存使用**：最小的 Node.js 进程占用（~30-50MB）
- **浏览器实例**：认证完成后自动关闭
- **Cookie 存储**：基于文件的存储，不保存在内存中
- **网络连接**：只在认证和 API 请求期间活动
- **进程监控**：可以通过标准系统工具（活动监视器、`ps` 等）监控

## 可用的 MCP 工具

### `sap_authenticate`

执行 SAP 系统认证并将 Cookie 保存到指定位置。

**参数：**
- `entry_url`（必需）：SAP 系统入口 URL（例如：`https://jira.tools.sap/`、`https://wiki.one.int.sap/`）
- `store_path`（必需）：保存 `sap_cookies.json` 的目录路径

**示例：**
```json
{
  "tool": "sap_authenticate",
  "arguments": {
    "entry_url": "https://jira.tools.sap/",
    "store_path": "/path/to/jira-mcp/cookies"
  }
}
```

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

## 浏览器自动化详情

### 第一阶段：无头认证

**邮箱账户选择（经典流程）：**
- 尝试从列表中自动点击邮箱账户选择
- 处理基本的 SSO 重定向
- 适用于简单的认证流程

**邮箱输入字段处理（新功能）：**
- 检测并自动填充 `input[type="email"]` 字段
- 使用 `SAP_AUTH_ACCOUNT` 环境变量作为邮箱
- 自动查找并点击提交按钮
- 支持各种 Microsoft 登录页面变体

**Microsoft Authenticator 数字匹配（新功能）：**
- 检测 Authenticator 数字匹配要求
- 从 `#idRemoteNGC_DisplaySign` 元素提取认证数字
- 提供清晰的用户指导和服务特定指导
- 等待用户在 Authenticator 应用中批准最多 1 分钟
- 批准完成时自动检测页面刷新
- 超时时回退到手动模式

### 第二阶段：可视化浏览器回退
- 需要用户交互时启动可视化 Chrome
- 处理 MFA、证书选择、复杂提示
- 支持自动化无法处理的复杂认证流程
- 认证完成后自动捕获 Cookie

### 浏览器配置
- Kerberos/NTLM 认证支持
- 证书存储集成
- SAP 域白名单
- 代理自动检测

## 故障排除

### 常见问题

1. **认证超时**：可视化浏览器认证有 6 分钟超时
2. **Chrome 路径**：macOS 硬编码，其他系统可能需要调整
3. **网络问题**：检查 SAP 域访问性和代理设置
4. **Cookie 权限**：确保对 `store_path` 目录有写权限

### 新认证功能问题

5. **邮箱自动填充不工作**：
   - 确保设置了 `SAP_AUTH_ACCOUNT` 环境变量
   - 检查页面是否包含 `input[type="email"]` 元素
   - 验证到 Microsoft 登录页面的网络连接

6. **未检测到 Authenticator 数字**：
   - 检查页面上是否存在 `#idRemoteNGC_DisplaySign` 元素
   - 验证元素是否包含数字值
   - 某些页面可能使用替代选择器（会自动检查）

7. **Authenticator 超时问题**：
   - 数字匹配的默认超时时间为 1 分钟
   - 确保已安装并配置 Microsoft Authenticator 应用
   - 检查在 Authenticator 中设置了正确的服务账户
   - 系统会在超时时自动回退到手动模式

8. **找不到提交按钮**：
   - 系统检查多种按钮类型：`input[type="submit"]`、`button[type="submit"]`
   - 还会查找常见的 Microsoft 按钮 ID 和文本模式
   - 手动回退将处理不寻常的按钮配置

### 长期运行进程问题

9. **服务器无响应**：检查 MCP 服务器进程是否仍在运行
   ```bash
   # 检查运行中的 sap-auth-mcp 进程
   ps aux | grep "sap-auth-mcp"
   ```

10. **内存问题**：监控进程内存使用随时间的变化
   ```bash
   # 监控内存使用（macOS）
   top -pid $(pgrep -f "sap-auth-mcp")
   ```

11. **僵尸浏览器进程**：确保浏览器实例正确关闭
   ```bash
   # 检查残留的 Chrome 进程
   ps aux | grep "Google Chrome"
   ```

12. **进程卡住**：如果服务器变得无响应，重启您的 AI 客户端
   - 关闭 AI 客户端（Claude Desktop 等）
   - 重新打开 AI 客户端以重启 MCP 服务器

13. **多个实例**：避免使用相同的 MCP 配置运行多个 AI 客户端
   - 每个 AI 客户端启动自己的 MCP 服务器实例
   - 多个实例可能会在浏览器资源上发生冲突

### 调试信息

通过检查浏览器控制台输出和 MCP 服务器日志启用详细日志记录：

- **MCP 服务器日志**：检查来自您的 AI 客户端的 stderr 输出
- **浏览器控制台**：使用可视化浏览器模式时可用
- **Cookie 文件**：验证 Cookie 文件在指定路径中被创建/更新
- **进程状态**：使用系统监控工具检查服务器健康状况

## 安全考虑

- Cookie 以纯文本 JSON 格式本地存储
- 安全起见，24 小时自动过期
- 唯一的存储路径防止交叉污染
- 不存储凭据 - 依赖系统认证

---

## MCP 开发者集成指南

本节适用于希望将其 MCP 模块与 SAP Auth MCP 服务集成的开发者。

### 架构概述

#### 认证流程

1. **MCP 模块**遇到认证要求
2. **返回标准化错误**指示需要 SAP 认证
3. **AI 客户端**使用所需参数调用 SAP Auth MCP
4. **SAP Auth MCP**执行认证并将 Cookie 保存到指定路径
5. **MCP 模块**使用保存的 Cookie 重试操作

#### Cookie 存储约定

所有认证会话都存储为 MCP 特定目录中的 `sap_cookies.json` 文件。这种标准化确保：
- 所有集成中一致的文件命名
- 组件之间轻松的 Cookie 共享
- 每个 MCP 模块的认证数据清晰分离

### 步骤 1：实施认证错误响应

当您的 MCP 遇到认证要求时，返回此标准化错误格式：

```json
{
  "error": "SAP_AUTH_REQUIRED",
  "details": "need call sap auth mcp to prepare cookie and redo function after",
  "data": {
    "store_path": "/path/to/your-mcp/cookies",
    "entry_url": "https://your-sap-system.sap/"
  }
}
```

**字段描述：**
- `error`：AI 客户端可以识别的标准错误代码
- `details`：AI 客户端的人类可读解释
- `store_path`：您的 MCP 模块 Cookie 的**唯一目录路径**
- `entry_url`：目标 SAP 系统的主要入口点 URL

### 步骤 2：Cookie 路径约定

- 每个 MCP 模块**必须**使用唯一的 `store_path`
- 路径应该专用于您的 MCP 模块
- Cookie 文件将自动命名为 `sap_cookies.json`
- 推荐模式：`/path/to/{mcp-name}/cookies/`

**示例：**
```
/path/to/jira-mcp/cookies/sap_cookies.json
/path/to/wiki-mcp/cookies/sap_cookies.json
/path/to/confluence-mcp/cookies/sap_cookies.json
```

### 步骤 3：在您的 MCP 中读取 Cookie

认证后，从您指定的路径读取 Cookie 文件：

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';

const cookiePath = join(storePath, 'sap_cookies.json');
const cookieData = JSON.parse(readFileSync(cookiePath, 'utf8'));
```

### 步骤 4：在 HTTP 请求中使用 Cookie

将存储的 Cookie 转换为适合您的 HTTP 客户端的格式：

```typescript
// fetch API 示例
const cookies = cookieData.cookies
  .map((cookie: any) => `${cookie.name}=${cookie.value}`)
  .join('; ');

const response = await fetch(url, {
  headers: {
    'Cookie': cookies,
    // ... 其他头部
  }
});
```

### 步骤 5：处理 Cookie 过期

监控认证失败并触发重新认证：

```typescript
if (response.status === 401 || response.status === 403) {
  // 返回 SAP_AUTH_REQUIRED 错误以触发重新认证
  return {
    error: "SAP_AUTH_REQUIRED",
    details: "need call sap auth mcp to prepare cookie and redo function after",
    data: {
      store_path: "/path/to/your-mcp/cookies",
      entry_url: "https://your-sap-system.sap/"
    }
  };
}
```

### 示例集成工作流程

1. **Jira MCP**尝试获取问题数据
2. **从 Jira API 收到 401 未授权**
3. **返回标准化错误：**
   ```json
   {
     "error": "SAP_AUTH_REQUIRED",
     "details": "need call sap auth mcp to prepare cookie and redo function after",
     "data": {
       "store_path": "/path/to/jira-mcp/cookies",
       "entry_url": "https://jira.tools.sap/"
     }
   }
   ```
4. **AI 客户端**识别错误并调用 SAP Auth MCP
5. **SAP Auth MCP**认证并将 Cookie 保存到 `/path/to/jira-mcp/cookies/sap_cookies.json`
6. **AI 客户端**重试原始 Jira MCP 操作
7. **Jira MCP**读取 Cookie 并成功访问 Jira API

## 贡献

在为这个共享认证服务贡献时，请确保：
- 与现有集成的向后兼容性
- 适当的错误处理和日志记录
- 新功能的文档更新
- 使用多个 SAP 系统进行测试

## 许可证

MIT 许可证 - 详情请参阅 LICENSE 文件
