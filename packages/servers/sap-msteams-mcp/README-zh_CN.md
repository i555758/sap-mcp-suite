# SAP MS Teams MCP

[English](./README.md)

> 此服务器是 [sap-mcp-suite](../../../README.md) 的一部分。请参阅根目录 README 了解安装和设置。

一个通过 SAP SSO 认证访问 Microsoft Teams 的 MCP (Model Context Protocol) 服务器。

## 概述

这个 MCP 服务器使 AI 助手能够与 Microsoft Teams 的对话、消息、会议录制、转录以及 Microsoft Graph API（用户搜索、日历、组织架构）进行交互。它通过 `sap-auth-mcp` 配套工具使用 SAP SSO 认证。

## 功能特性

### Teams Chat API
- **对话**: 列出、搜索和筛选 Teams 对话(支持 `search`、`since`、`until` 参数)
- **消息**: 读取、搜索和筛选对话中的消息(支持 `search`、`since`、`until` 参数)
- **发送与回复**: 发送新消息或线程回复
- **成员**: 获取对话成员
- **私聊**: 按人名查找 1:1 私聊
- **会议录制**: 查找会议录制及其转录
- **转录**: 下载和解析会议转录

### Microsoft Graph API
- **用户搜索**: 按姓名/邮箱搜索用户，获取联系信息
- **日历**: 获取日历事件（今天/本周/本月/自定义范围）
- **组织架构**: 获取上级经理和直接下属
- **个人资料**: 获取当前用户资料

## 环境变量

| 变量 | 描述 | 默认值 |
|------|------|--------|
| `AUTH_COOKIE_DIR` | Cookie/Token 存储路径 | `~/.sap-mcp` |
| `SAP_TEAMS_REGION` | Teams 区域 (emea, amer, apac) | `emea` |
| `VERBOSE` | 启用详细日志 (true/false) | `false` |

## 使用方法

### 1. 使用 SAP SSO 认证

首先，使用 `sap-auth-mcp` 进行认证：

```
sap_authenticate(entry_url="https://teams.cloud.microsoft/v2/")
```

Token 存储在 `~/.sap-mcp/auth.json`（所有 SAP MCP 服务器共享）。

### 2. 使用 Teams 工具

认证成功后，你可以使用以下工具：

#### Teams Chat API 工具

```javascript
// 列出对话（支持搜索和时间过滤）
teams_web_conversations({ limit: 20, search: "项目" })
teams_web_conversations({ since: "2026-02-01T00:00:00Z" })

// 获取消息（支持搜索和时间过滤）
teams_web_messages({ conversationId: "19:xxx@thread.tacv2", limit: 50 })
teams_web_messages({ conversationId: "...", search: "截止日期" })

// 发送消息 / 线程回复
teams_web_send({ conversationId: "19:xxx@thread.tacv2", message: "你好！" })
teams_web_reply({ conversationId: "...", parentMessageId: "...", message: "谢谢！" })

// 查找私聊、获取成员
teams_web_find_private_chat({ query: "张三" })
teams_web_members({ conversationId: "..." })

// 会议录制和转录
teams_web_meeting_recordings({ conversationId: "..." })
teams_web_transcript({ url: "https://...asyncgw.teams.microsoft.com/.../views/transcript" })
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

### Teams Chat API 工具

| 工具 | 描述 |
|------|------|
| `teams_web_conversations` | 列出/搜索对话（支持 `search`、`since`、`until`） |
| `teams_web_messages` | 获取/搜索对话中的消息（支持 `search`、`since`、`until`） |
| `teams_web_send` | 发送新消息 |
| `teams_web_reply` | 发送线程回复 |
| `teams_web_find_private_chat` | 查找与某人的 1:1 私聊 |
| `teams_web_members` | 获取对话成员 |
| `teams_web_meeting_recordings` | 查找会议录制 |
| `teams_web_transcript` | 获取会议转录内容 |

### Graph API 工具

| 工具 | 描述 |
|------|------|
| `teams_web_search_people` | 按姓名/邮箱搜索用户 |
| `teams_web_calendar` | 获取日历事件 |
| `teams_web_manager` | 获取当前用户的上级经理 |
| `teams_web_direct_reports` | 获取直接下属 |
| `teams_web_my_profile` | 获取当前用户的资料 |

## Token 来源

所有 token 存储在 `~/.sap-mcp/auth.json`（由 sap-auth-mcp 管理）。

| Token | Audience | 用途 |
|-------|----------|------|
| Teams Chat API | `ic3.teams.office.com` | 对话、消息 |
| Graph API | `graph.microsoft.com` | 用户、日历、组织架构 |

## 详细日志模式

日志文件位置: `~/.sap-mcp/logs/sap-msteams-mcp.log`
