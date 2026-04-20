# Interview Prep — AI Agent 技术拷打记录

## Q1 — 偏好类全量注入 vs 按需检索

**问题**: 为什么 preference 全量注入，experiential 按需搜索？代价？

**我的回答**:
- preference 全量注入维持 agent 人设和行为，避免频繁查询开支，且偏好类设计上数量少
- 如果 preference 数量过多：优先记忆融合更新，或偏好分区索引 + 向量查询

**追问：记忆融合实现？信息丢失风险？**
- 融合由 LLM 执行，cosine > 0.8 触发
- 承认目前没有测试融合质量

**改进建议（面试官给出）**:
- Golden set：手写 20-30 对"应合并"记忆对，标注必须保留的关键字段
- LLM-as-judge：检查合并结果是否包含原两条的关键信息
- 边界测试：矛盾版本记忆应产生歧义标注而非静默覆盖

---

## Q2 — 混合 RAG 权重来源

**问题**: 0.75 / 0.25 / 0.1 怎么来的？如何系统性优化？

**我的回答**:
- 参考主流 0.7+0.3，tag 维度与 BM25 部分重合所以拿走一部分权重
- 系统性优化：引入/设计数据集，通过监督学习调参

**评价**: 回答合理，权重来源诚实（非实验调出），优化方向正确。

---

## Q3 — HNSW 参数选择

**问题**: M=16, efConstruction=200, efSearch=50 为何选这组？

**我的回答**:
- 兼顾速度和 recall，M 调大 recall 高但慢、内存大
- MemBench Recall@10=100% + 自用验证

**追问：MemBench 有没有 OOD 覆盖？**
- MemBench 是论文引入的，不算很难
- 个人项目没必要单独构建数据集

**需要改进**:
- 面试时要主动说"轻度自用验证"，不要等被追问才提
- MemBench v2-embedding → v3-hnsw-hybrid：94% 准确率和 Recall@10=100% 均持平，HNSW 在 100 条 trajectory 规模下速度优势仅 ~0.25ms vs ~2.5ms，真正收益在更大规模的 O(log n) 扩展性

---

## Q4 — tag_overlap query 无 tag 时的处理

**问题**: query 无 tag 时 tag_overlap 恒为 0，feature 还是 bug？

**我的回答**:
- tag 不是强信号，query 不清晰时缺失 tag 信号影响不大
- 倾向减少语义不清晰时查询 memory 的频率

**追问：减少频率怎么实现的？**
- 可以加规则判断（query 无 tag 时不查询）
- 复杂任务 planning/task 执行时强制检索，普通问答漏查影响较小

**需要改进**:
- 面试时要区分"现在已实现"vs"可以做的改进"，避免混淆被追问

---

## Q5 — JsonEmbeddingIndex vs HNSW 切换时机

**问题**: 什么时候切换？切换代价？8000 条用哪个？

**我的回答**:
- 手动切换（可自动化），启动时检测 >2000 条自动切换
- 后台构建 HNSW，构建完切换

**需要改进（面试官追问未答到）**:
- 构建期间的新写入如何处理？新记忆在 HNSW 构建期间写入旧 JsonEmbeddingIndex，切换后需要确认这部分记忆是否已包含在 HNSW 图中，还是需要重新 addPoint

---

## Q6 — 复杂度分类器准确率

**问题**: LLM 分类错误代价？false positive vs false negative？

**我的回答**:
- 没有测试分类器准确率
- false negative（复杂任务未规划）更危险，可能导致错误执行
- 用户可从 UI 看到是否有规划，可主动要求/否决
- 面向普通用户需要优化这块

**评价**: 门控设计思路正确，承认未测试是加分项。

---

## Q7 — 重规划触发机制

**问题**: Subgoal 1 偏差大时，Subgoal 2 tasks 尚未生成，重规划怎么触发？

**我的回答**:
- LLM 在阶段完成后进行反思
- Subgoal 1 replan 不影响 Subgoal 2 的 tasks（惰性生成的好处）
- Verification method 多种：LLM as judge、人类判断、硬性条件判断

---

## Q8 — tool call/result 配对截断

**问题**: result 很长时，整对保留还是整对丢弃？

**我的回答**:
- 对 result 内容做截断，通过标签告知 LLM 被截断的事实，保留 tool call

**评价**: 比整对丢弃更合理，保留了调用上下文。

---

