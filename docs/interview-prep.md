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
