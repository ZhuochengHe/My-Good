# 🤖 my-agent

[English](./README.md)

<div align="center">

**你的个人AI终端助手** 💬✨

[![TypeScript](https://img.shields.io/badge/TypeScript-严格模式-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-≥18-339933?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Vitest](https://img.shields.io/badge/测试-Vitest-6E9F18?style=flat-square)](https://vitest.dev/)

*会聊天、能干活、记得你 —— 完全用TypeScript从零构建的AI助手*

</div>

---

## 🌟 亮点特性

### 🛠️ **多工具协作**
- 📁 **文件操作** — 读写文件、浏览目录
- 💻 **命令行** — 执行shell命令（带安全确认）
- 🌐 **网络搜索** — DuckDuckGo搜索，无需API密钥
- 🧠 **智能记忆** — 跨会话持久化记忆
- 📋 **任务规划** — 复杂任务自动分解执行

### 🎯 **多模型支持**
- 🔥 **Claude** (Anthropic) — 最强推理能力
- 💡 **GPT** (OpenAI) — 稳定可靠
- 🚀 **Kimi** (Moonshot) — 中文优化
- 🔧 **自定义** — 任何OpenAI兼容API

### ⚡ **智能体验**
- 🎬 **实时流式输出** — 打字机效果
- 🔒 **安全确认** — 危险操作需确认
- 📊 **会话管理** — 完整的会话生命周期
- 🔌 **插件扩展** — 轻松添加新功能

---

## 🚀 快速开始

```bash
# 📦 安装依赖
npm install

# 🔧 一键安装（推荐）
./install.sh   # 构建并安装到 ~/.local/bin

# ⚙️ 初始化配置
my-agent setup # 选择提供商，输入API密钥，选择模型
```

> 💡 `install.sh` 会自动构建项目，创建软链接，并检查PATH配置。更新代码后重新运行即可！

### 📝 手动安装
```bash
npm run build
# 将 ./bin/my-agent 添加到 PATH
```

---

## 💬 使用指南

### 🎯 基础聊天
```bash
my-agent chat                           # 🔄 交互式REPL
my-agent chat -m "总结README.md"       # 📋 单条消息模式
my-agent chat -s <session-id>          # 📂 继续之前的会话
```

### 📊 会话管理
```bash
my-agent session list                   # 📋 列出所有会话
my-agent session list -t debugging      # 🔍 按标签筛选
my-agent session show <id> --trace      # 📈 查看详细指标
my-agent session delete <id>            # 🗑️ 删除会话
```

### ⚙️ 其他命令
```bash
my-agent plugin list                    # 🔌 查看已加载插件
my-agent settings set behavior.maxTurns 30
my-agent model update                   # 🔄 获取最新模型列表
```

---

## 🧠 记忆系统

> 🎯 **目标**：让AI真正记住你，而不是每次都重新开始

my-agent拥有**四层记忆结构**，自动构建持久化记忆：

### 📚 记忆类型

| 🏷️ 类型         | 💾 存储内容                   | ⏰ 有效期 | 🎯 使用场景 |
| -------------- | ---------------------------- | -------- | ---------- |
| `preference`   | 用户偏好、响应风格、行为规则 | 🚫 永久   | 💯 始终注入 |
| `experiential` | 工作流、技巧、项目经验       | 🚫 永久   | 🔍 按需搜索 |
| `semantic`     | 技术架构、领域知识           | 🚫 永久   | 🔍 按需搜索 |
| `episodic`     | 当前任务、决策、bug          | 📅 有TTL  | 🕐 最近5条  |

### 🎯 智能检索

采用**三重信号混合评分**：

```
📊 总分 = 0.75×语义相似度 + 0.25×关键词匹配 + 0.10×标签重叠
```

- 🔍 **语义搜索**：基于`text-embedding-3-small`的向量相似度
- 🔤 **关键词匹配**：BM25算法，饱和参数k₁=1.2
- 🏷️ **标签增强**：智能标签匹配，避免硬过滤

### 📈 性能表现

在[MemBench](https://github.com/import-myself/Membench)基准测试中：

| 📅 日期     | 🔢 版本       | 🎯 准确率  | 🔍 Recall@10 | 💡 提升    |
| ---------- | ------------ | --------- | ----------- | --------- |
| 2026-03-23 | v2-baseline  | 49.0%     | 8.0%        | 基线      |
| 2026-03-24 | v2-embedding | **94.0%** | **100.0%**  | **+45pp** |

> 🚀 **45个百分点**的准确率提升！从词汇匹配转向语义搜索带来的巨大飞跃。

---

## 📋 规划系统

### 🎯 何时启动

智能复杂度检测：
- ✅ **简单任务** — 直接执行，无需规划
- 🎯 **复杂任务** — 自动启用规划模式（3+阶段、多文件、设计决策）

### 🗺️ 三层架构

```
🎯 目标: "构建带认证和测试的REST API"
  │
  ├─ 📝 sg-1: "设计API架构和路由"
  │     ├─ ✅ 创建OpenAPI规范
  │     └─ ✅ 定义请求响应类型
  │
  ├─ 🔐 sg-2: "实现认证中间件"
  │     ├─ ✅ JWT验证处理器
  │     └─ ✅ 路由认证配置
  │
  └─ 🧪 sg-3: "编写集成测试"
        └─ ✅ 认证失败路径覆盖
```

### 🔄 执行流程

1. **🎯 前期规划** — 目标+子目标
2. **📝 懒加载任务** — 执行前才规划具体任务
3. **⚡ 循环执行** — 带验证和重试机制
4. **✅ 结果验证** — 自动/LLM/人工验证

---

## 🔌 插件生态

| 🔌 插件       | 🛠️ 工具集   | 💡 描述                   |
| ------------ | ---------- | ------------------------ |
| `file-ops`   | 📁 文件操作 | 读写文件、目录浏览       |
| `shell`      | 💻 命令行   | 执行shell命令（需确认）  |
| `web-search` | 🌐 网络搜索 | DuckDuckGo搜索、网页获取 |
| `memory`     | 🧠 记忆管理 | 完整的记忆CRUD操作       |
| `planning`   | 📋 任务规划 | 复杂任务的规划执行       |

### 🚀 创建插件

```json
{
  "id": "my-plugin",
  "version": "1.0.0",
  "tools": [{
    "name": "my_tool",
    "description": "做有用的事情",
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

---

## 🛠️ 开发指南

```bash
# 🧪 运行测试（1481+测试用例）
npm test

# 📊 测试覆盖率
npm run test:coverage

# 🔨 构建项目
npm run build

# 🔍 代码检查
npm run lint

# 🎯 模块测试
npx vitest run tests/memory    # 仅记忆模块
npx vitest run tests/planning  # 仅规划模块
```

---

## 🏢 支持的提供商

| 🏢 提供商    | 🔗 SDK         | 📝 备注                    |
| ----------- | ------------- | ------------------------- |
| `anthropic` | Anthropic SDK | Claude模型系列            |
| `openai`    | OpenAI SDK    | GPT模型系列               |
| `kimi`      | OpenAI SDK    | Moonshot AI（OpenAI兼容） |

> 🔧 **添加自定义提供商**：只需在`providers.json`中添加配置，无需修改代码！

---

## 📚 深入了解

- 🏗️ **架构文档** — [`docs/reference/ARCHITECTURE.md`](docs/reference/ARCHITECTURE.md)
- 📊 **基准测试** — [`docs/benchmark-adaptation.md`](docs/benchmark-adaptation.md)
- 📈 **性能结果** — [`docs/bench-results.md`](docs/bench-results.md)

---

<div align="center">

### 🌟 如果这个项目帮到了你，请给个Star！

**[⭐ 点击这里给my-agent加星](https://github.com/ZhuochengHe/my-agent)**

*Made with ❤️ by TypeScript enthusiasts*

</div>