## Q9 — 主动 mid-session summarization

**问题**: 什么时候加？技术难点？

**我的回答**:
- 复杂问题或 tool call/result 过长时需要
- 目前上下文到一定长度自动调用 compact
- 难点：保留多少 tool call/result 不丢失信息，去噪保留精华，达到足够压缩度

**追问：幂等性是什么意思？**
→ 见下方面试官解答

**改进建议（面试官给出）**:
见下方

---

## Q10 — planning 和 memory 的交互

**问题**: task 执行时如何获取 memory？强制注入 vs agent 自主查询？

**我的回答**:
- 目前让 agent 做 task 时主动查询
- 强制注入：保证相关记忆进入上下文，不依赖 agent 自觉性，但粒度粗、噪声多、token 高
- 自主查询：精确但依赖 agent 自主性
- 合理分层：preference + experiential 强制注入，semantic + episodic 按需搜索

**评价**: 这个分层策略和实际设计完全吻合，回答很好。

---

## Q9 深入讨论 — Mid-session Summarization 幂等性

**幂等性问题本质**:
- 把 tool result 内容交给 LLM 摘要，摘要再被下一轮 LLM 摘要 → 每轮都在"理解上一轮的理解"，误差叠加
- 自然语言层可以多轮 compact（语义漂移有限）
- Tool 结构层不能语义摘要，只能做内容截断

**正确方案：分层压缩**:
- 自然语言层 → 多轮 compact 可接受
- Tool call/result 层 → 只保留元数据骨架（确定性生成，不经过 LLM）：
  `{ tool: "write_file", args: { path: "src/foo.ts" }, status: "success", summary: "wrote 42 lines" }`
- 骨架永远保留，不做语义摘要，多轮压缩后不漂移

**和 Q8 的关系**: Q8 是空间截断（保留 tool call + 截断标签），Q9 是语义压缩——两者都在保护结构化信息不被"语言化"。

---

## Q11 — 插件权限细粒度设计

**问题**: dangerous: true 是 binary，git status 和 rm -rf 处理一样

**我的回答**: 读操作改成 safe，含改动/写入/删除的需要批准

**更完整的答案**:
- 按操作副作用不可逆程度分级：只读免审批，可逆写操作需确认，不可逆操作（delete/网络请求）强制审批 + 日志

---

## Q12 — 插件热加载

**问题**: ESM dynamic import 有模块缓存，热加载实际不生效

**我的回答**: 承认热加载不生效，实际需要重新 load 所有插件、重新注册工具

**真正的热加载方案**: 给 import URL 加 `?t=timestamp` query string 绕过缓存，或用 worker_threads 隔离模块实例

---

## Q13 — Execution Loop 取消机制

**问题**: tool 执行中途取消，副作用已发生怎么处理？

**我的回答**: loop 等待 tool 完成；取消后 conversation history 记录 tool call、tool result（已完成）和 aborted message

**追问（未答到）**: aborted message 是 synthetic 还是 LLM 返回的？影响后续 resume 时 LLM 对上下文的理解。

---

## Q14 — Agent 可靠性与安全机制

**问题**: agent 最容易失控的情况？最重要的安全机制？

**我的回答**: 复杂任务执行过长时怕中途打断；最重要的是用户可观察 + 随时终止；现在只有 Ctrl+C

**更完整的答案**:
- 观察和终止不够，副作用已发生
- 更完整：操作前 dry-run 预览、危险操作事务性（能 rollback）、agent 主动 self-check（"我接下来的操作是否超出授权范围"）

---

## Q15 — 框架对比

**问题**: 了解 LangGraph/AutoGen/Swarm 吗？为什么自己实现？

**我的回答**: 只听说过 LangGraph 以图为基础做 planning，有 checkpoint；选择自实现是为了学习，遇到真实抉择学到的比用框架多；承认对各框架优劣不够了解

**框架全景（面试官补充）**:

| 框架 | 核心抽象 | 适合 | 不适合 |
|---|---|---|---|
| LangGraph | 有向图，原生 checkpoint/replay | 状态机清晰、流程固定 | 动态规划（你的场景） |
| AutoGen | 多 agent 对话，角色分工 | 多视角协作任务 | 单 agent 深度执行，难 debug |
| CrewAI | crew + role + task 分配，高层封装 | 快速原型/demo | 生产环境，可控性差 |
| OpenAI Swarm/Agents SDK | agent handoff，换 system prompt | 路由/客服 | 复杂规划 |
| Anthropic Agents SDK | tool use loop，原生 computer use | Claude 深度集成 | 无原生 planning/memory |
| 自实现（你的） | 线性执行循环 + 动态规划层 | 动态 subgoal 生成，精细控制 | 多 agent 协作 |

