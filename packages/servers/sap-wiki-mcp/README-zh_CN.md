# SAP Wiki MCP 服务器

[English](./README.md) | 中文

> 此服务器是 [sap-mcp-suite](../../../README.md) 的一部分。请参阅根目录 README 了解安装和设置。

一个模型上下文协议(MCP)服务器,通过 Claude 和其他 MCP 兼容客户端提供对 Confluence/Wiki 实例的访问。该服务器支持 SAP 内部 Wiki (wiki.one.int.sap) 的 cookie 身份验证,以及其他内部 wiki 域名(如 wiki.ariba.com)的个人访问令牌(PAT)身份验证。您可以搜索 wiki、执行高级 CQL 查询,并直接从 AI 助手获取页面内容。

## 基本使用

**只需自然地询问 Claude!** 配置完成后,您可以立即开始使用:

> "在 SAP Wiki 中搜索 'API documentation'"
> "查找关于 Fiori 部署的页面"
> "给我看 CQL 查询示例"

### 默认工作流程(推荐)
该服务器与 [sap-auth-mcp](../sap-auth-mcp/) 无缝集成以进行身份验证。只需在 Claude 中使用这些工具:

#### `general_search` - 快速 Wiki 搜索
```
在 SAP Wiki 中搜索 "Confluence administration"
```
- 搜索所有 SAP Wiki 内容
- 自动分页和格式化
- 无需身份验证设置(由 [sap-auth-mcp](../sap-auth-mcp/) 处理)

#### `cql_search` - 高级查询搜索
```
使用 CQL 搜索: siteSearch ~ "API" AND type = page ORDER BY lastModified DESC
```
- 支持高级 Confluence 查询语言
- 按内容类型、日期、空间精确过滤
- 专业搜索功能

#### `cql_examples` - 学习 CQL 语法
```
给我看 SAP Wiki 的 CQL 示例
```
- 10 个经过验证的可用 CQL 查询示例
- 完整的语法参考和规则
- SAP Wiki 查询的最佳实践

#### `wiki_content` - 获取完整页面内容
```
从 https://wiki.one.int.sap/wiki/pages/viewpage.action?pageId=123456 获取内容
```
- 检索完整页面内容
- 清理后的文本格式(或通过 `format="storage"` 获取 Confluence 存储 XML)
- 适用于任何 wiki.one.int.sap URL

## 身份验证

该服务器支持两种身份验证模式:

### 模式 1: Cookie 身份验证(SAP Wiki 默认)
对于 SAP 内部 wiki (wiki.one.int.sap),服务器自动与 [sap-auth-mcp](../sap-auth-mcp/) 集成:
- 无需手动身份验证
- 通过标准化的 `sap_cookies.json` 自动共享 cookie
- 当需要身份验证时,您会看到一个结构化错误,要求运行 [sap-auth-mcp](../sap-auth-mcp/)
- 所有身份验证复杂性都在外部处理

### 模式 2: PAT 身份验证(自定义 Confluence 域名)
对于自定义 Confluence 实例,使用个人访问令牌(PAT)身份验证:
- 从 wiki 门户生成 PAT(用户设置 -> 个人访问令牌)
- 设置 `WIKI_DOMAIN` 和 `WIKI_API_TOKEN` 环境变量
- 服务器自动使用 Bearer 令牌身份验证
- 无需 cookie 管理

**如何在 Confluence 中创建 PAT:**
1. 进入您的 Confluence 实例
2. 点击您的个人资料 -> 设置
3. 导航到"个人访问令牌"
4. 点击"创建令牌"并命名
5. 复制生成的令牌(之后将无法再次查看!)
6. 在 `WIKI_API_TOKEN` 环境变量中使用此令牌

## 环境变量

#### `WIKI_DOMAIN`(可选)
Confluence/Wiki 实例的域名。如未设置,默认为 `wiki.one.int.sap`。

示例: `WIKI_DOMAIN=wiki.ariba.com`

