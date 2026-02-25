# SAP Wiki MCP 服务器

[English](https://github.tools.sap/sfsfmcp/sap-wiki-mcp/blob/main/README.md) | 中文

一个模型上下文协议(MCP)服务器,通过 Claude 和其他 MCP 兼容客户端提供对 SAP Wiki (wiki.one.int.sap) 的访问。该服务器使您能够搜索内部 SAP Wiki,执行高级 CQL 查询,并直接从 AI 助手获取页面内容。

## 快速开始

### 使用前提
- 请确保你的环境有node套件，node version >= 20.0
- 注意，这个mcp需要配合[sap-auth-mcp](https://github.tools.sap/sfsfmcp/sap-auth-mcp)使用
- 请确保你能在运行的设备上正常认证后登录jira和wiki这样的sap服务
- 不推荐在没有进行sap enroll设备上运行（非sap IT管理的设备）

### ⚡ 最快方式(推荐) ⚡️

**无需安装!** 直接使用 npx 测试服务器:

# 1. 测试是否正常工作
```bash
npx -y git+https://github.tools.sap/sfsfmcp/sap-wiki-mcp.git --version
```

# 2. 如果显示版本号 >= 1.1.0, 就可以添加到你的支持MCP的客户端:

```json
{
  "mcpServers": {
    "sap-wiki": {
      "command": "npx",
      "args": ["-y", "git+https://github.tools.sap/sfsfmcp/sap-wiki-mcp.git"],
      "env": {
        "AUTH_COOKIE_DIR": "/path/to/your/cookie_file_store_folder"
      }
    }
  }
}
```

至此，你的mcp已经可以在你的客户端正常开始工作了。

如果你发现npx方式运行有问题，或者不希望已这种模式运行，或者希望通过本地repo clone后能更深入地掌控这个项目，则请进行本地安装运行：

### 备选方案: 本地安装

如果您更喜欢本地安装以进行开发:

1. **克隆并构建**:
```bash
git clone https://github.tools.sap/sfsfmcp/sap-wiki-mcp.git
cd sap-wiki-mcp
npm install
npm run build
```

2. **配置 MCP**:
```json
{
  "mcpServers": {
    "sap-wiki": {
      "command": "node",
      "args": ["/path/to/sap-wiki-mcp/dist/index.js"],
      "env": {
        "AUTH_COOKIE_DIR": "/path/to/your/cookie_file_store_folder"
      }
    }
  }
}
```

## 基本使用

**只需自然地询问 Claude!** 配置完成后,您可以立即开始使用:

> "在 SAP Wiki 中搜索 'API documentation'"
> "查找关于 Fiori 部署的页面"
> "给我看 CQL 查询示例"

### 默认工作流程(推荐)
该服务器与 [sap-auth-mcp](https://github.tools.sap/sfsfmcp/sap-auth-mcp) 无缝集成以进行身份验证。只需在 Claude 中使用这些工具:

#### `general_search` - 快速 Wiki 搜索
```
在 SAP Wiki 中搜索 "Confluence administration"
```
- 搜索所有 SAP Wiki 内容
- 自动分页和格式化
- 无需身份验证设置(由 [sap-auth-mcp](https://github.tools.sap/sfsfmcp/sap-auth-mcp) 处理)

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
- 清理后的文本格式(如需要可使用原始 HTML)
- 适用于任何 wiki.one.int.sap URL

## 身份验证

### 默认: sap-auth-mcp 集成(推荐)
该服务器自动与 [sap-auth-mcp](https://github.tools.sap/sfsfmcp/sap-auth-mcp) 集成以实现无缝身份验证:
- 无需手动身份验证
- 通过标准化的 `sap_cookies.json` 自动共享 cookie
- 当需要身份验证时,您会看到一个结构化错误,要求运行 [sap-auth-mcp](https://github.tools.sap/sfsfmcp/sap-auth-mcp)
- 所有身份验证复杂性都在外部处理

## 高级配置

### 可选参数

#### 环境变量
`AUTH_COOKIE_DIR=/path/to/custom/cookie/directory`

#### 自定义 Cookie 存储目录
这个路径会在没有认证的情况下传递给sap-auth-mcp，后者会在完成认证后存储一个sap_cookies.json文件到这个目录下，wiki的mcp接下来会读取这个cookie并进行wiki相关操作

默认情况下,cookie 存储在 `{project_root}/tmp/sap_cookies.json`。您可以使用以下方式自定义目录(而非文件名):

1. **环境变量**(推荐用于共享位置):
```json
{
  "mcpServers": {
    "sap-wiki": {
      "command": "node",
      "args": ["/path/to/sap-wiki-mcp/dist/index.js"],
      "env": {
        "AUTH_COOKIE_DIR": "/shared/cookie/directory"
      }
    }
  }
}
```
这将把 cookie 存储在 `/shared/cookie/directory/sap_cookies.json`。

2. **对于 sap-auth-mcp 集成**: 当与 sap-auth-mcp 集成时,`customStorePath` 参数优先于环境变量。

3. **与 sap-jira-mcp 共享**: 在两个 MCP 服务器中使用相同的 `AUTH_COOKIE_DIR` 值可以实现 cookie 共享,以实现无缝 SAP 身份验证。

**注意**: `AUTH_COOKIE_DIR` 仅指定目录。文件名始终为 `sap_cookies.json`。

### 备选安装方法

#### 使用 Volta(用于 Node.js 版本管理)
```bash
# 安装 Volta
curl https://get.volta.sh | bash

# 安装 Node.js 20
volta install node@20

# 构建项目
git clone <repository-url>
cd sap-wiki-mcp
npm install
npm run build
```

#### 在其他 MCP 客户端中运行
```bash
node /path/to/sap-wiki-mcp/dist/index.js
```

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
| `wiki_content` | 获取页面内容 | `url` | `raw` |

## CQL 查询示例

该服务器包含全面的 CQL 文档。使用 `cql_examples` 工具查看:

- 基本文本搜索: `siteSearch ~ "API"`
- 内容类型过滤: `siteSearch ~ "documentation" AND type = page`
- 基于日期的查询: `siteSearch ~ "release" AND lastModified > "2024-12-01"`
- 复杂组合: `title ~ "API" OR siteSearch ~ "REST endpoint"`

**重要**: SAP Wiki CQL 不支持相对日期(如 `-30d`)。使用 `YYYY-MM-DD` 格式的具体日期。

## 故障排除

### 常见问题

**NPX 命令问题**
```bash
# 测试 npx 是否工作
npx -y git+https://github.tools.sap/sfsfmcp/sap-wiki-mcp.git --version

# 如果遇到权限错误,尝试:
npm config set registry https://registry.npmjs.org/

# 如果在企业代理后面,检查您的 npm 代理设置:
npm config get proxy
npm config get https-proxy
```

**需要身份验证错误**
- 使用 [sap-auth-mcp](https://github.tools.sap/sfsfmcp/sap-auth-mcp) 进行身份验证

**网络错误**
- 验证到 SAP 内部网络的 VPN 连接
- 检查 wiki.one.int.sap 是否可以在浏览器中访问

**CQL 语法错误**
- 首先使用 `cql_examples` 工具
- 记住使用具体日期,而非相对日期
- 确保正确引用: `"search term"`

### 文件位置
- Cookie 存储: `./tmp/sap_cookies.json`(默认目录可通过 `AUTH_COOKIE_DIR` 环境变量自定义)
- 使用相同的 `AUTH_COOKIE_DIR` 时与 [sap-auth-mcp](https://github.tools.sap/sfsfmcp/sap-auth-mcp) 和 sap-jira-mcp 共享

## 开发

### 从源码构建
```bash
npm run build
```

### 项目结构
```
sap-wiki-mcp/
├── src/                          # TypeScript 源码
│   ├── index.ts                  # 主 MCP 服务器
│   ├── pure-http-client.ts       # API 调用的 HTTP 客户端
│   ├── cookie-storage.ts         # Cookie 管理
│   ├── browser-hybrid-auth.ts    # 浏览器自动化(可选)
│   └── cql_examples.md           # CQL 文档
├── dist/                         # 编译后的 JavaScript
├── tmp/                          # Cookie 存储
│   └── sap_cookies.json         # 共享身份验证 cookie
└── package.json
```

### 调试
- 检查控制台输出以获取详细错误消息
- 验证 `tmp/` 目录中的 cookie 文件
- 测试到 wiki.one.int.sap 的网络连接
- 独立身份验证模式下可使用浏览器调试

## 安全与隐私

- 所有数据请求直接发送到 wiki.one.int.sap
- Cookie 本地存储在 `tmp/` 目录
- 除 SAP 系统外无外部数据传输
- 使用官方 SAP SSO 身份验证
- 仅通过标准化文件与其他 SAP MCP 服务器共享 cookie

## 支持

1. 查看上述故障排除部分
2. 验证 SAP 网络连接
3. 确保 Node.js 和浏览器版本是最新的
4. 对于 [sap-auth-mcp](https://github.tools.sap/sfsfmcp/sap-auth-mcp) 集成问题,请查看该服务器的文档

## 许可

此项目仅供 SAP 内部使用,并遵循 SAP 的内部工具指南。
