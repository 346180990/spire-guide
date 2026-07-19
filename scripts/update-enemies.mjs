import fs from 'fs';
import path from 'path';

// Each enemy's extracted data from their body content
const enemyData = {
  'cultist': {
    act: 1, hp_range: '48-54', is_elite: false, is_boss: false,
    weakness: '伤害成长速度较慢，但拖延越久越危险。利用第一回合全力输出。',
    moves: [
      { name: 'Incantation', effect: '获得 Ritual 效果（每回合 +3 力量）', damage: '0' },
      { name: 'Dark Strike', effect: '普通攻击', damage: '6' },
    ],
    body: `# Cultist

> **类型**: 普通敌人 | **章节**: Act 1 | **生命值**: 48-54

## Core Mechanic

**Ritual**: 每回合自动获得力量，伤害随时间指数增长。

## 弱点分析

Cultist 是一个典型的「越拖越难打」型敌人。第一回合必定使用 Incantation 给自己叠加 Ritual buff，之后每回合的力量增长让 Dark Strike 的伤害快速攀升。如果你不能在 3-4 回合内结束战斗，6+ 的 Dark Strike 会迅速消耗你的血量。

## 行动模式

| 回合 | 行动 | 说明 |
|------|------|------|
| T1 | Incantation | 获得 Ritual，此后每回合 +3 力量 |
| T2+ | Dark Strike | 普通攻击，伤害随力量增长 |

## 克制策略

- **速战速决**: 这是最关键的策略。每拖延一回合，它的伤害就永久提高。
- **第一回合全力输出**: T1 是它唯一不攻击的回合，把所有伤害打出去。
- **防御不要过度**: 与其叠甲，不如尽快击杀。这场战斗的核心是 DPS check。
- **技能牌可以放心使用**: 和 Gremlin Nob 不同，Cultist 不会因为你打技能而变强。

## 各角色应对

| 角色 | 推荐策略 |
|------|----------|
| 铁甲战士 | 力量流直接碾压，Spot Weakness + 攻击牌速杀 |
| 静默猎手 | 毒药配合匕首，3 回合内堆够毒药即可 |
| 故障机器人 | 闪电球提供稳定输出，不需要专门针对 |
| 死灵契约师 | Doom 持续伤害配合 Soul 爆发 |
| 储君 | 锻造王权之剑后伤害充足 |`
  },
  'jaw-worm': {
    act: 1, hp_range: '40-44', is_elite: false, is_boss: false,
    weakness: 'Bellow 后虽然变强但消耗一整回合。利用这回合全力攻击，在它叠起来之前击杀。',
    moves: [
      { name: 'Chomp', effect: '普通攻击', damage: '11' },
      { name: 'Bellow', effect: '获得 3 力量和 6 格挡', damage: '0' },
      { name: 'Thrash', effect: '攻击并获得 5 格挡', damage: '7' },
    ],
    body: `# Jaw Worm

> **类型**: 普通敌人 | **章节**: Act 1 | **生命值**: 40-44

## Core Mechanic

**Bellow 强化**: 使用 Bellow 获得力量后，后续攻击伤害显著提高。

## 弱点分析

Jaw Worm 的核心弱点是 **Bellow 回合浪费**。当它选择 Bellow 时，当回合不造成伤害，给了你一整个回合的无干扰输出窗口。另外它的初始血量只有 40-44，在 Act 1 的敌人中属于较低水平，爆发足够的卡组可以在它第一次 Bellow 之前就将其击杀。

## 行动模式

| 行动 | 伤害 | 效果 | 优先级 |
|------|------|------|--------|
| Chomp | 11 | 普通攻击 | 高 — 开局常用 |
| Bellow | 0 | +3 力量, +6 格挡 | 中 |
| Thrash | 7 | 攻击, +5 格挡 | 中 |

## 克制策略

- **优先处理 Bellow**: 看到 Bellow 就全力攻击，趁它不造成伤害的回合尽可能压低血量。
- **计算格挡**: Bellow 给的 6 格挡会延缓你的进攻节奏，确保有足够的伤害穿透。
- **不要恋战**: 4 回合内结束战斗是最理想的时间窗口。

## 各角色应对

| 角色 | 推荐策略 |
|------|----------|
| 铁甲战士 | Bash + Strike 连击，3 回合内击杀 |
| 静默猎手 | Neutralize 减伤配合匕首速杀 |
| 故障机器人 | 闪电球 + Zap 稳定输出 |
| 死灵契约师 | Soul 召唤配合基础攻击 |
| 储君 | 锻造王权之剑后伤害碾压 |`
  },
  'gremlin-nob': {
    act: 1, hp_range: '82-86', is_elite: true, is_boss: false,
    weakness: '技能惩罚是双向的 — 如果你只用攻击牌，它就是一个没有任何特殊机制的纯伤害检查。',
    moves: [
      { name: 'Rush', effect: '普通攻击', damage: '14' },
      { name: 'Skull Bash', effect: '攻击并施加 2 层脆弱', damage: '6' },
    ],
    body: `# Gremlin Nob

> **类型**: 精英敌人 | **章节**: Act 1 | **生命值**: 82-86

## Core Mechanic

**愤怒**: 每当你打出一张技能牌（Skill），Gremlin Nob 永久获得 2 力量。这意味着每张技能牌都会让它之后的攻击更强。

## 弱点分析

Gremlin Nob 是所有 Act 1 精英中最考验卡组构成的敌人。它的机制很简单：惩罚技能牌使用。但反过来想——如果你的卡组以攻击牌为主，Gremlin Nob 就是一个没有任何特殊机制的纯输出检查。**只用攻击牌 = Nob 毫无威胁**。

核心思路不是"如何反制 Nob"，而是"如何在构筑时确保足够的攻击牌密度"。

## 行动模式

| 行动 | 伤害 | 效果 |
|------|------|------|
| Rush | 14 | 普通攻击 |
| Skull Bash | 6 | 攻击并施加 2 层脆弱 |

交替使用 Rush 和 Skull Bash，节奏固定。

## 克制策略

- **绝对不要打技能牌**: 每张技能牌 = Nob 永久 +2 力量。哪怕多挨一下也不要用技能。
- **攻击牌密度检查**: 如果卡组里攻击牌不到 60%，这场战斗会非常艰难。
- **药水救命**: 这场战斗是 Act 1 最值得用药水的精英战。
- **血量换伤害**: 接受会掉血的事实，用血量换取更快击杀。

## 各角色应对

| 角色 | 推荐策略 |
|------|----------|
| 铁甲战士 | 力量流优势对局，攻击牌多，Bash 可以放心使用 |
| 静默猎手 | 最困难的对局，必须依赖攻击牌和毒药，避免技能 |
| 故障机器人 | 闪电球被动输出不需要打技能，但 Zap 是技能要慎用 |
| 死灵契约师 | Doom 和 Soul 为主，避免 Hang 等技能牌 |
| 储君 | 锻造王权之剑，攻击牌为主 |`
  },
  'lagavulin': {
    act: 1, hp_range: '109-111', is_elite: true, is_boss: false,
    weakness: '沉睡期是免费准备时间。利用这 3 回合全力叠 Buff/Orb/Poison，然后一击唤醒。',
    moves: [
      { name: 'Sleep', effect: '沉睡 3 回合，或直到受到攻击', damage: '0' },
      { name: 'Siphon Soul', effect: '移除玩家 1 力量和 1 敏捷', damage: '0' },
      { name: 'Attack', effect: '普通攻击', damage: '18' },
    ],
    body: `# Lagavulin

> **类型**: 精英敌人 | **章节**: Act 1 | **生命值**: 109-111

## Core Mechanic

**沉睡**: 战斗开始时 Lagavulin 处于沉睡状态，持续 3 回合或直到受到攻击。醒来时使用 Siphon Soul 窃取你的属性。

## 弱点分析

Lagavulin 的沉睡期是它的致命弱点——你获得了 **3 个完全免费的回合**来准备。这 3 回合可以做任何事：叠力量、堆毒药、铺 Orb、锻造武器。它不会还手。等到你准备完毕再唤醒它，用最强的状态迎战。

关键决策点是：**第几回合唤醒它**。越晚唤醒，你的准备越充分，但它的血量也需要更多回合来打掉。

## 行动模式

| 阶段 | 行动 | 效果 |
|------|------|------|
| 沉睡 | Sleep | 持续 3 回合，受攻击则立即醒来 |
| 醒来 | Siphon Soul | -1 力量, -1 敏捷 |
| 战斗 | Attack | 每回合 18 伤害 |

## 克制策略

- **最大化沉睡期**: 3 个免费回合 = 免费叠 9 点力量 / 3 个 Orb / 大量毒药。
- **准备完毕再唤醒**: 不要着急打它，确保 Buff 就位后再动手。
- **Siphon Soul 的影响**: -1 力量/敏捷代价较小，不用过度担心。
- **18 点伤害的节奏**: 醒来后每回合 18 伤害意味着你必须在 5-6 回合内结束战斗。

## 各角色应对

| 角色 | 推荐策略 |
|------|----------|
| 铁甲战士 | 沉睡期叠力量 + 格挡，醒来后 Heavy Blade 秒杀 |
| 静默猎手 | 叠毒药和匕首，醒来时毒药已经堆够了 |
| 故障机器人 | 铺满 Orb，醒来后 Evoke 爆发 |
| 死灵契约师 | 铺 Doom 和召唤 Soul |
| 储君 | 锻造王权之剑，准备 Command |`
  },
  'slime-boss': {
    act: 1, hp_range: '140-150', is_elite: false, is_boss: true,
    weakness: '一次性造成高额爆发伤害可以直接跳过分裂阶段完成击杀。另外分裂后的两个小 Slime 各自只有 ~70 HP。',
    moves: [
      { name: 'Goop Spray', effect: '向弃牌堆添加 3 张 Slimed 状态牌', damage: '0' },
      { name: 'Slam', effect: '重击', damage: '35' },
      { name: 'Split', effect: 'HP ≤ 50% 时分裂为 Spike Slime 和 Acid Slime', damage: '0' },
    ],
    body: `# Slime Boss

> **类型**: Boss | **章节**: Act 1 | **生命值**: 140-150

## Core Mechanic

**分裂**: 生命值降至 50% 以下时，Slime Boss 分裂为两个独立的敌人：**Spike Slime**（带反伤）和 **Acid Slime**（施加虚弱/脆弱）。

## 弱点分析

分裂机制是把双刃剑——如果你能在分裂前造成 140+ 伤害，Slime Boss 直接死亡，完全跳过分裂阶段。这是最理想的打法。

但如果做不到，就要精心控制血量线。在 Boss 血量接近 51%（~72-75 HP）时暂停攻击，等准备好爆发后再触发分裂。分裂后的两个小 Slime 各自血量不高，但 Spike Slime 的反伤（Thorns）会惩罚多段攻击。

## 行动模式

| 行动 | 伤害 | 效果 |
|------|------|------|
| Goop Spray | 0 | 添加 3 张 Slimed 到弃牌堆 |
| Slam | 35 | 单体高伤害 |
| Split | 0 | HP 降至 50% 以下时触发分裂 |

## 分裂后

| 小怪 | 特性 |
|------|------|
| **Spike Slime** | 自带 Thorns（反伤） |
| **Acid Slime** | 施加 Weak（虚弱）+ Frail（脆弱） |

## 克制策略

### 策略一: 爆发秒杀（推荐）
- 在 Split 触发前攒够 140+ 伤害的爆发回合
- 需要高爆发卡组（力量流/毒药爆发/Orb Evoke）

### 策略二: 控制分裂
- 将 Boss 血量控在 ~51%
- 准备好 AOE 技能处理分裂后的双怪
- 优先击杀 Acid Slime（它的 debuff 更烦人）

- **Slimed 管理**: Goop Spray 会污染你的牌库，有 exhaust 手段会好打很多。
- **Slam 的威胁**: 35 伤害是 Act 1 最高单体伤害之一，必须有足够的格挡准备。

## 各角色应对

| 角色 | 推荐策略 |
|------|----------|
| 铁甲战士 | 力量 + Heavy Blade 爆发秒杀，AOE 处理分裂 |
| 静默猎手 | 毒药无视 Thorns，Catalyst 爆发 |
| 故障机器人 | 闪电球 AOE，Dark Orb 存爆发 |
| 死灵契约师 | Doom 持续伤害无视分裂 |
| 储君 | 锻造后的王权之剑 + Command 爆发 |`
  },
  'hexaghost': {
    act: 1, hp_range: '250-264', is_elite: false, is_boss: true,
    weakness: 'Inferno 伤害与你的当前 HP 成正比。如果你在 Activate 前保持低血量，Inferno 伤害会大幅降低。',
    moves: [
      { name: 'Activate', effect: '根据玩家当前 HP 计算下次 Inferno 伤害', damage: '0' },
      { name: 'Inferno', effect: '6 段攻击，向弃牌堆添加 Burn', damage: '6×N' },
      { name: 'Sear', effect: '攻击并向弃牌堆添加 Burn', damage: '6' },
      { name: 'Inflame', effect: '获得 2 力量', damage: '0' },
    ],
    body: `# Hexaghost

> **类型**: Boss | **章节**: Act 1 | **生命值**: 250-264

## Core Mechanic

**Inferno 激活系统**: Hexaghost 的核心机制是 Activate → Inferno 循环。Activate 时根据你的 **当前 HP** 决定 Inferno 的伤害基数——HP 越高，Inferno 越痛。这是一个反直觉的机制：**低血量反而不那么危险**。

## 弱点分析

Hexaghost 最大的设计弱点是 **Inferno 伤害与玩家 HP 正相关**。这意味着你不需要在 Activate 前保持满血——事实上，适当压血可以减少 Inferno 的威胁。另外，Hexaghost 的 250+ HP 看起来很多，但它的攻击节奏给了你充足的准备回合。

Burn 牌的污染是另一个需要注意的点，但只要有足够的抽牌或 exhaust 手段就可以应对。

## 行动模式

| 回合 | 行动 | 伤害 | 说明 |
|------|------|------|------|
| T1 | Activate | 0 | 根据你的 HP 设定 Inferno 伤害 |
| T2 | Inferno | 变量 | 6 段攻击 + 添加 Burn |
| T3 | Sear | 6 | 攻击 + 添加 Burn |
| T4 | Inflame | 0 | +2 力量 |
| T5+ | 循环 | — | 回到 Activate |

## 克制策略

- **HP 管理是核心**: 在 Activate 回合前不要急着回血。50% HP 时的 Inferno 比满血时弱很多。
- **Activate 回合是免费的**: T1 和每个循环的 Activate 回合 Hexaghost 不攻击，趁机输出。
- **Burn 处理**: Inferno 和 Sear 会大量添加 Burn，确保有足够的抽牌或 exhaust 手段。
- **Inferno 回合防御**: 6 段攻击虽然每段伤害不高，但总计可观。准备好格挡。

## 各角色应对

| 角色 | 推荐策略 |
|------|----------|
| 铁甲战士 | 力量流+Reaper 续航，Barricade 格挡 Inferno |
| 静默猎手 | 毒药无视 HP 持续输出，Wraith Form 挡 Inferno |
| 故障机器人 | 冰霜球被动格挡 + 闪电球输出 |
| 死灵契约师 | Doom 无视一切持续造成伤害 |
| 储君 | 高血量配合爆发输出 |`
  },
  'the-guardian': {
    act: 1, hp_range: '240-250', is_elite: false, is_boss: true,
    weakness: '防御模式的 Thorns 只持续 2 回合且不会攻击。利用这两回合喘息和准备，然后在攻击模式全力输出。',
    moves: [
      { name: 'Fierce Bash', effect: '重击并施加脆弱', damage: '32' },
      { name: 'Vent Steam', effect: '施加 2 层虚弱和脆弱', damage: '0' },
      { name: 'Whirlwind', effect: '连续 4 次攻击', damage: '5×4' },
      { name: 'Defensive Mode', effect: '获得 Thorns 反伤，2 回合后切换', damage: '0' },
    ],
    body: `# The Guardian

> **类型**: Boss | **章节**: Act 1 | **生命值**: 240-250

## Core Mechanic

**模式切换**: The Guardian 在攻击模式和防御模式间切换。受到约 30 点伤害后从攻击模式切换到防御模式，防御模式持续 2 回合后切回。

## 弱点分析

The Guardian 的模式切换是它的核心弱点——防御模式虽然带反伤，但它 **完全不攻击**。这意味着每隔一段时间你就有 2 个免费回合来准备、治疗或叠 Buff。聪明的打法是在防御模式时停止攻击（避免反伤），积攒资源和能量，然后在切换回攻击模式时全力爆发。

32 点伤害的 Fierce Bash 是最危险的技能，必须提前准备格挡。Vent Steam 的 debuff（虚弱+脆弱）会让你的攻防效率大减。

## 行动模式

### 攻击模式
| 行动 | 伤害 | 效果 |
|------|------|------|
| Fierce Bash | 32 | 单体高伤害 + 脆弱 |
| Vent Steam | 0 | 2 层虚弱 + 2 层脆弱 |
| Whirlwind | 5×4 | 4 段攻击，总计 20 伤害 |

### 防御模式
- 获得 Thorns（受到攻击时反弹伤害）
- 持续 2 回合
- 不会主动攻击

## 克制策略

- **控制输出节奏**: 每次输出约 30 伤害后准备进入防御模式。
- **防御模式 = 准备回合**: 不攻击，只叠 Buff/Orb/毒药/锻造。
- **Fierce Bash 格挡**: 32 伤害是 Act 1 最高单体伤害，必须有格挡手段。
- **处理 Debuff**: Vent Steam 的双 debuff 需要用攻击牌/技能牌规划来抵消。
- **反伤对策**: 毒药、Orb 被动伤害、Doom 都可以无视 Thorns 造成伤害。

## 各角色应对

| 角色 | 推荐策略 |
|------|----------|
| 铁甲战士 | 攻击模式输出，防御模式叠力量和格挡 |
| 静默猎手 | 毒药无视 Thorns，防御模式时叠毒 |
| 故障机器人 | 冰霜球在防御模式下积攒，Dark Orb 存爆发 |
| 死灵契约师 | Doom 无视 Thorns 持续伤害 |
| 储君 | 锻造王权之剑，防御模式时准备 Command |`
  },
};