**面试时的句式**: "我选择自实现是因为 X 框架的核心抽象和我的需求有根本冲突——LangGraph 要求静态图，但我的 subgoal 是运行时生成的。" 比"为了学习"更有说服力，两个理由都说。

---

## Planning Loop 上下文流设计（改进方案）

**现状问题**:
- conversationHistory 跨 subgoal 全量累积，无截断，长任务会撑爆 context window
- tasks 在同一个 execution loop run() 里，无独立边界
- task 总结里没有保留失败路径信息
- planning 阶段和执行阶段用同一工具集，有越界风险

**改进后的上下文流**:

```
Task 执行时收到：
  ├── 当前 task title
  ├── 已完成 tasks 的结构化总结
  │     ├── outcome（做了什么）
  │     ├── artifacts（产物路径）
  │     └── failed_attempts（失败的尝试，防止重蹈覆辙）
  └── 当前 subgoal description

Task 执行后保留：
  ├── outcome
  ├── artifacts
  ├── failed_attempts
  └── 丢弃 raw tool call/result

Subgoal 结束后传给下一个 Subgoal：
  ├── 本 subgoal 的 outcome 一句话总结
  ├── artifacts 列表
  └── 丢弃 task 级别细节

Replan 时注入：
  ├── 已完成 tasks 的总结（同上，已有）
  └── reflection.nextAction

Planning 阶段：
  └── 只读工具集，物理隔离副作用（参考 Claude Code plan mode）
```

**参考**: Claude Code compaction summary 结构（context-compaction-summary.md）专门保留 "failed attempts" 字段，这是 tool call/result 里最有价值、最容易在压缩中丢失的信息。

**核心原则**: 上下文粒度和决策粒度匹配——task 级别决策不需要看 subgoal 外的历史，subgoal 级别决策不需要看 task 的 tool call 细节。

---

## Q16 — Agent 最大工程挑战

**我的回答**: Harness engineering——给 LLM 这个随机系统配上好的马具，通过 hard-coded/judged 方法带来确定性

**补充**:
- 确定性不是"消除随机"，而是**缩小随机的影响范围**
- LLM 的概率性留在"怎么做"，系统的确定性体现在"做没做到"
- 机制：hard gate 保证不越界，structured output 保证格式可解析，retry + verification 保证结果收敛

---

## Q17 — Tool 设计原则

**我的回答**: tool 独立性 + description 准确性；解耦降低系统复杂度，description 不好会导致漏用/错用

**补充**:
- 再加一条：**tool 粒度**
- 粒度太粗：LLM 不知道何时该用
- 粒度太细（10 个相似 tool）：LLM 选择困难
- 最优粒度："一个 tool 对应一个清晰的意图"

---

## Q18 — LLM 何时调用 search_memory

**我的回答**: 现在是模型自主调用；纯粹依赖 LLM 不够 robust；改进方向：RL 强化训练 + prompt 教学（新话题/user 要求干活/user 提到"我上次"） + 正则匹配（"你记得"）

**评价**: 三层都说到了，思路完整。正则匹配是最实用的 quick win。

---

## Q19 — Agent Eval 设计

**我的回答**: 很难 eval，无法 track 用户使用；平均 token 使用是一个维度；94% accuracy 和生产 eval 不是同一维度；人们满意度太抽象

**补充 — Agent eval 三层框架**:
1. **任务成功率**（最重要）：给定明确任务，有没有正确完成？需要 golden answer 或 LLM-as-judge
2. **过程质量**：完成任务用了多少 turn/token/工具调用？平均 token 属于这层，是对的
3. **失败模式分析**：agent 在什么情况下失败？工具选错、规划失败、还是 LLM 幻觉？

**实际操作**: 建 20-50 个真实用户任务的 golden test suite，手动标注"正确完成"标准，LLM-as-judge 自动评分。

---

## Q20 — 遇到的最难工程问题

**我的回答**: Vibe coding 为主，不知道怎么回答

