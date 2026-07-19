## ADDED Requirements

### Requirement: Character YAML data schema
系统 SHALL 定义角色仪表盘的 YAML 数据结构，包含英雄信息、核心机制、初始卡组、流派、阶段策略、常见陷阱和快速参考。每个角色一个 YAML 文件，存储在 `src/content/characters/` 目录下。

#### Scenario: 完整角色数据文件通过 Zod 校验
- **WHEN** 一个包含所有必填字段的角色 YAML 文件被加载
- **THEN** Zod schema 校验通过，且可以正常渲染为完整的可视化仪表盘

#### Scenario: 缺少必填字段时构建报错
- **WHEN** 角色 YAML 文件缺少必填字段（如 `name`、`mechanics`）
- **THEN** 构建时 Zod 校验失败，抛出明确的错误信息指示缺少的字段

#### Scenario: 可选字段为空时优雅降级
- **WHEN** 角色 YAML 文件中可选字段（如 `archetypes`、`pitfalls`）为空数组
- **THEN** 对应区块在页面中不渲染，而不是显示空白区域或报错

---

### Requirement: MechanicIconGrid 组件
系统 SHALL 提供 `MechanicIconGrid` Astro 组件，将角色的核心机制以图标网格的形式展示。每个机制显示：图标、名称、被动值、激发值（如适用）、一条简短提示。

#### Scenario: 渲染四球机制的 Defect
- **WHEN** 传入 Defect 的 4 个充能球机制数据
- **THEN** 渲染为 2×2 或 4 列图标网格，每个格子显示图标 + 名称 + 数值 + 提示

#### Scenario: 渲染三机制的 Ironclad
- **WHEN** 传入 Ironclad 的 3 个机制数据（Strength、Exhaust、Self-damage）
- **THEN** 渲染为 3 列网格，没有 Evoke 行的机制不显示 Evoke 行

#### Scenario: 移动端单列堆叠
- **WHEN** 视口宽度 < 768px
- **THEN** 图标网格从多列切换为单列堆叠，每个机制占满宽度

---

### Requirement: StartingHand 组件
系统 SHALL 提供 `StartingHand` Astro 组件，以视觉化的"手牌"形式展示角色的初始卡组。每张卡显示名称、费用、类型图标、数量，以及升级优先级徽章（如有）。

#### Scenario: 展示 Defect 初始卡组
- **WHEN** 传入 Defect 的起始卡组（Strike×4、Defend×4、Dualcast×1、Zap×1）
- **THEN** 渲染为视觉卡片网格，Zap 标注"⬆ 优先升级"徽章

#### Scenario: 点击卡牌跳转到详情页
- **WHEN** 用户点击起始卡组中的某张卡牌
- **THEN** 跳转到对应的卡牌详情页 `/games/<game>/cards/<slug>/`

#### Scenario: 卡牌图片加载失败时显示文字回落
- **WHEN** 卡牌图片 URL 返回 404 或加载超时
- **THEN** 显示卡牌名称文字 + 费用数字作为回落

---

### Requirement: StrategyTimeline 组件
系统 SHALL 提供 `StrategyTimeline` Astro 组件，以横向三阶段时间轴展示角色的 Act 1 → Act 2 → Act 3 策略演进。每个阶段包含：目标、推荐选牌、精英战斗策略、升级优先级。

#### Scenario: 渲染完整的阶段路线图
- **WHEN** 传入包含 act1、act2、act3 的策略数据
- **THEN** 渲染为三个分区的横向时间轴，相邻阶段用箭头连接

#### Scenario: 移动端切换为纵向布局
- **WHEN** 视口宽度 < 768px
- **THEN** 三阶段从横向切换为纵向堆叠，箭头从 → 变为 ↓

---

### Requirement: PitfallStrip 组件
系统 SHALL 提供 `PitfallStrip` Astro 组件，以横向警告卡片条展示角色的常见错误和陷阱。每条包含：严重程度图标（🔴/🟡/🟠）、标题、一句话提示。

#### Scenario: 渲染多个常见错误
- **WHEN** 传入 4 条 Defect 常见错误
- **THEN** 渲染为横向排列的警告卡片，每张卡片显示严重程度颜色 + 标题 + 提示

#### Scenario: 严重程度颜色编码
- **WHEN** `severity: critical` → 红色左边框 + 🔴
- **WHEN** `severity: high` → 橙色左边框 + 🟠
- **WHEN** `severity: medium` → 黄色左边框 + 🟡

---

### Requirement: Character dashboard layout template
系统 SHALL 提供 `character-guide.astro` 布局模板，自动读取角色 YAML 数据并渲染完整的可视化仪表盘。所有区块按固定顺序排列：HeroBadge → MechanicGrid + StartingHand → StrategyTimeline → ArchetypeGrid + RelicTierList → PitfallStrip → QuickReferenceBar。

#### Scenario: 用模板渲染任意角色
- **WHEN** 将 Defect 的 YAML 数据传入 `character-guide.astro`
- **THEN** 自动渲染完整的仪表盘页面，所有区块正确填充

#### Scenario: Colorless 角色跳过不适用的区块
- **WHEN** 渲染 Colorless 角色（无 mechanics、无 startingDeck、无 archetypes）
- **THEN** MechanicGrid、StartingHand、ArchetypeGrid 区块不渲染，其他区块正常显示

#### Scenario: 保留 MDX 可选插槽
- **WHEN** 角色页面需要额外的独特内容（如特殊的机制解释）
- **THEN** 可以通过 `<slot />` 在 QuickReferenceBar 之前插入任意 MDX 内容

---

### Requirement: AI prompt template — YAML output format
内容管线的角色概览提示词模板 SHALL 从"生成文本段落"改为"生成结构化 YAML"。AI 输出格式为完整的角色 YAML 数据文件。

#### Scenario: AI 生成 Defect 角色 YAML
- **WHEN** 提示词模板被调用，game="Slay the Spire 2"，character="Defect"
- **THEN** AI 输出包含 `mechanics`、`startingDeck`、`strategy`、`archetypes`、`pitfalls` 等字段的结构化 YAML

#### Scenario: AI 输出通过 Zod schema 校验
- **WHEN** AI 生成的 YAML 被解析
- **THEN** Zod 校验通过，所有引用的卡牌名和遗物名与实际数据文件中的 slug 一致

#### Scenario: AI 输出含非法字段时被拒绝
- **WHEN** AI 生成的 YAML 包含不存在的卡牌名或遗物名
- **THEN** 管线输出警告，标记需要人工修正后再入库

---

### Requirement: Migration of existing character overviews
现有的 `defect-overview.mdx` 和 `regent-overview.mdx` SHALL 被替换为可视化仪表盘。旧 URL `/games/<game>/guides/defect-overview/` SHALL 301 重定向到 `/games/<game>/characters/defect/`。

#### Scenario: 访问旧 URL 被重定向
- **WHEN** 用户访问 `/games/slay-the-spire-2/guides/defect-overview/`
- **THEN** 返回 301 重定向到 `/games/slay-the-spire-2/characters/defect/`

#### Scenario: 重定向不影响其他攻略
- **WHEN** 非角色概览的攻略（如 build guide、tier list）被访问
- **THEN** 不受影响，正常渲染原有页面
