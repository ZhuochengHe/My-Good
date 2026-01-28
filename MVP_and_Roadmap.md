# MVP and Project Roadmap

**Last Updated:** 2026-01-27

---

## Project Goal

Build an **assistant-like agent** with:
- Agent execution loop (stateful reasoning with tool calling)
- Plugin-based tool system (default plugins + add-ons)
- Multi-model API support (Claude, ChatGPT, and others)

---

## Comparison: Moltbot vs. Our Goal

| Feature | Moltbot | Our Goal | Analysis |
|---------|---------|----------|----------|
| **Agent Execution Loop** | ✅ Pi Agent Runtime (RPC subprocess) | ✅ Required | **Learn from**: Pi Agent integration pattern, event streaming |
| **Tool/Plugin System** | ✅ Skills (55+) + Extension framework | ✅ Required | **Learn from**: Adapter pattern, manifest-based discovery |
| **Multi-Model Support** | ✅ 10+ providers (Anthropic, OpenAI, Google, AWS) | ✅ Required | **Learn from**: Provider abstraction, auth profile rotation |
| **WebSocket Gateway** | ✅ Central orchestrator for all clients | ❓ TBD | **Decision needed**: Do we need WebSocket or just HTTP API? |
| **Multi-Channel Messaging** | ✅ 30+ platforms (WhatsApp, Slack, Discord) | ❌ Not required | **Scope**: Not part of MVP - focus on core agent capabilities |
| **Session Management** | ✅ JSONL transcripts, per-session serialization | ✅ Required | **Learn from**: Session isolation, write locks, compaction |
| **Native Apps** | ✅ macOS, iOS, Android | ❌ Not required | **Scope**: Out of scope for our project |
| **Configuration System** | ✅ JSON5 + Zod validation + env substitution | ✅ Required | **Learn from**: Validation patterns, hot-reload |
| **Skill Gates** | ✅ Binary/env/OS requirements | ✅ Useful | **Learn from**: Conditional plugin loading |
| **Tool Approval** | ✅ Approval gates for dangerous operations | ✅ Useful | **Learn from**: Security patterns |
| **Sandbox Execution** | ✅ Docker/Firejail support | ❓ Future | **Decision needed**: Important for security, but may be post-MVP |
| **Browser Automation** | ✅ Playwright integration | ❓ Future | **Plugin**: Could be an add-on plugin |
| **CLI Interface** | ✅ Comprehensive CLI | ✅ Required | **Learn from**: Command structure, onboarding wizard |

---

## Core Similarities & Differences

### ✅ Core Similarities (What We Share)
1. **Agent Execution Loop** - Both need stateful agent runtime with tool calling
2. **Plugin Extensibility** - Both use plugin/skill system for tools
3. **Multi-Model Support** - Both integrate with multiple LLM providers
4. **Session Management** - Both need conversation history and context
5. **Configuration-Driven** - Both use declarative configuration

### ❌ Key Differences (What We Don't Need)
1. **Multi-Channel Messaging** - Moltbot focuses heavily on messaging platforms (WhatsApp, Slack, etc.) - we don't need this
2. **WebSocket Gateway** - Moltbot uses WebSocket for real-time client orchestration - we may not need this complexity
3. **Native Apps** - Moltbot has macOS/iOS/Android apps - out of our scope
4. **Complex Routing** - Moltbot routes messages across 30+ channels - unnecessary for us

### 🤔 To Be Determined
1. **Communication Protocol** - Do we need WebSocket or is HTTP REST/streaming sufficient?
2. **Sandbox Execution** - Important for security, but adds complexity
3. **Browser Automation** - Useful as plugin, but not core to MVP
4. **Daemon Mode** - systemd/launchd support - nice to have, not critical

---

## MVP Definition

### Minimum Viable Product (Phase 1)

**Goal:** Create a functional agent that can execute tool-based tasks with extensible plugins.

**Core Features:**

#### 1. Agent Execution Loop ✅
- **Requirement**: Stateful agent runtime that manages conversation history and executes tools
- **Implementation Options**:
  - **Option A**: Use Pi Agent Runtime directly (like moltbot)
    - Pros: Battle-tested, feature-complete, handles streaming/tools/reasoning
    - Cons: External dependency, need to learn its API
  - **Option B**: Build custom agent loop using LLM APIs directly
    - Pros: Full control, simpler architecture
    - Cons: Reinventing wheel, missing features (streaming, reasoning)
  - **Option C**: Use LangChain/LangGraph
    - Pros: Popular framework, good documentation
    - Cons: Heavy dependency, opinionated patterns
