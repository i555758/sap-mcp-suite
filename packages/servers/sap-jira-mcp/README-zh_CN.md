# SAP Jira MCP (v2)

[English](./README.md) | 中文

MCP (Model Context Protocol) 服务器，用于 SAP Jira 搜索和工单其他管理功能。

> 此服务器是 [sap-mcp-suite](../../../README.md) 的一部分。请参阅根目录 README 了解安装和设置。

## 可用工具

### 核心工单操作
1. **create_issue**：创建新的 Jira 工单
2. **search_issues**：使用高级过滤器搜索工单（支持 sprint、JQL 扩展等）
3. **get_issue**：获取特定工单的详细信息
4. **update_issue**：更新现有工单的字段
5. **delete_issue**：删除工单（谨慎使用）

### 评论操作
6. **add_comment**：为工单添加评论
7. **delete_comment**：删除工单的评论

### 用户信息查询
8. **get_user_info**：获取用户的详细信息（姓名、邮箱、显示名称等）
9. **get_user_id**：获取用户 ID（可用作 assignee）

### 字段元数据查询
10. **get_field_metadata**：获取特定字段的元数据
11. **get_field_metadata_by_name**：通过字段名称获取字段元数据
12. **get_required_fields_structure**：获取创建特定类型工单所需的字段结构
13. **get_project_issue_types**：获取项目的所有工单类型

### Sprint 管理
14. **get_issue_sprint_values**：获取特定工单的 sprint 值
15. **get_project_sprint_values**：获取项目的 sprint 值
16. **update_issue_sprint**：更新工单的 sprint（使用 Agile API）

### JQL 查询辅助
17. **jql_examples**：获取包含当前 SAP Jira 元数据的 JQL 示例（项目、字段、状态等），帮助构建有效的 JQL 查询

## 使用示例

### 搜索工单
```json
{
  "tool": "search_issues",
  "arguments": {
    "projectKey": "MOB",
    "jql": "status = Open",
    "maxResults": 20
  }
}
```

### 获取工单详情
```json
{
  "tool": "get_issue",
  "arguments": {
    "issueKey": "MOB-12345"
  }
}
```

### 创建新工单
```json
{
  "tool": "create_issue",
  "arguments": {
    "projectKey": "MOB",
    "summary": "修复登录错误",
    "description": "最新部署后用户无法登录",
    "type": "Story"
  }
}
```

### 更新现有工单
```json
{
  "tool": "update_issue",
  "arguments": {
    "issueKey": "MOB-12345",
    "summary": "更新后的摘要",
    "description": "更新的描述"
  }
}
```

### 为工单添加评论
```json
{
  "tool": "add_comment",
  "arguments": {
    "issue_key": "MOB-12345",
    "comment": "已重现问题，修复正在进行中"
  }
}
```

### 删除评论
```json
{
  "tool": "delete_comment",
  "arguments": {
    "issue_key": "MOB-12345",
    "comment_id": "12345"
  }
}
```

### 获取用户信息
```json
{
  "tool": "get_user_info",
  "arguments": {
    "username": "i123456"
  }
}
```

### 获取用户 ID
```json
{
  "tool": "get_user_id",
  "arguments": {
    "username": "张三"
  }
}
```

### 获取字段元数据
```json
{
  "tool": "get_field_metadata",
  "arguments": {
    "fieldId": "customfield_10240"
  }
}
```

### 获取创建工单所需的字段结构
```json
{
  "tool": "get_required_fields_structure",
  "arguments": {
    "projectKey": "MOB",
    "issueType": "Story"
  }
}
```

### 获取项目的工单类型
```json
{
  "tool": "get_project_issue_types",
  "arguments": {
    "projectKey": "MOB"
  }
}
```

### 获取工单的 Sprint 值
```json
{
  "tool": "get_issue_sprint_values",
  "arguments": {
    "issueKey": "MOB-12345"
  }
}
```

### 更新工单的 Sprint
```json
{
  "tool": "update_issue_sprint",
  "arguments": {
    "issueKey": "MOB-12345",
    "sprintId": 12345
  }
}
```

