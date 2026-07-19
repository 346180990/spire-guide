## Why

当前的 Slay the Spire 2 角色攻略文章（如 `defect-overview.mdx`、`regent-overview.mdx`）是 70+ 行的纯文本长文。AI 提示词模板要求生成"2-3 句话说明核心机制"、"详细解释角色独特玩法"等散文段落——AI 忠实地生成了大段文字。结果是玩家搜索"Defect怎么玩"时面对的是一面文字墙，需要 3-5 分钟阅读才能找到关键信息。

核心理念：**字不如图。** 游戏攻略的消费者是玩家，不是读者。他们需要的是 5 秒扫完、快速定位、行动导向的信息——而不是散文。

当前情况：
- 6 个角色（铁甲战士、静默猎手、故障机器人、储君、死灵契约师、无色），但只有 2 个有角色概览攻略
- 每篇角色攻略都是 70 行纯文本，采用"核心机制 → 初始卡组 → 最佳遗物 → 阶段策略 → 常见错误 → 总结"的作文结构
- 已有的可视化组件（TierList、StatTable、BuildCard、GameTooltip、CardFrame）在角色攻略中几乎没被使用
- AI 提示词模板明确要求生成段落文字，而非结构化数据

## What Changes

- **新的数据层**: 每个角色一个 YAML 文件，结构化存储机制图标、初始卡组、流派、阶段策略、常见陷阱
- **新的可视化组件**: `MechanicIconGrid`（机制图标网格）、`StartingHand`（初始卡组可视化）、`StrategyTimeline`（三阶段时间轴）、`PitfallStrip`（危险警告卡片条）
- **新的角色仪表盘模板**: `character-guide.astro` 统一布局，读取 YAML 自动渲染所有区块，所有角色共享同一套视觉语言
- **修改 AI 提示词模板**: 从"生成散文段落"改为"生成结构化 YAML 数据"，AI 输出直接用数据渲染而非作为文章正文
- **迁移现有攻略**: 将 `defect-overview.mdx` 和 `regent-overview.mdx` 替换为仪表盘页面，旧 URL 做重定向
- **为 6 个角色生成 YAML 数据**: AI 从 vault-source 提取信息 → 生成结构化 YAML → 人工审核

## Capabilities

### New Capabilities

- `character-dashboard`: 角色可视化仪表盘系统，包含：英雄徽章（名称/难度/一句话标签）、机制图标网格（被动值/激发值/提示）、初始卡组可视化（升级优先级徽章）、三阶段路线图时间轴、流派卡片网格、遗物推荐 Tier 列表、常见陷阱警告条、底部快速参考栏。一个模板渲染所有角色。

### Modified Capabilities

- `content-pipeline`: AI 提示词模板需要修改——角色概览类型的输出格式从"文本段落"改为"结构化 YAML"，但仍然保持人工审核环节。
- `article-system`: 新的角色仪表盘作为 `guideType: character-dashboard` 加入文章系统，复用现有的面包屑、JSON-LD、广告位、阶段徽章等基础设施。

## Impact

- **代码库**: 新建 4 个 Astro 组件 + 1 个布局模板 + 1 个 Zod schema +
  6 个 YAML 数据文件。修改 2 个提示词模板文件。不删除任何现有代码（旧文章仅做重定向）。
- **依赖**: 无新增依赖，全部基于现有技术栈（Astro + Tailwind + Zod）。
- **内容管线**: AI 提示词模板需要重构角色概览部分。6 个角色的 YAML 数据需要 AI 生成 + 人工审核。
- **SEO**: 每页内容减少但结构化数据保留（JSON-LD Article schema）。页面加载更快（更少的文本 = 更小的 HTML）。移动端体验大幅提升。