const dir = 'D:/project/gnglue/src/content/enemies';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.mdx') && f !== 'enemies.mdx');

files.forEach(f => {
  const slug = path.basename(f, '.mdx');
  const data = enemyData[slug];
  if (!data) {
    console.log(`SKIP ${f} — no data`);
    return;
  }

  const imageLine = `  "https://static0.fextralifeimages.com/file/slaythespire2/"`; // placeholder, will be replaced

  const frontmatter = `---
name: "${data.body.match(/# (.+)/)?.[1] || slug}"
slug: "${slug}"
image: "${getImage(slug)}"
game: "slay-the-spire-2"
act: ${data.act}
hp_range: "${data.hp_range}"
is_elite: ${data.is_elite}
is_boss: ${data.is_boss}
weakness: "${data.weakness}"
moves:
${data.moves.map(m => `  - name: "${m.name}"
    effect: "${m.effect}"
    damage: "${m.damage}"`).join('\n')}
phase: "research"
---

${data.body}

## Tags


---
`;

  fs.writeFileSync(path.join(dir, f), frontmatter);
  console.log(`✓ ${f}`);
});

function getImage(slug) {
  const images = {
    'cultist': 'https://static0.fextralifeimages.com/file/slaythespire2/8/82/Sts2-enemy-cultist.png',
    'jaw-worm': 'https://static0.fextralifeimages.com/file/slaythespire2/d/d2/Sts2-enemy-jaw-worm.png',
    'gremlin-nob': 'https://static0.fextralifeimages.com/file/slaythespire2/1/12/Sts2-enemy-gremlin-nob.png',
    'lagavulin': 'https://static0.fextralifeimages.com/file/slaythespire2/c/c5/Sts2-enemy-lagavulin.png',
    'slime-boss': 'https://static0.fextralifeimages.com/file/slaythespire2/c/cf/Sts2-enemy-slime-boss.png',
    'hexaghost': 'https://static0.fextralifeimages.com/file/slaythespire2/9/9b/Sts2-enemy-hexaghost.png',
    'the-guardian': 'https://static0.fextralifeimages.com/file/slaythespire2/6/6c/Sts2-enemy-the-guardian.png',
  };
  return images[slug] || '';
}