### 删除工单（谨慎使用！）
```json
{
  "tool": "delete_issue",
  "arguments": {
    "issueKey": "MOB-12345"
  }
}
```

### 获取 JQL 示例和元数据
```json
{
  "tool": "jql_examples",
  "arguments": {}
}
```

## 高级功能

### Sprint 管理
本工具支持完整的 Sprint 管理功能：
- 查询工单的 Sprint 信息
- 查询项目的所有 Sprint
- 移动工单到不同的 Sprint

### 字段元数据查询
可以查询任何自定义字段的元数据信息，帮助理解字段的类型、可选值等：
- 通过字段 ID 查询（如 `customfield_10240`）
- 通过字段名称查询
- 查询创建特定类型工单所需的所有必填字段

### 用户管理
支持查询用户信息和获取用户 ID，用于工单分配等操作。

## 模板配置

### 配置 `.jira-config.json` 文件

`.jira-config.json` 是工单创建模板配置文件。

如果你的 Mac 不允许查看隐藏文件，请输入以下命令：

```bash
defaults write com.apple.finder AppleShowAllFiles -bool TRUE

killall Finder
```

**注意事项**：
- 首次使用时必须修改默认模板值。支持按项目配置模板，以适应不同的工单类型，并可以动态添加字段到默认值。

- 如果你不想设置创建模板，也支持使用现有工单作为参考模板来创建新工单，这样可以将该工单的字段值复制到新工单中。

**配置示例**：

```json
[
  {
    "projectKey": "MOB", // SF Mobile Applications (MOB) from https://jira.tools.sap/rest/api/2/project
    "create_issue_template": [
      {
        "type": "Test",  // 工单类型 (Test, Epic, Story, Activity, Task, Sub-Task)
        "summary": "",   // 必填
        "description": "", // 默认使用 summary 的值
        "issuetype": {"id": "11902"}, // 可选 - 如果不提供可以从项目查询
        "assignee": "I530424", // 必填 - 修改为你的 inumber
        "labels": ["CT-automation-test-cases"],
        "components": [{"name": "Org-Chart"}], // 组件
        "priority": {"name": "Medium"},
        "customfield_10240": {"value": "Functional Integration"}, // 测试分类
        "customfield_44240": { // 测试自动化类型
          "value": "Mobile",
          "child": {"value": "CT-Component"}
        },
        "customfield_43758": [{"value": "Mobile Client(Android)"}], // 技术栈
        "customfield_22442": {"value": "Manual"}, // 测试类型: Manual, Generic, Cucumber
        "customfield_22453": {"value": "/SHG - Blue/Android/CT/Org Chart"}, // 测试仓库路径
        "customfield_44241": {"value": ""} // Git 路径
      },
      {
        "type": "Story",
        "summary": "你的 Story 摘要/标题",
        "description": "Story 的详细描述",
        "issuetype": {"id": "10500"},
        "assignee": "I530424",
        "components": [{"name": "Deeplink"}],
        "priority": {"name": "Medium"},
        "customfield_43758": [{"value": "Mobile Client(Android)"}],
        "customfield_15140":""
      }
      // 可以添加更多模板用于 Story, Activity, Task, Sub-Task 等
    ]
  },
  {
    "projectKey": "WRK",
    "create_issue_template": [
      // WRK 项目的模板配置
    ]
  }
]
```

**模板说明**：
- **projectKey**：项目键值，可以从 https://jira.tools.sap/rest/api/2/project 查询
- **create_issue_template**：该项目的创建工单模板数组
- **type**：工单类型，必须与模板中的 type 字段匹配
- **必填字段**：`summary` 和 `assignee` 通常是必填的
- **自定义字段**：以 `customfield_` 开头的字段是自定义字段，不同项目和工单类型可能有不同的自定义字段
- **字段 ID 查询**：可以使用 `get_field_metadata` 或 `get_required_fields_structure` 工具查询字段 ID 和元数据

**使用模板创建工单**：
- 指定 `projectKey` 和 `type` 参数时，会自动匹配对应的模板
- 可以覆盖模板中的任何字段值
- 如果不使用模板，可以通过指定现有工单的 key 来复制其字段值

## 环境变量

