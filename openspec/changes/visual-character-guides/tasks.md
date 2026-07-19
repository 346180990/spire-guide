## 1. Schema & Data Layer

- [x] 1.1 定义角色仪表盘 Zod schema：`src/content/schemas/character-dashboard.ts`（包含 mechanics、startingDeck、archetypes、strategy、pitfalls、quickRef 等嵌套字段的完整类型定义）
- [x] 1.2 在 `src/content.config.ts` 中注册 `characters` content collection，指向 `src/content/characters/*.yaml`
- [x] 1.3 创建示例 YAML 文件 `src/content/characters/defect.yaml` 作为参考模板（基于 design.md 中定义的数据结构）

## 2. New Visual Components

- [x] 2.1 创建 `MechanicIconGrid.astro` — 核心机制图标网格组件（支持 2-4 列自适应、被动/激发双值显示、单条提示文字、移动端单列堆叠）
- [x] 2.2 创建 `StartingHand.astro` — 初始卡组可视化组件（卡片网格 + 升级优先级徽章 + 图片加载失败文字回落 + 链接到卡牌详情页）
- [x] 2.3 创建 `StrategyTimeline.astro` — 三阶段路线图时间轴组件（桌面端横向三列箭头连接、移动端纵向堆叠、每阶段显示目标/选牌/升级优先级）
- [x] 2.4 创建 `PitfallStrip.astro` — 常见错误警告卡片条组件（严重程度颜色编码 critical=红色/high=橙色/medium=黄色、图标+标题+一句话提示）
- [x] 2.5 创建 `QuickReferenceBar.astro` — 底部快速参考栏组件（难度评分 ●●○○○、节奏曲线标签、相似游戏类比标签）
- [x] 2.6 为所有新组件添加移动端响应式样式（375px+ 测试）

## 3. Dashboard Layout Template

- [x] 3.1 创建 `src/layouts/CharacterDashboardLayout.astro` — 读取 YAML 数据、按固定顺序渲染所有区块的统一布局模板
- [x] 3.2 实现条件渲染逻辑：Colorless 角色跳过 MechanicGrid/StartingHand/ArchetypeGrid，archetypes 为空时跳过流派区块
- [x] 3.3 实现可选 MDX `<slot />` 插槽（在 QuickReferenceBar 之前），允许角色页面插入独特的自定义内容
- [x] 3.4 复用现有的 `BuildCard`、`TierList`、`GameTooltip` 组件渲染流派和遗物区块
- [x] 3.5 保留现有的 JSON-LD Article 结构化数据生成 + 面包屑导航 + 广告位（复用 ArticleLayout 的基础设施）
- [x] 3.6 更新 `src/pages/games/[game]/characters/[character].astro` 路由，集成 CharacterDashboardLayout

## 4. Content Pipeline Update

- [x] 4.1 重写 `content-pipeline/prompt-template.md` 中的"角色概览"提示词模板：输出格式从文本段落改为结构化 YAML
- [x] 4.2 在管线脚本中增加 YAML schema 校验步骤：AI 生成的 YAML 不合法时输出警告并标记需要人工修正
- [x] 4.3 确保 AI 提示词模板中的卡牌名和遗物名引用与实际 `src/content/cards/` 和 `src/content/relics/` 的 slug 对齐

## 5. Data Generation — 6 角色 YAML

- [x] 5.1 从 `vault-source/01-角色/` 提取每个角色的基础数据（卡牌数、遗物数、流派信息）
- [x] 5.2 AI 生成 Ironclad（铁甲战士）角色 YAML 初稿 → 人工审核卡牌名/遗物名/策略准确性
- [x] 5.3 AI 生成 Silent（静默猎手）角色 YAML 初稿 → 人工审核
- [x] 5.4 AI 生成 Defect（故障机器人）角色 YAML 初稿 → 人工审核
- [x] 5.5 AI 生成 Regent（储君）角色 YAML 初稿 → 人工审核
- [x] 5.6 AI 生成 Necrobinder（死灵契约师）角色 YAML 初稿 → 人工审核
- [x] 5.7 手工编写 Colorless（无色）角色 YAML —— 简化版（无 mechanics/startingDeck/archetypes，仅保留卡池展示）
- [x] 5.8 所有 YAML 文件通过 Zod schema 校验 + 构建验证

## 6. Migration & Redirects

- [x] 6.1 为 `/games/<game>/guides/defect-overview/` 创建 301 重定向到 `/games/<game>/characters/defect/`
- [x] 6.2 为 `/games/<game>/guides/regent-overview/` 创建 301 重定向到 `/games/<game>/characters/regent/`
- [x] 6.3 检查并更新所有内部链接（导航栏、关联攻略推荐、sitemap 生成脚本），指向新的角色仪表盘 URL
- [x] 6.4 验证旧 URL 重定向后不影响其他攻略类型（build guide / tier list / roadmap）的正常访问

## 7. Testing & Polish

- [x] 7.1 桌面端（1920px / 1440px / 1024px）视觉验证：所有 6 个角色仪表盘布局一致性
- [x] 7.2 移动端（375px / 414px / 768px）视觉验证：组件堆叠顺序正确、无横向溢出、触摸目标 ≥ 44px
- [x] 7.3 验证所有卡牌图片链接有效（StartingHand 和 ArchetypeGrid 中的卡片图片能正常加载）
- [x] 7.4 验证 JSON-LD 结构化数据仍然正确生成（Article + BreadcrumbList schema）
- [x] 7.5 构建测试：`astro build` 无报错，所有动态路由正确生成
- [x] 7.6 Colorless 角色页面特殊验证：跳过的区块不渲染、无空白区域、无 JS 报错
