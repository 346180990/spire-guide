## Context

将角色攻略从文本长文改造为可视化仪表盘。6 个角色（Ironclad、Silent、Defect、Regent、Necrobinder、Colorless），每个角色的信息结构高度一致：核心机制 → 初始卡组 → 阶段策略 → 流派推荐 → 遗物推荐 → 常见陷阱。这使得数据驱动 + 统一模板的方案天然适用。

**约束:**
- 基于现有 Astro 技术栈，不引入新依赖
- 复用已有组件（TierList、BuildCard、StatTable、GameTooltip、CardFrame）
- 移动端优先——游戏攻略流量主要来自手机搜索
- 必须保留 JSON-LD 结构化数据和 SEO 基础设施
- AI 提示词模板需要同步改造

## Goals / Non-Goals

**Goals:**
- 每个角色页面核心信息 5 秒内可扫完
- 一套 Astro 模板覆盖所有 6 个角色
- 新增角色 = 一个 YAML 文件 + 零代码改动
- 所有可视化组件在移动端（375px 宽度）正常展示
- 保留 Article JSON-LD 结构化数据
- AI 提示词模板从"生成散文"改为"生成结构化 YAML"

**Non-Goals:**
- 不修改卡牌/遗物/药水/机制/敌人参考页面（那些已经是卡片形式）
- 不删除长文攻略——它们作为深度阅读的"build guide"仍然存在，仪表盘是"character overview"的替代品
- 不加图片版权风险——图标使用 emoji/unicode 字符 + CSS 呈现，不引入游戏美术资源

## Decisions

### 1. 数据格式：YAML over JSON

```yaml
# src/content/characters/defect.yaml
slug: defect
name: Defect
difficulty: intermediate       # beginner | intermediate | advanced | expert
tagline: "Build infrastructure, let orbs do the work"
playstyle: scaler              # aggro | control | scaler | combo | hybrid

mechanics:
  - id: lightning
    icon: lightning             # 映射到 MechanicIcon 组件
    name: Lightning Orb
    passive: "3 damage/turn"
    evoke: "8 damage"
    tip: "Hallway fight workhorse"

startingDeck:
  cards:
    - name: Strike
      count: 4
      upgradePriority: 4
    - name: Zap
      count: 1
      upgradePriority: 1       # 标记为"优先升级"

archetypes:
  - name: Orb-Focus Engine
    difficulty: beginner
    keyCards: [defragment, biased-cognition, echo-form]
    keyRelics: [data-disk, runic-capacitor]

strategy:
  act1:
    goal: "Collect orb generation"
    picks: [ball-lightning, cold-snap, coolheaded]
    upgrade: "Zap → Dualcast → Cold Snap"
  act2:
    goal: "Commit to Focus scaling"
    picks: [defragment, biased-cognition, capacitor]
  act3:
    goal: "Scale to infinity"
    picks: [echo-form, creative-ai]

pitfalls:
  - title: "Ignoring Frost"
    severity: critical
    tip: "One Cold Snap changes everything"

quickRef:
  similarTo: ["MTG Blue control", "WoW Warlock"]
  difficultyRating: 3          # 1-5 显示为 ●●○○○
  powerCurve: [weak, spike, god]
```

**理由:** YAML 对人更友好（比 JSON 少引号/花括号），AI 生成 YAML 也更不容易出错（不需要担心 JSON 逗号/括号闭合）。编辑器（VS Code / Obsidian）对 YAML 有良好支持。

**备选方案:**
- **TypeScript 文件**: 类型安全但需要编译，且 AI 不擅长生成 TS
- **MDX frontmatter**: 太扁平，无法表达嵌套结构（mechanics 数组、strategy 嵌套对象）
- **JSON**: 可行但不是最友好的 AI 输出格式

### 2. 组件架构：数据驱动 + MDX 可选插槽

```
character-guide.astro (新布局模板)
├── HeroBadge         ← character 基础属性
├── MechanicGrid      ← mechanics[] 数组
├── StartingHand      ← startingDeck.cards[]
├── StrategyTimeline  ← strategy{} 对象
├── ArchetypeGrid     ← archetypes[] 数组 (复用 BuildCard)
├── RelicTierList     ← 从 cards/relics 关联数据构建 (复用 TierList)
├── PitfallStrip      ← pitfalls[] 数组
├── QuickReferenceBar ← quickRef{} 对象
└── <slot />          ← 可选的 MDX 内容插槽
```