**面试替代答案**:
- 不说"我是 vibe coding 的"
- 把问题转成"设计决策层面遇到的最难判断"：
  > "最难的不是 bug，是系统行为不可预测的边界——比如记忆融合的 cosine 阈值选 0.8 还是 0.9、HNSW 切换时机、写回 LRU 的 debounce 时间。这些决策错了，系统不会报错，但行为会悄悄漂移。"
- 这是你真正有发言权的领域，比强行编 debug 故事更诚实有力

---

# 第二轮面试 — 全栈开发视角（2026-04-13）

侧重点：Plugin 系统设计、TypeScript 工程、React/Ink 前端、性能优化、系统设计开放题。

---

## Q1 — Plugin 系统：参数校验与危险工具拦截

**问题**: ToolExecutor 怎么做参数校验和危险工具拦截？为什么选 JSON manifest + handler 架构而不是硬编码？

**我的回答**:

1. **两阶段校验**:
   - 加载期：Zod 对 plugin.json manifest 做结构校验（递归 z.lazy()）
   - 执行期：validateParameters 手写轻量校验（type/enum/required），对未知参数宽松跳过（容错 LLM 额外字段）

2. **dangerous 拦截**：回调注入模式
   - ToolExecutor 接收 `DangerousToolConfirm` 回调，executor 本身不知道如何确认
   - 调用方可注入 readline 提示（生产）、mock return true（测试）、权限系统查询（企业）
   - manifest 里 `"dangerous": true` 标志，PluginManager.isToolDangerous() 读取

3. **超时**：`Promise.race` + 自定义 TimeoutError，默认 30s，manifest 可覆盖

4. **架构选择 trade-off**：
   - manifest 架构：新工具零框架改动、用户/第三方可扩展、测试隔离（独立 handler 模块）
   - 代价：动态 import() 加载失败只在运行时暴露，非编译期

**面试官评价**: 回答扎实，细节到位。回调注入的依赖反转、宽松校验的容错设计、manifest vs 硬编码的 trade-off 表格都说到了。

---

### 追问 Q1.1 — 加载失败的 Partial Failure 处理

**问题**: PluginManager 启动时 handler 加载失败，是 fail-fast 还是跳过？

**我的回答**: 返回 loaded/failed 状态，跳过坏插件继续启动。Plugin 是扩展不是核心功能，不应拖垮主进程。

**面试官评价**: 方向正确。

### 追问 Q1.1.1 — 失败插件工具后续执行

**问题**: LLM 调用属于加载失败插件的工具时会发生什么？

**我的回答**: LLM 无法看到加载失败的插件工具，因此不会调用。

**面试官评价**: 正确。

### 追问 Q1.1.2 — "看不到"的实现层

**问题**: 是 PluginManager 不注册，还是构建 tools 数组时过滤？

**我的回答**: PluginManager 加载失败时根本不往 ToolExecutor 注册。

**面试官评价**: 正确。面试官表示减少追问粒度。

---

## Q2 — 混合检索权重与 BM25-TF

**问题**: `score = 0.75 × cosine + 0.25 × BM25-TF + 0.10 × tag_overlap`，三个权重怎么来的？为什么用 BM25-TF 而不是完整 BM25？

**我的回答**:
- 权重参照业内常用参数（0.7 cosine + 0.3 BM25），tag overlap 从 BM25 分了权重
- BM25-TF 没有 IDF——个人 agent 语料太小，IDF 不稳定

**面试官评价**: IDF 在小语料下不稳定这个 reasoning 正确。

### 追问 Q2.1 — BM25-TF 饱和参数 k₁

**问题**: k₁=1.2 做什么的？调大/调到 0 有什么变化？

**我的回答**: k₁ 让 TF 对得分贡献饱和趋于平缓。k₁→0 退化为 binary（出现即得分），k₁→∞ 趋近线性增长。

**面试官评价**: 正确。k₁=1.2 是经验平衡点。

---

## Q3 — HNSW 索引

**问题**: HNSW 为什么快？核心数据结构和查询策略？牺牲了什么？

**我的回答**:

1. **数据结构**：分层图，每层节点以指数概率递减，Layer 0 包含全部节点
2. **查询策略**：顶层贪心搜索定位 → 逐层下降 → Layer 0 beam search 返回 top-k
3. **复杂度**：O(log N)，与维度基本无关（vs 暴力 O(N·d)，KD-Tree 高维退化）

**追问：牺牲了什么？**

