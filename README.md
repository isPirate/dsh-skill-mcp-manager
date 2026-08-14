# dsh-skill-mcp-manager

DSH（DeepSeek Harness）插件：**技能（Skill）与 MCP 服务器管理**。在 Web 设置页提供「技能与 MCP」管理区，并为模型提供 `skillmcp_manage` 工具。

- **技能管理**：列出全部技能、搜索、点击行展开详情、一键启用/禁用（修改 SKILL.md frontmatter，热生效）
- **MCP 管理**：服务器增删改查、启用/禁用（静默切换）、删除确认弹窗、连接状态检测（stdio 进程探测 / HTTP initialize 探测 / 工具注册判定）、文本格式化导入（JSON 美化、YAML 规范化）
- **文本添加**：支持 YAML、Claude .mcp.json 键名形式 JSON（名称即键），带模板、格式化、解析预览三步流程
- 配置写入 `~/.dsh/cordis.patch.yml`（MCP）与技能文件 frontmatter（技能），**热生效，无需重启**

## 结构

```
src/index.js     宿主端：/api/dsh-skill-mcp 路由族 + skillmcp_manage 工具 + 系统提示声明
src/client.js    浏览器端：「技能与 MCP」设置区（ModuleLoader bundle 格式）
cordis.patch.yml 包自带组合补丁（挂载行）
scripts/build.mjs 构建：src → lib 复制 + 契约校验
```

## 构建

```bash
npm run build
```

纯 JavaScript，无需 TypeScript/打包器；`lib/` 由构建脚本生成（发布时 `files` 只带 `lib`、`src`、`cordis.patch.yml`、`README.md`）。

## 安装（DSH web profile）

方式一：作为 npm 依赖安装（发布后）

```bash
npm i dsh-skill-mcp-manager   # 在 ~/.dsh/profiles/web 下
```

方式二：本地开发链接（参考 dsh-ssh 的挂载方式）

```bash
dsh plugin --profile web add link:<本仓库路径>
```

方式三：手工挂载——把包放进 profile 的 `node_modules`（或工作区），并在
`~/.dsh/profiles/web/cordis.patch.yml` 加入：

```yaml
- insert:
    - id: skill-mcp-manager
      name: 'dsh-skill-mcp-manager'
```

宿主端立即热挂载（补丁监听），浏览器端刷新页面后出现「技能与 MCP」设置区。

## 环境要求

- DSH `>= 0.1.0-rc.6`（`@deepseek-ai/dsh-web-app` web profile）
- Node `^22.19.0 || >=24.0.0`

## 许可

MIT