每个区块独立组件，便于：
- 单独测试
- 移动端独立响应式处理
- 未来可能在某些角色页面跳过某个区块

### 3. 移动端布局策略

桌面端：左右分栏布局（机制网格 | 初始卡组 并排）
移动端：全部单列堆叠

```
Desktop (≥768px):              Mobile (<768px):
┌──────────┬──────────┐        ┌──────────┐
│ Mechanic │ Starting │        │ Mechanic │
│ Grid     │ Hand     │        │ Grid     │
├──────────┴──────────┤        ├──────────┤
│ Strategy Timeline   │        │ Starting │
├──────────┬──────────┤        │ Hand     │
│ Archetype│ Relic    │        ├──────────┤
│ Grid     │ TierList │        │ Strategy │
├──────────┴──────────┤        │ Timeline │
│ Pitfall Strip       │        ├──────────┤
├─────────────────────┤        │ Archetype│
│ Quick Reference Bar │        ├──────────┤
└─────────────────────┘        │ Relic    │
                               │ TierList │
                               ├──────────┤
                               │ Pitfalls │
                               ├──────────┤
                               │ QuickRef │
                               └──────────┘
```

StrategyTimeline 组件在移动端从横向三列变为纵向三行堆叠。

### 4. 图标策略：Unicode + CSS 颜色编码

| 游戏概念 | 图标 | 颜色 |
|---------|------|------|
| Lightning Orb | ⚡ | `#f0c960` gold |
| Frost Orb | ❄️ | `#60c0f0` blue |
| Dark Orb | 🌑 | `#9060c0` purple |
| Plasma Orb | ⚛️ | `#60f0c0` teal |
| Strength | 💪 | `#f06060` red |
| Poison | ☠️ | `#60f060` green |
| Shiv | 🔪 | `#c0c0c0` silver |
| Discard | 🃏 | `#c09060` brown |
| Command | 📋 | `#f0c060` amber |
| Ally | 👥 | `#6090f0` blue |
| Legacy | 📜 | `#f0f060` yellow |
| Doom | 💀 | `#9060f0` purple |
| Soul | 👻 | `#c0f0f0` cyan |
| Summon | 🐺 | `#609060` olive |

**理由:** Emoji 在所有操作系统上原生渲染，无需图片加载，无版权问题，且色彩鲜艳易于识别。未来可以替换为自定义 SVG 图标但不影响架构。

### 5. 数据来源与管线

```
vault-source/01-角色/*.md        # Obsidian vault 中的角色基础数据
        ↓
AI + prompt-template (新版)       # 从 vault 数据生成 YAML
        ↓
src/content/characters/*.yaml     # AI 初稿
        ↓
Human Review                      # 核对卡牌名、遗物名、策略准确性
        ↓
character-guide.astro             # 模板渲染 → HTML
```

卡片名称（如 `defragment`、`biased-cognition`）对应 `src/content/cards/` 中的 slug，BuildCard 组件通过 `getCollection('cards')` 查找匹配的图片和链接。

## Risks / Trade-offs

- **图标可读性**: Emoji 在不同操作系统渲染效果不同（Windows/iOS/Android 各有差异）。→ 缓解: 每个图标旁边都有文字标签，不依赖纯图标传达信息。
- **YAML 维护成本**: 数据文件中的卡牌名和遗物名需要与实际 MDX 文件 slug 保持一致。→ 缓解: 构建时 Zod 校验 + 警告未知的 slug 引用。
- **Colorless 角色特殊性**: Colorless 不是可玩角色，没有初始卡组和专属机制。→ 模板通过条件渲染处理——Colorless 页面跳过 StartingHand、MechanicGrid 等区块，只保留卡池展示。
- **AI YAML 生成质量**: LLM 可能生成不符合 Zod schema 的 YAML。→ 缓解: 管线中增加 schema 校验步骤，不合法的输出打回重新生成。

## Open Questions

- **旧角色概览 URL 处理**: `/games/sts2/guides/defect-overview/` 是 301 重定向到新的仪表盘 URL 还是保留作为"长文版"？建议重定向——仪表盘URL 用 `/games/sts2/characters/defect/`（已存在的路由）。
- **难度评分标准**: 1-5 的 difficultyRating 是否需要社区投票数据支撑？目前先由作者主观评定，标注"作者难度评估"。
- **Colorless 是否做仪表盘**: Colorless 没有独特机制、初始卡组、专属遗物。选项 A: 不做仪表盘，保持现状。选项 B: 做一个简化版（只有卡池 + 遗物列表）。