**我的回答**: 牺牲了精度（查询时找到的不是全局最优），图本身占用内存。

**面试官追问**：精度损失在哪个环节？还有其他代价吗？

**补充回答**: 查询时 beam search 的候选集有限，可能错过全局最优。内存方面每个节点存 M 条边。

**面试官追问**：删除操作呢？对 memory 系统有没有影响？

**补充回答**: 删除后节点的邻居需要更新。影响不大，运行时以 update/renew 为主，只有 TTL 过期才删除。

**面试官补充**:
- 删除难的核心原因：被删节点可能是其他节点到达某区域的"桥梁"，路径断裂后重建代价高
- 大多数实现（包括 hnswlib）用**软删除**（标记 deleted，查询时跳过），不是真正从图移除

---

## Q4 — 两层缓存设计

**问题**: Hot tier（Map）write-through vs LRU tier write-back 的 reasoning？accessCount 为什么加 500ms debounce？

**我的回答**:
- README 描述有误（已修正），实际全部 write-through，不希望丢失记忆
- debounce 防止用户高频提问导致大量读写

**面试官补充**: accessCount 只是统计字段，影响排序权重——crash 丢掉几次计数无所谓，是少数可以接受 write-back 的字段，debounce 合理。

---

## Q5 — Planning 上下文传递

**问题**: Subgoal 2 的任务生成依赖 Subgoal 1 的执行结果，这个"结果"怎么传递？

**我的回答**: 要求换全栈方向的问题。

**面试官**: 同意换方向。

---

## Q6 — 工具并发执行

**问题**: LLM 返回多个 tool_use block 时，是 Promise.all 还是串行？dangerous 确认弹窗怎么处理？

**我的回答**:
- 现在严格串行 `for...await`，dangerous 确认弹窗不会叠加
- 如果并发，合理方案是**两阶段**：
  - 阶段一：串行确认所有 dangerous 工具（UI 层）
  - 阶段二：并发执行所有已批准的工具（I/O 层）
- 边界情况：PlanStore 并发写竞态——两个工具同时 update_task 会导致最后写入覆盖前一个
- 当前串行方案规避了以上问题，且 task 间多有依赖，串行更合理

**面试官评价**: 两阶段方案清楚，PlanStore 并发写的边界情况主动提到，加分。

---

## Q7 — 错误类层级设计

**问题**: 有没有公共基类？instanceof 跨模块有没有问题？

**我的回答**:
- 当前单进程、单 module graph 下 instanceof 不会出问题
- **潜在陷阱一**：跨 bundle instanceof 失效——插件打包了自己的 MemoryError 副本，isMemoryError(err) 返回 false
- **潜在陷阱二**：没有统一基类，无法写 isAppError(e)，顶层 catch 退化到 `err instanceof Error`
- **额外发现**：toUserMessage() 接口不一致——MemoryError 未实现，运行时才发现 undefined，TypeScript 无法编译期捕获

**面试官评价**: 跨 bundle instanceof 失效和缺少统一基类说到了。toUserMessage 不一致是加分项——主动发现接口未被统一约束。

---

## Q8 — 测试策略：外部 API 依赖

**问题**: memory 系统依赖 text-embedding-3-small API，测试怎么处理外部依赖？

**我的回答（初始）**: 真实调用 API。

**面试官追问后修正**: 全部 mock。vi.mock('openai') 模块级 mock，CI 里不注入 OPENAI_API_KEY。HNSW embedding 测试 22 条，用 oneHot 合成向量（cosine similarity 完全可预测）。

**面试官评价**: 初始回答和后续完全矛盾，被自己打脸。回答前应先确认印象。oneHot 向量设计加分——确定性单元测试。

**教训**: 回答前先想清楚再说，不确定的用"我记得是..."而不是直接断言。

---

## Q9 — 系统设计开放题：多用户 SaaS 改造

**问题**: 如果把 agent 做成 10k+ 并发用户的 SaaS，memory 系统怎么改造？说 3 个关键决策点。

**我的回答**:

1. **向量检索换 pgvector**：per-user HNSW 常驻不可行，pgvector 带 user_id 过滤，延迟 ~5-20ms 在 LLM 调用时间尺度下可接受
2. **loadForSystemPrompt 加 per-user TTL 缓存**：读/写比极高，preference/experiential 改动频率低，缓存命中率高，consolidation 后主动 invalidate
3. **consolidation 异步队列化**：BullMQ worker 消费，集中管理 OpenAI rate limit（token bucket），失败可 retry，可按用户等级设优先级