- **MVP Decision**: Start with **Option B (custom)** for learning, then evaluate Pi Agent for production

**Core Agent Capabilities:**
- Send user message to LLM API
- Parse tool calls from response
- Execute tools with parameter validation
- Send tool results back to LLM
- Continue conversation loop until completion
- Maintain conversation history

#### 2. Plugin System ✅
- **Plugin Discovery**: Load plugins from directory with manifest files
- **Plugin Manifest**: JSON/YAML with metadata (name, description, schema)
- **Plugin Types**:
  - **Default Plugins** (bundled):
    - File operations (read, write, list)
    - Shell execution
    - Web search
    - Basic utilities (calculator, date/time)
  - **Add-on Plugins** (user-installable):
    - GitHub integration
    - Code execution
    - Browser automation
    - Custom user plugins
- **Tool Registration**: Convert plugin manifest to tool definition for LLM
- **Tool Execution**: Call plugin handler with validated parameters

**Plugin Structure:**
```
/plugins/file-ops/
├── plugin.json          # Manifest with tool definitions
├── index.js             # Plugin implementation
└── README.md            # Documentation
```

#### 3. Multi-Model API Support ✅
- **Required Providers**:
  - Anthropic (Claude Opus/Sonnet)
  - OpenAI (GPT-4/GPT-4 Turbo)
- **Future Providers**:
  - Google (Gemini)
  - Other OpenAI-compatible APIs
- **Provider Abstraction**:
  - Unified interface for all providers
  - Model-specific capabilities (tool calling format, streaming)
  - API key management
- **Configuration**: Model selection via config file

#### 4. Session Management ✅
- **Session Storage**: Simple JSON or JSONL files
- **Conversation History**: Store messages and tool calls
- **Session Isolation**: Each conversation in separate session
- **Basic Features**:
  - Load existing session
  - Append new messages
  - Clear session history

#### 5. Configuration System ✅
- **Config File Format**: JSON or YAML
- **Config Location**: `~/.my-agent/config.yaml`
- **Required Settings**:
  - Default model selection
  - API keys (or env var references)
  - Plugin directories
  - Session storage path
- **Validation**: Basic schema validation

#### 6. CLI Interface ✅
- **Core Commands**:
  ```bash
  my-agent chat            # Start interactive chat
  my-agent run "message"   # Single-turn execution
  my-agent plugins list    # List available plugins
  my-agent config show     # Show configuration
  my-agent session clear   # Clear session history
  ```

### MVP Scope Summary

**In Scope for MVP:**
- ✅ Basic agent loop (message → tools → response)
- ✅ Plugin loading and execution
- ✅ Claude + ChatGPT API integration
- ✅ Simple session management (file-based)
- ✅ CLI interface
- ✅ Configuration file support
- ✅ 3-5 default plugins (file ops, shell, web search)

**Out of Scope for MVP:**
- ❌ WebSocket gateway
- ❌ Multi-channel messaging (Slack, Discord, etc.)
- ❌ Native apps (macOS, iOS, Android)
- ❌ Browser automation (can be add-on plugin later)
- ❌ Advanced session features (compaction, auto-reset)
- ❌ Approval gates for tools
- ❌ Sandbox execution
- ❌ Reasoning budget management
- ❌ Model failover/rotation

### MVP Success Criteria

**The MVP is successful if:**
1. User can start a conversation with the agent via CLI
2. Agent can call at least 3 different tools (file read, shell exec, web search)
3. Agent maintains conversation history across messages
4. User can switch between Claude and ChatGPT
5. User can install a custom plugin and use it in conversation

---

## Project Roadmap

### Phase 1: MVP (Core Agent) - 2-3 weeks

**Goals:**
- Functional agent execution loop
- Basic plugin system with 3-5 plugins
- Claude + ChatGPT support
- CLI interface

**Tasks:**
1. **Project Setup** (2-3 days)
   - Choose language/framework (TypeScript + Node.js recommended based on moltbot)
   - Set up project structure (monorepo or single app)
   - Configure build system (TypeScript, ESM modules)
   - Set up testing framework (Vitest or Jest)

2. **Agent Execution Loop** (4-5 days)
   - Implement LLM API clients (Anthropic, OpenAI)
   - Build agent loop (message → tools → response)
   - Add conversation history management
   - Implement tool call parsing and execution
   - Add basic error handling