#### `WIKI_API_TOKEN`(自定义域名必需)
用于自定义 Confluence 域名身份验证的个人访问令牌(PAT)。设置后,服务器使用 Bearer 令牌身份验证而非 cookie。

示例: `WIKI_API_TOKEN=your-pat-token-here`

#### `AUTH_COOKIE_DIR`(可选,仅用于 SAP Wiki)
使用 SAP Wiki cookie 身份验证时的自定义 cookie 存储目录。文件名始终为 `sap_cookies.json`。

示例: `AUTH_COOKIE_DIR=/shared/cookie/directory`

默认位置: `~/.sap-mcp/auth.json`（所有 SAP MCP 服务器共享）。

## 工具参考

### 搜索工具

| 工具 | 用途 | 必需参数 | 可选参数 |
|------|------|---------|---------|
| `general_search` | 基本 wiki 搜索 | `keyword` | `start`, `limit` |
| `cql_search` | 高级 CQL 查询 | `cql` | `start`, `limit` |
| `cql_examples` | 获取 CQL 语法帮助 | 无 | 无 |

### 内容工具

| 工具 | 用途 | 必需参数 | 可选参数 |
|------|------|---------|---------|
| `wiki_content` | 获取页面内容 | `url` | `format` |

## CQL 查询示例

该服务器包含全面的 CQL 文档。使用 `cql_examples` 工具查看:

- 基本文本搜索: `siteSearch ~ "API"`
- 内容类型过滤: `siteSearch ~ "documentation" AND type = page`
- 基于日期的查询: `siteSearch ~ "release" AND lastModified > "2024-12-01"`
- 复杂组合: `title ~ "API" OR siteSearch ~ "REST endpoint"`

**重要**: SAP Wiki CQL 不支持相对日期(如 `-30d`)。使用 `YYYY-MM-DD` 格式的具体日期。

## 故障排除

### 常见问题

**需要身份验证错误(Cookie 模式)**
- 使用 [sap-auth-mcp](../sap-auth-mcp/) 进行身份验证

**身份验证错误(PAT 模式)**
- 错误: "Invalid or expired API token"
- 解决方案: 验证 `WIKI_API_TOKEN` 是否正确且未过期
- 如需要,从 Confluence 实例生成新的 PAT

**网络错误**
- 验证到 wiki 域名的网络连接
- 对于 SAP Wiki: 检查到 SAP 内部网络的 VPN 连接
- 对于自定义域名: 确保防火墙/代理允许访问

**CQL 语法错误**
- 首先使用 `cql_examples` 工具
- 记住使用具体日期,而非相对日期(如 `"2024-01-01"` 而非 `"-30d"`)
- 确保正确引用: `"search term"`
- 如果您的 Confluence 实例不支持 CQL,请使用 `general_search` 代替

**域名验证错误**
- 错误: "Invalid wiki URL domain"
- 解决方案: 确保 URL 与配置的 `WIKI_DOMAIN` 匹配
- URL 必须来自环境变量中指定的同一域名

### 文件位置
- 认证存储: `~/.sap-mcp/auth.json`（所有 SAP MCP 服务器共享）

## 功能兼容性

### 支持的 Confluence 功能
- 通用关键词搜索
- CQL (Confluence Query Language) 查询
- 页面内容获取
- 多 wiki 实例(通过单独的 MCP 服务器配置)

### CQL 支持
大多数 Confluence 实例(5.5+ 版本)支持 CQL 查询。如果您的实例不支持 CQL:
- 服务器将返回有用的错误消息
- 使用 `general_search` 工具进行关键词搜索
- 向 Confluence 管理员确认 CQL 可用性

### URL 格式
服务器支持标准 Confluence URL 格式:
- `https://wiki.domain.com/pages/viewpage.action?pageId=123456`
- `https://wiki.domain.com/spaces/SPACE/pages/123456/Page+Title`
- `https://wiki.domain.com/display/SPACE/Page+Title`