**面试官评价**: 三个决策点都抓住了核心矛盾。

---

## 技术栈全景介绍题

**问题（面试官模拟）**: 介绍一下这个项目的技术栈，前端后端分别用了什么，为什么这么选？

**我的回答**（结构化回答，适合面试 2-3 分钟版本）:

- **"前端" TUI**：Ink + React，Ink 实现自己的 renderer 把 React vdom diff 翻译成 ANSI 转义码。选 React 而不是 blessed/chalk 拼字符串是因为流式输出 + 确认弹框 + spinner 是并发状态变化，声明式模型更可维护。trade-off：生态小、无 DevTools、必须 Node 20+
- **后端**：TypeScript 5.4 + ESM + Node.js，Zod 做运行时 schema 验证。ESM 和 CJS 互操作是陷阱——hnswlib-node 是 CJS native module，用 createRequire(import.meta.url) 绕路
- **向量检索**：hnswlib-node（C++ bindings），O(log n) vs O(n×d)，实测 69× 加速。trade-off：平台依赖、近似搜索
- **持久化**：JSONL append-only（会话）+ JSON（embeddings source of truth）+ HNSW bin（可重建）
- **工具链**：commander（CLI）、zod（schema）、js-tiktoken（token 计数）、vitest（测试，原生 ESM 支持）

**面试官评价**: 能拿高分。Ink reconciler → renderer → ANSI 链说清楚了，每个选型都说了 trade-off，createRequire 踩坑细节有说服力，JSONL append-only 取舍到位。

---

## 多设备/多人协作演进路径

**问题**: 没有后端服务，多设备同步和多人协作怎么加？

**我的回答**（三档演进）:

1. **档一（零改动）**: 存储目录 symlink 到云盘（iCloud/Dropbox），embeddings.json 是 source of truth、hnsw.bin 可重建的设计已预留空间。不能解决并发写
2. **档二（新存储实现）**: MemoryStore 接口干净，新增 RemoteMemoryStore 实现 + 薄后端（Hono/Fastify）+ pgvector 替换本地 HNSW
3. **档三（多人协作）**: 在档二基础上加 auth + userId 分区 + 行级锁/optimistic concurrency。consolidation.ts 的"多条记忆合并去重"逻辑天然可扩展为多用户 memory 合并

**面试官评价**: 层次清晰。接口抽象是可替换边界这个论断有力，consolidation 可扩展为多用户合并的联想加分，先说最小代价方案体现工程判断。

---

## Q10（本轮 Q11）— useTypewriter：useRef vs useState

**问题**: queue 为什么用 useRef 而不是 useState？

**我的回答（初始）**: 根本区别是值改变时触不触发重渲染。useState 每次流式输入都重渲染，性能下降。

**面试官追问**: "性能下降"太浅。具体问题是什么？

**补充回答**:
1. **性能浪费**：queue 不需要显示在界面上，每次 setQueue 触发的 re-render 是纯浪费
2. **正确性 bug（更关键）**：setInterval 闭包捕获的是创建时的 queue 快照。useState 版本里，新 enqueue 的字符对 setInterval 回调是隐形的——typewriter 永远不动

**面试官总结**:
- useRef 给的是稳定的**盒子**，.current 永远指向最新内容
- useState 给的是**值的快照**，闭包捕获创建时的版本
- setInterval 是典型的闭包陷阱
- 心智模型：**驱动 UI 的状态用 useState，运行时内部状态用 useRef**。在动画、timer、WebSocket 场景反复出现

---

## Q12 — useEffect 依赖数组

**问题**: `useEffect(..., [isDraining, intervalMs])` 为什么不把 queueRef 加进依赖数组？ESLint exhaustive-deps 会报警吗？

（此题未完成回答）

---

## 总体评价（面试官）

**强项**:
- 对自己写的代码细节掌握扎实，能说到具体文件和行为
- 主动暴露设计缺陷（toUserMessage 不一致、没有统一基类）而不是只讲优点
- 算法部分（HNSW、BM25）原理清楚，能说出 trade-off

**可以更强的地方**:
- 追问细节时有点不耐烦——面试官追问细节通常是因为感兴趣，不是刁难
- 有一题说"真实调用"后被推翻，回答前应先确认印象，避免被自己打脸