3. **Plugin System** (3-4 days)
   - Design plugin manifest format
   - Implement plugin discovery and loading
   - Create plugin execution framework
   - Build 3 default plugins:
     - File operations (read/write/list)
     - Shell execution
     - Web search

4. **Session Management** (2-3 days)
   - File-based session storage (JSONL)
   - Session creation and loading
   - History append and retrieval
   - Session clear command

5. **Configuration** (2 days)
   - Config file format (YAML)
   - Config loading and validation
   - Environment variable support
   - Default config generation

6. **CLI Interface** (2-3 days)
   - Build CLI framework (Commander.js or similar)
   - Implement core commands (chat, run, plugins, config)
   - Add interactive chat mode
   - Add help documentation

7. **Testing & Documentation** (2-3 days)
   - Write unit tests for core components
   - Integration tests for agent loop
   - Write README and getting started guide
   - Create plugin development guide

---

### Phase 2: Enhanced Features (Weeks 4-6)

**Goals:**
- Improved agent capabilities
- More plugins
- Better session management
- Streaming support

**Tasks:**
1. **Streaming Support** (3-4 days)
   - Add SSE (Server-Sent Events) for real-time responses
   - Update CLI to show streaming text
   - Handle tool execution updates

2. **Advanced Session Management** (2-3 days)
   - Session compaction (context window management)
   - Auto-reset on idle/daily schedule
   - Session metadata and statistics

3. **Additional Plugins** (4-5 days)
   - GitHub integration plugin
   - Code execution plugin (sandboxed Python/JS)
   - Calculator/math plugin
   - Date/time utilities plugin
   - Custom memory/notes plugin

4. **Tool Approval System** (2-3 days)
   - Interactive approval for dangerous tools (shell exec, file write)
   - Approval policies (auto-approve, always-ask, deny)
   - Audit log for tool executions

5. **Model Features** (2-3 days)
   - Extended reasoning support (Claude thinking)
   - Token usage tracking and limits
   - Model-specific configuration (temperature, max_tokens)

---

### Phase 3: Production Readiness (Weeks 7-9)

**Goals:**
- Robust error handling
- Security hardening
- Performance optimization
- Production deployment

**Tasks:**
1. **Error Handling & Reliability** (3-4 days)
   - Comprehensive error handling
   - Retry logic for API failures
   - Graceful degradation
   - Better logging system

2. **Security** (3-4 days)
   - Sandbox execution for shell/code plugins
   - Input validation and sanitization
   - API key encryption at rest
   - Rate limiting

3. **Performance** (2-3 days)
   - Optimize session loading
   - Add caching for common operations
   - Reduce API call overhead

4. **Advanced Configuration** (2 days)
   - Hot-reload configuration
   - Per-plugin configuration
   - Environment-specific configs (dev/prod)

5. **Documentation & Polish** (2-3 days)
   - Complete API documentation
   - Plugin development tutorials
   - Troubleshooting guide
   - Example workflows

---

### Phase 4: Advanced Features (Weeks 10+)

**Goals:**
- Optional advanced capabilities
- Ecosystem expansion
- Unique differentiators

**Potential Features:**
1. **HTTP API Server** (optional)
   - REST API for programmatic access
   - WebSocket for real-time updates
   - Multi-client support

2. **Web UI** (optional)
   - Simple web interface for chat
   - Plugin marketplace
   - Session browser

3. **Advanced Agent Features**
   - Multi-agent collaboration
   - Agent handoff between different models
   - Parallel tool execution
   - Agent-to-agent communication

4. **Memory & RAG** (optional)
   - Vector database integration
   - Long-term memory across sessions
   - Semantic search over past conversations

5. **Browser Automation Plugin**
   - Playwright integration
   - Web scraping capabilities
   - Form filling and interaction

6. **Unique Features** (differentiators from moltbot)
   - Focus on developer workflows (code analysis, testing, CI/CD)
   - Deep IDE integration (VS Code extension)
   - Local-first with offline model support (llama.cpp)
   - Specialized plugins for specific domains (data science, DevOps)

---

## Key Decisions to Make

### 1. Language & Framework ⚠️ **CRITICAL**

**Options:**
- **TypeScript + Node.js** (like moltbot)
  - Pros: Large ecosystem, fast iteration, good for I/O, moltbot patterns transferable
  - Cons: Performance, type safety less strict than compiled languages
