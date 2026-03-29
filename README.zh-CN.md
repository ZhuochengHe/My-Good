# 🤖 my-agent

[English](./README.md)

<div align="center">

**从零构建的typescript个人 AI 终端助手**

[![TypeScript](https://img.shields.io/badge/TypeScript-严格模式-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-≥20-339933?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/测试-1481%20通过-brightgreen?style=flat-square)](https://vitest.dev/)
[![License](https://img.shields.io/badge/许可证-MIT-blue?style=flat-square)](LICENSE)

</div>

---

my-agent 是一个完全自主运行的 AI 助手，直接在终端中使用。它可以读写文件、执行 Shell 命令、联网搜索，并在多轮会话之间构建持久化的语义记忆——后端接入多家 LLM 提供商，前端基于 Ink/React 实现流式 TUI。

---

## ✨ 功能特性

### 工具与能力

| 插件         | 工具                                                             | 说明                                              |
| ------------ | ---------------------------------------------------------------- | ------------------------------------------------- |
| `file-ops`   | `read_file`、`write_file`                                        | `write_file` 显示红绿差异对比，执行前需确认       |
| `shell`      | `shell_exec`                                                     | 执行任意 Shell 命令；默认标记为危险操作，需要确认 |
| `web-search` | `web_search`、`fetch_page`                                       | 基于 DuckDuckGo 的搜索，无需 API 密钥             |
| `memory`     | `save_memory`、`search_memory`、`list_memories`、`delete_memory` | 持久化记忆的完整增删改查                          |
| `planning`   | `create_plan`、`update_plan`                                     | 由规划循环内部调用                                |
| `soul`       | `read_soul`、`update_soul`                                       | Agent 在会话间读取并更新自己的 `soul.md` 性格文件 |

### 多提供商 LLM 支持

内置支持 Anthropic（Claude）、OpenAI（GPT）和 Moonshot（Kimi）。其他兼容 OpenAI 接口的服务可通过修改 `providers.json` 接入，无需改动代码。

### 终端界面

基于 [Ink](https://github.com/vadimdemedes/ink)（面向终端的 React）构建，主要特性：
- 流式输出，30ms 打字机节奏
- 工具调用状态实时展示（等待中 / 执行中 / 完成 / 错误）
- 每轮对话显示 Token 用量
- 多步骤斜杠命令（`/memory` 浏览/删除，`/help` 帮助）

---

## 🚀 快速上手

```bash
npm install

# 一键构建并安装到 ~/.local/bin（推荐）
./install.sh

# 初始化：选择提供商、输入 API 密钥、选择模型
my-agent setup
```

`install.sh` 完成后，`my-agent` 即可全局使用。更新代码后重新运行 `install.sh` 即可。

**手动安装：**
```bash
npm run build
# 将 ./bin/my-agent 加入 PATH
```

---

## 💬 使用说明

### 对话

```bash
my-agent chat                             # 交互式 TUI（默认）
my-agent chat -m "总结 README.md"        # 单条消息模式
my-agent chat -s <session-id>            # 继续上一个会话
```

**TUI 内置斜杠命令：**

```
/memory           按类型浏览和删除记忆条目
/memory clear     清空某一类型的全部记忆
/help             列出所有可用斜杠命令
```

### 会话管理

```bash
my-agent session list                     # 列出所有会话
my-agent session list -t debugging        # 按标签筛选
my-agent session show <id> --trace        # 查看逐轮详细指标
my-agent session delete <id>
```

### 其他命令

```bash
my-agent plugin list                      # 查看已加载插件及其工具
my-agent settings set behavior.maxTurns 30
my-agent model update                     # 从提供商刷新模型列表
```

---

## 🧠 记忆系统

记忆系统为 Agent 提供跨会话的持久上下文。每条记忆以独立 JSON 文件的形式存储在 `~/.my-agent/memory/<kind>/<uuid>.json`，通过原子写入（`tmp → rename`，权限 `0o600`）保证一致性。

### 四种记忆类型

| 类型           | 存储内容                     | 有效期 | 注入方式                |
| -------------- | ---------------------------- | ------ | ----------------------- |
| `preference`   | 用户偏好、响应风格、行为规则 | 永久   | 始终写入系统提示        |
| `experiential` | 工作流程、项目经验、常见模式 | 永久   | 按需检索                |
| `semantic`     | 技术架构、领域知识、概念定义 | 永久   | 按需检索                |
| `episodic`     | 当前任务、决策记录、近期 Bug | 带 TTL | 系统提示中注入最近 5 条 |

### 混合检索

检索采用三重信号加权评分：

```
得分 = 0.75 × 余弦相似度
     + 0.25 × BM25-TF（k₁=1.2）
     + 0.10 × 标签重叠度
```

**向量检索**使用 `text-embedding-3-small`（1536 维），通过 HNSW 索引（`hnswlib-node`，M=16，efConstruction=200）实现 O(log n) 近似最近邻查询，取代了 O(n×d) 的全量余弦扫描。

**关键词评分**对 HNSW 召回的候选集执行 BM25-TF（饱和参数 k₁=1.2）重排序。当查询包含专有名词、标识符或精确短语时，关键词信号往往强于余弦相似度，此时重排序效果尤为明显。

**标签加分**以软加权方式处理标签重叠，而非硬过滤——没有匹配标签的相关条目同样能被检索到。

### 内存缓存

两层写回缓存消除了检索热路径上的 O(n) 磁盘 I/O：

- **热层**（`Map`）：`preference` + `experiential` 类型——全量常驻，直写策略
- **LRU 层**（`LruCache`，默认 500 条）：`semantic` + `episodic`——有界缓存，`accessCount` 更新采用 500ms 防抖写回

冷启动时，首次检索会一次性扫描四个类型目录并填充两层缓存；此后所有读操作均从内存服务，不再访问磁盘。

### 性能数据

**向量索引（A1 — `searchByCosine` 延迟）：**

| 索引规模  | 暴力扫描（优化前） | HNSW（优化后） | 提速    |
| --------- | ------------------ | -------------- | ------- |
| 1,000 条  | 2.56 ms            | 0.25 ms        | 10×     |
| 5,000 条  | 14.04 ms           | 0.40 ms        | 36×     |
| 10,000 条 | 28.15 ms           | 0.41 ms        | **69×** |

**混合检索端到端（A2 — HNSW + BM25 + LRU 缓存）：**

| 存储规模 | 优化前（仅 HNSW，无缓存） | 优化后（HNSW + 缓存） | 提速     |
| -------- | ------------------------- | --------------------- | -------- |
| 100 条   | 14.73 ms                  | 0.96 ms               | 15×      |
| 1,000 条 | 111.72 ms                 | 2.37 ms               | **47×**  |
| 5,000 条 | 535.24 ms                 | 3.69 ms               | **145×** |

冷启动后，延迟完全由 HNSW 图遍历和 BM25 CPU 计算决定，不再涉及任何磁盘读取。

### MemBench 评测

在 [MemBench](https://github.com/import-myself/Membench) 基准数据集（`simple.json`，四选一问答，100 条轨迹）上的评测结果：

| 版本           | 描述                              | 准确率    | Recall@10  |
| -------------- | --------------------------------- | --------- | ---------- |
| v2-baseline    | 子串匹配，按时间回退              | 49.0%     | 8.0%       |
| v2-embedding   | `text-embedding-3-small` 余弦检索 | 94.0%     | 100.0%     |
| v3-hnsw-hybrid | HNSW + 混合检索 + LRU 缓存        | **94.0%** | **100.0%** |

v2-baseline 到 v2-embedding 的跃升（准确率 +45pp，Recall@10 +92pp）完全来自对**词汇鸿沟**的修复——子串匹配无法处理语义改写的问题（例如，问"Landon 什么时候出生？"，但存储的是"他的生日是 8 月 23 日"）。v3 在保持相同准确率的前提下，将检索延迟大幅降低。

---

## 🗺️ 规划系统

当 Agent 判断某个请求需要多个独立阶段、跨文件协调或架构决策时，规划循环会自动介入；简单的单轮请求则直接执行，不触发规划。

### 层次结构

```
目标
 ├── 子目标 1
 │    ├── 任务 1.1
 │    └── 任务 1.2
 ├── 子目标 2
 │    └── 任务 2.1
 └── 子目标 3
      └── 任务 3.1
```

每个子目标的任务在执行前才按需生成，而非在规划阶段一次性展开。这样后续子目标可以利用前序子目标的执行结果，避免在计划注定要调整时浪费 LLM 调用。

### 执行流程

1. **目标分解** — LLM 从顶层目标生成子目标列表
2. **懒任务规划** — 每个子目标的具体任务在执行前才生成
3. **执行循环** — 每个子目标最多执行 25 轮工具调用
4. **结果验证** — 三种模式：自动规则检查 / LLM 裁判 / 人工介入
5. **反思重规划** — 验证失败时，Agent 反思并调整计划后重试

---

## 🔌 插件系统

插件是描述工具 Schema 和处理函数路径的 JSON 清单文件。`ToolExecutor` 负责对参数进行 JSON Schema 校验、通过 `Promise.race` 强制超时（默认 30 秒），并在执行危险工具前通过确认回调拦截。

**最小插件清单示例：**

```json
{
  "id": "my-plugin",
  "version": "1.0.0",
  "tools": [{
    "name": "my_tool",
    "description": "做一件有用的事",
    "dangerous": false,
    "parameters": {
      "type": "object",
      "properties": { "input": { "type": "string" } },
      "required": ["input"]
    },
    "handler": "handlers.js"
  }]
}
```

将清单和处理函数放入 `~/.my-agent/plugins/my-plugin/`，启动时会自动发现并加载。

---

## 🛠️ 开发

```bash
npm test                                  # 运行全部 1481+ 个测试
npm run test:coverage                     # 生成覆盖率报告
npm run build                             # 编译 TypeScript
npm run lint                              # ESLint（flat config，严格 TS 规则）

npx vitest run tests/memory               # 仅运行记忆模块测试
npx vitest run tests/planning             # 仅运行规划模块测试
npx vitest bench                          # 性能基准测试
```

---

## ☁️ 支持的提供商

| 提供商      | SDK                | 备注            |
| ----------- | ------------------ | --------------- |
| `anthropic` | Anthropic SDK      | Claude 系列模型 |
| `openai`    | OpenAI SDK         | GPT 系列模型    |
| `kimi`      | OpenAI SDK（兼容） | Moonshot AI     |

其他提供商可在 `providers.json` 中添加配置，无需修改源代码。

---

## 📚 文档

- [系统架构](docs/reference/ARCHITECTURE.md) — 设计概览、组件图、关键决策
- [性能基准](docs/bench.md) — A1–A5 基准测试结果，含优化前后对比
- [MemBench 评测结果](docs/membench-results.md) — 各版本检索准确率评估
