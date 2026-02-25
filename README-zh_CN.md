# SAP MS Teams MCP

一个通过 SAP SSO 认证访问 Microsoft Teams 的 MCP (Model Context Protocol) 服务器。

## 概述

这个 MCP 服务器使 AI 助手能够与 Microsoft Teams 的对话、消息、会议录制、转录以及 Microsoft Graph API（用户搜索、日历、组织架构）进行交互。它通过 `sap-auth-mcp` 配套工具使用 SAP SSO 认证。

## 功能特性

### Teams Chat API (11 个工具)
- **对话**: 列出、搜索和筛选 Teams 对话
- **消息**: 读取、发送和搜索对话中的消息
- **成员**: 获取对话成员
- **会议录制**: 查找会议录制及其转录
- **转录**: 下载和解析会议转录（VTT 格式）
- **摘要**: 获取用于 AI 摘要的消息

### Microsoft Graph API (5 个工具)
- **用户搜索**: 按姓名/邮箱搜索用户，获取联系信息
- **日历**: 获取日历事件（今天/本周/本月/自定义范围）
- **组织架构**: 获取上级经理和直接下属

## 前置要求

- Node.js >= 20.0.0
- `sap-auth-mcp` 用于 SAP SSO 认证

## 安装

### 远程使用（推荐）

```bash
npx -y git+https://github.tools.sap/sfsfmcp/sap-msteams-mcp.git
```

### 本地安装

```bash
git clone https://github.tools.sap/sfsfmcp/sap-msteams-mcp.git
cd sap-msteams-mcp
npm install
npm run build
```

## 配置

### 环境变量

| 变量 | 描述 | 默认值 |
|------|------|--------|
| `AUTH_COOKIE_DIR` | Cookie/Token 存储路径 | `~/.sap-auth-mcp` |
| `SAP_TEAMS_REGION` | Teams 区域 (emea, amer, apac) | `emea` |
| `VERBOSE` | 启用详细日志 (true/false) | `false` |

### MCP 配置

添加到你的 MCP 配置中：

```json
{
  "mcpServers": {
    "sap-msteams": {
      "command": "npx",
      "args": ["-y", "git+https://github.tools.sap/sfsfmcp/sap-msteams-mcp.git"],
      "env": {
        "AUTH_COOKIE_DIR": "~/.sap-auth-mcp",
        "SAP_TEAMS_REGION": "emea",
        "VERBOSE": "false"
      }
    }
  }
}
```

或使用本地安装：

```json
{
  "mcpServers": {
    "sap-msteams": {
      "command": "node",
      "args": ["/path/to/sap-msteams-mcp/dist/index.js"],
      "env": {
        "AUTH_COOKIE_DIR": "~/.sap-auth-mcp",
        "SAP_TEAMS_REGION": "emea"
      }
    }
  }
}
```

## 使用方法

### 1. 使用 SAP SSO 认证

首先，使用 `sap-auth-mcp` 进行认证：

```
sap_authenticate(
  entry_url="https://teams.cloud.microsoft/v2/",
  store_path="~/.sap-auth-mcp"
)
```

这将创建：
- `sap_cookies.json` - Teams Chat API token（来自 cookies）
- `sap_tokens.json` - Graph API token（来自 localStorage）

### 2. 使用 Teams 工具

认证成功后，你可以使用以下工具：

#### Teams Chat API 工具

```javascript
// 列出对话
teams_web_conversations({ limit: 20, search: "项目" })

// 获取消息
teams_web_messages({ conversationId: "19:xxx@thread.tacv2", limit: 50 })

// 发送消息
teams_web_send({ conversationId: "19:xxx@thread.tacv2", message: "你好！" })

// 搜索对话
teams_web_search_conversation({ query: "团队会议" })

// 按时间获取对话
teams_web_conversations_by_time({ since: "2026-02-01T00:00:00Z" })

// 搜索消息
teams_web_search_messages({ conversationId: "...", query: "截止日期" })

// 获取会议录制
teams_web_meeting_recordings({ conversationId: "..." })

// 获取转录
teams_web_transcript({ url: "https://...asyncgw.teams.microsoft.com/.../views/transcript" })

// 获取用于摘要的消息
teams_web_summarize({ conversationId: "...", messageCount: 100 })

// 查找私聊
teams_web_find_private_chat({ personName: "张三" })

// 获取对话成员
teams_web_members({ conversationId: "..." })
```

#### Graph API 工具

```javascript
// 搜索用户
teams_web_search_people({ query: "张三", limit: 10 })

// 获取日历事件
teams_web_calendar({ range: "week" })  // today, week, month
teams_web_calendar({ startDate: "2026-02-01", endDate: "2026-02-28" })

// 获取上级经理
teams_web_manager()

// 获取直接下属
teams_web_direct_reports({ limit: 50 })

// 获取我的资料
teams_web_my_profile()
```

## 工具参考

### Teams Chat API 工具 (11 个)

| 工具 | 描述 |
|------|------|
| `teams_web_conversations` | 列出最近的对话 |
| `teams_web_messages` | 获取对话中的消息 |
| `teams_web_send` | 发送消息 |
| `teams_web_search_conversation` | 按名称/主题搜索对话 |
| `teams_web_conversations_by_time` | 获取时间范围内的对话 |
| `teams_web_search_messages` | 搜索对话中的消息 |
| `teams_web_meeting_recordings` | 查找会议录制 |
| `teams_web_transcript` | 获取会议转录内容 |
| `teams_web_summarize` | 获取用于 AI 摘要的消息 |
| `teams_web_find_private_chat` | 查找与某人的 1:1 私聊 |
| `teams_web_members` | 获取对话成员 |

### Graph API 工具 (5 个)

| 工具 | 描述 |
|------|------|
| `teams_web_search_people` | 按姓名/邮箱搜索用户 |
| `teams_web_calendar` | 获取日历事件 |
| `teams_web_manager` | 获取当前用户的上级经理 |
| `teams_web_direct_reports` | 获取直接下属 |
| `teams_web_my_profile` | 获取当前用户的资料 |

## CLI 使用

```bash
# 显示帮助
sap-msteams-mcp --help

# 显示版本
sap-msteams-mcp --version

# 启动服务器
sap-msteams-mcp
```

## 详细日志模式

启用详细日志以便调试：

```bash
VERBOSE=true sap-msteams-mcp
```

日志文件位置: `~/.sap-mcp/logs/sap-msteams-mcp.log`

## 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 监听模式（开发）
npm run dev

# 启动服务器
npm start
```

## 架构

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Claude/LLM    │────▶│  sap-msteams-mcp │────▶│   Teams API     │
└─────────────────┘     └────────┬─────────┘     └─────────────────┘
                                 │                        │
                                 │               ┌─────────────────┐
                                 │──────────────▶│   Graph API     │
                                 │               └─────────────────┘
                                 ▼
                        ┌──────────────────┐
                        │   sap-auth-mcp   │
                        │ (sap_cookies.json│
                        │  sap_tokens.json)│
                        └──────────────────┘
```

## Token 来源

| Token | 来源文件 | Audience | 用途 |
|-------|----------|----------|------|
| Teams Chat API | `sap_tokens.json` | `ic3.teams.office.com` | 对话、消息 |
| Graph API | `sap_tokens.json` | `graph.microsoft.com` | 用户、日历、组织架构 |

## 许可证

MIT