- **Python**
  - Pros: Excellent AI/ML libraries, rapid prototyping, popular for agents
  - Cons: Packaging complexity, slower than compiled languages
- **Go**
  - Pros: Fast, compiled, great concurrency, single binary deployment
  - Cons: Smaller ecosystem for AI/agent tools, more verbose

**Recommendation**: **TypeScript + Node.js**
- Aligned with moltbot learnings
- Rich ecosystem for LLM integrations
- Fast iteration during MVP phase
- Easy to hire developers familiar with stack

### 2. Project Structure ⚠️ **CRITICAL**

**Options:**
- **Monorepo** (all components in one repo)
  - Pros: Easier to coordinate changes, shared code, unified versioning
  - Cons: More complex build system
- **Multi-repo** (separate repos for core, plugins, CLI)
  - Pros: Clear boundaries, independent versioning
  - Cons: Coordination overhead, dependency management
- **Single App** (everything in one package)
  - Pros: Simple, fast to build
  - Cons: Harder to scale as project grows

**Recommendation**: **Single App for MVP → Monorepo for Phase 2+**
- Start simple with single app to move fast
- Refactor to monorepo when adding more components
- Use workspace features (npm workspaces, pnpm) when ready

### 3. Agent Runtime ⚠️ **IMPORTANT**

**Options:**
- **Pi Agent Runtime** (like moltbot)
  - Pros: Feature-complete, handles streaming/tools/reasoning, battle-tested
  - Cons: External dependency, learning curve, may be over-engineered for MVP
- **Custom Agent Loop**
  - Pros: Full control, learn by building, simpler for MVP
  - Cons: Missing advanced features, need to build everything
- **LangChain/LangGraph**
  - Pros: Popular, documented, community support
  - Cons: Heavy, opinionated, learning curve

**Recommendation**: **Custom Loop for MVP → Evaluate Pi Agent for Phase 2**
- Build simple agent loop to understand the problem space
- Evaluate Pi Agent once we have working prototype
- Migrate if Pi Agent provides clear value (streaming, reasoning, etc.)

### 4. Communication Protocol

**Options:**
- **CLI Only** (simplest)
- **HTTP REST API** (standard)
- **WebSocket** (real-time)
- **Hybrid** (REST + WebSocket like moltbot)

**Recommendation**: **CLI Only for MVP → HTTP API in Phase 2**
- MVP focus on CLI to validate core agent capabilities
- Add HTTP API when building web UI or integrations
- WebSocket only if real-time streaming is critical

### 5. Sandbox Execution

**Options:**
- **No Sandbox** (trust user input)
- **Docker** (like moltbot)
- **VM-based** (heavier isolation)
- **Process-based** (lighter isolation)

**Recommendation**: **No Sandbox for MVP → Docker in Phase 3**
- MVP assumes trusted usage
- Add Docker sandbox for production (security critical)
- Document security risks clearly for MVP users

---

## What We Learn from Moltbot

### ✅ Architectural Patterns to Adopt

1. **Adapter Pattern for Extensibility**
   - Use typed interfaces for plugins
   - Composition over inheritance
   - Clear separation of concerns

2. **Event-Driven Architecture**
   - Emit events for lifecycle phases (agent_start, tool_execution, agent_end)
   - Allow subscribers to listen to events
   - Enables UI updates, logging, debugging

3. **Session-Based Serialization**
   - Per-session write locks prevent race conditions
   - JSONL format for transcripts (human-readable, append-only)
   - Session compaction for context management

4. **Configuration Validation**
   - Schema validation (Zod or similar)
   - Environment variable substitution
   - Hot-reload support

5. **Plugin Discovery**
   - Manifest-based registration (plugin.json)
   - Lazy loading of plugin code
   - Precedence system (workspace > managed > bundled)

6. **Tool Safety**
   - Approval gates for dangerous operations
   - Audit logging for tool executions
   - Configurable security policies

### ❌ What to Avoid/Simplify

1. **Don't Build WebSocket Gateway Initially**
   - Adds significant complexity
   - Not needed for CLI-only MVP
   - Add only when building multi-client support

2. **Don't Support Multi-Channel Messaging**
   - Core to moltbot's value prop but not ours
   - Focus on agent capabilities, not messaging platforms

3. **Don't Build Native Apps**
   - Out of scope for our goals
   - CLI + optional web UI is sufficient

4. **Don't Over-Engineer RPC Subprocess**
   - Moltbot uses RPC for process isolation with Pi Agent
   - For custom agent loop, simple in-process execution is fine
   - Add process isolation only if needed for stability/security