### 通用配置
- **`JIRA_DOMAIN`**：Jira 服务器域名
  - 默认值：`jira.tools.sap`
  - SAP 内部测试环境可能使用不同的域名
  - 如果不设置，默认使用 `jira.tools.sap`

- **`JIRA_CONFIG_DIR`**：配置文件路径（可选）
  - 用于存储 `.jira-config.json` 配置文件的目录
  - 默认值：`dist/` 目录（模块安装位置）
  - 通常不需要手动设置

### Cookie 认证相关
- **`AUTH_COOKIE_DIR`**：Cookie 存储目录（可选）
  - Cookie 文件将以 `sap_cookies.json` 的文件名存储在此目录中
  - 默认值：`./tmp/sap_cookies.json`
  - 建议设置为固定路径，以便多个 MCP 服务共享同一认证会话

### API Token 认证相关
- **`JIRA_API_TOKEN`**：Jira API token
  - 从 Jira 账户设置中生成的 API token
  - 用于标准 Jira API 认证
  - 设置此变量后，将自动使用 API Token 认证，不再使用 Cookie 认证

## 认证方式

本 MCP 服务器支持两种认证方式：

### 1. Cookie 认证（推荐，基于个人用户的角色，更安全）

Cookie 认证使用由 [sap-auth-mcp](../sap-auth-mcp/) 管理的 SSO 会话 cookies。

- `JIRA_DOMAIN`：Jira 域名（例如："jira.tools.sap"），默认值为 "jira.tools.sap"
- `AUTH_COOKIE_DIR`：存储 cookies 的目录（可选，默认为 `./tmp`）

**注意：** Cookie 认证需要配合 [sap-auth-mcp](../sap-auth-mcp/) 来处理认证流程。

### 2. API Token 认证（可选，一般用于服务器运行，例如 CI/CD 场景）

API Token 认证使用 Jira API tokens，适用于需要 token 认证的场景。

- `JIRA_DOMAIN`：Jira 域名（例如："jira.tools.sap" 或其他 SAP 内部测试环境）
- `JIRA_API_TOKEN`：Jira API token（从 SAP Jira 管理团队申请获取）

**如何获取 Jira API token：**
- [需要获取SAP Jira账户，非个人](https://wiki.one.int.sap/wiki/display/SAPJira/REST+Services+FAQs#RESTServicesFAQs-HowdoIgetatechnicaluser?technical-user)
- [Access Token 生成](https://wiki.one.int.sap/wiki/display/SAPJira/REST+Services+FAQs#RESTServicesFAQs-HowdoIgenerateanSAPJirapersonalaccesstokenfortechnicaluser?)

## 错误处理

### 结构化认证错误

当需要认证时，MCP 返回结构化的 JSON 错误：
```json
{
  "error": "SAP_AUTH_REQUIRED",
  "details": "Need call SAP auth MCP to prepare cookie and redo function after.",
  "data": {
    "store_path": "/path/to/cookie/directory",
    "entry_url": "https://jira.tools.sap/"
  }
}
```

### 其他常见错误

- `NETWORK_ERROR`：检查与 jira.tools.sap 的连接
- `TICKET_NOT_FOUND`：无效的工单键或无访问权限
- `INVALID_TICKET_KEY`：工单键格式不正确
- `JQL_ERROR`：JQL 查询语法无效

## 故障排除

### 常见问题

**"无法连接到 MCP 服务器"**
- 验证客户端配置中 `dist/index.js` 的路径是否正确
- 确保项目已构建：`npm run build`
- 检查 Node.js 是否已安装并可访问

**"需要认证" 错误**
- 确保 [sap-auth-mcp](../sap-auth-mcp/) 已配置并认证
- 检查 `tmp/sap_cookies.json` 中是否存在 cookies
- 验证 sap-auth-mcp 中的 `SAP_AUTH_ACCOUNT` 环境变量是否已设置
- 确保您有权访问 jira.tools.sap

**"JQL 查询失败"**
- 先使用 `jql_examples` 工具获取当前元数据
- 验证项目名称和字段 ID 是否正确
- 先使用简单查询测试 JQL 语法

### 调试模式

启用详细日志：
```bash
DEBUG=* npm start
```