### 🎯 Key Insights from Moltbot

1. **Start with Core Agent Loop**
   - Everything else depends on solid agent execution
   - Moltbot uses Pi Agent Runtime - we can build simpler initially

2. **Plugin System is Critical**
   - Extensibility comes from plugins, not hardcoded features
   - Clear plugin API attracts community contributions

3. **Session Management is Complex**
   - Context window limits require compaction
   - Race conditions require serialization
   - JSONL format is excellent for debugging

4. **Configuration Drives Behavior**
   - Declarative config reduces code complexity
   - Validation catches errors early
   - Environment variables enable secrets management

5. **Type Safety Matters**
   - Full TypeScript prevents runtime errors
   - Schema validation at boundaries (config, plugins, API responses)
   - Code generation from schemas (TypeBox → JSON Schema)

---

## Success Metrics

### MVP Success (Phase 1)
- [ ] Agent executes at least 10 consecutive turns with tool calling
- [ ] 3+ default plugins working (file ops, shell, web search)
- [ ] Users can install custom plugin and use it
- [ ] Session history persists across restarts
- [ ] Works with both Claude and ChatGPT
- [ ] CLI is responsive and user-friendly

### Production Success (Phase 3)
- [ ] 99% uptime for agent execution
- [ ] < 500ms overhead for tool execution
- [ ] 10+ plugins available
- [ ] Comprehensive error handling (no crashes)
- [ ] Security audit passed
- [ ] Documentation complete

### Ecosystem Success (Phase 4+)
- [ ] 50+ users actively using the agent
- [ ] 5+ community-contributed plugins
- [ ] Integration with popular tools (VS Code, GitHub, etc.)
- [ ] Positive user feedback and testimonials

---

## Risk Analysis

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM API changes break tool calling | High | Abstract API client, version pinning, integration tests |
| Plugin system too restrictive | Medium | Design plugin API with extensibility in mind, gather feedback early |
| Session context exceeds limits | Medium | Implement compaction early, monitor token usage |
| Custom agent loop too simplistic | Medium | Plan migration path to Pi Agent if needed |
| Performance issues with large sessions | Low | Profile early, optimize as needed |

### Project Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Scope creep (trying to match all moltbot features) | High | Strict MVP definition, phased roadmap |
| Language/framework choice delays progress | High | Make decision quickly, document reasoning |
| Over-engineering for future needs | Medium | Build for today, refactor for tomorrow |
| Lack of user testing during MVP | Medium | Get feedback from real users early |

---

## Next Steps

### Immediate Actions (This Week)

1. **Decide on Language & Framework** ⚠️
   - Review TypeScript vs. Python vs. Go
   - Consider team expertise and ecosystem
   - Document decision in Disc_TODO.md

2. **Define Project Structure** ⚠️
   - Choose monorepo vs. single app
   - Create initial directory structure
   - Set up build system (tsconfig, package.json)

3. **Research Agent Loop Implementation**
   - Study Pi Agent Runtime API if considering it
   - Review LangChain for comparison
   - Prototype simple agent loop with Claude API

4. **Finalize MVP Scope**
   - Lock down which 3-5 default plugins to build
   - Define success criteria more precisely
   - Create GitHub project with issues for MVP tasks

### Week 2-3 Actions

5. **Build MVP Core**
   - Implement agent execution loop
   - Create plugin system foundation
   - Build first default plugin (file operations)

6. **Validate with Real Usage**
   - Use the agent for real tasks (code review, file operations)
   - Identify pain points and missing features
   - Iterate based on feedback

---

## Conclusion

**Our project is more focused than moltbot:**
- Moltbot = Personal AI assistant across 30+ messaging platforms
- Our project = Core agent execution engine with plugin extensibility

**What we take from moltbot:**
- Architectural patterns (adapter, events, sessions)
- Plugin system design
- Configuration and validation approaches
- Tool safety and approval patterns

**What we don't need:**
- Multi-channel messaging complexity
- WebSocket gateway (at least for MVP)
- Native apps
- Advanced routing and delivery systems

**MVP Timeline: 2-3 weeks for core agent execution with plugins**

**Success depends on:**
1. Making quick decisions on language/framework ⚠️
2. Resisting scope creep and staying focused on MVP ⚠️
3. Building plugin system well (enables future growth)
4. Getting real user feedback early

**Next critical decision:** Language and framework choice (TypeScript recommended based on moltbot analysis)
