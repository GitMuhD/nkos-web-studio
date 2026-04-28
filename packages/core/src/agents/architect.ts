import { BaseAgent } from "./base.js";
import type { BookConfig, FanficMode } from "../models/book.js";
import type { GenreProfile } from "../models/genre-profile.js";
import { readGenreProfile } from "./rules-reader.js";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { renderHookSnapshot } from "../utils/memory-retrieval.js";

export interface ArchitectRole {
  readonly tier: "major" | "minor";
  readonly name: string;
  readonly content: string;
}

export interface ArchitectOutput {
  readonly storyBible: string;
  readonly volumeOutline: string;
  readonly bookRules: string;
  readonly currentState: string;
  readonly pendingHooks: string;
  // Phase 5 新增字段：段落式架构稿 + 一人一卡角色目录。Optional，老测试 fixture 只 mock
  // 旧字段时依然能编译；架构师在运行时始终填充这些。
  readonly storyFrame?: string;
  readonly volumeMap?: string;
  readonly rhythmPrinciples?: string;
  readonly roles?: ReadonlyArray<ArchitectRole>;
}

/** 拆 markdown 的首部 YAML frontmatter 和正文。没有 frontmatter 时返回 frontmatter: null。 */
function extractYamlFrontmatter(raw: string): { frontmatter: string | null; body: string } {
  if (!raw) return { frontmatter: null, body: "" };
  const stripped = raw.replace(/^```(?:md|markdown|yaml)?\s*\n/, "").replace(/\n```\s*$/, "");
  const leadingMatch = stripped.match(/^\s*---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!leadingMatch) {
    return { frontmatter: null, body: stripped };
  }
  return {
    frontmatter: `---\n${leadingMatch[1]}\n---`,
    body: leadingMatch[2].trim(),
  };
}

export class ArchitectAgent extends BaseAgent {
  get name(): string {
    return "architect";
  }

  async generateFoundation(
    book: BookConfig,
    externalContext?: string,
    reviewFeedback?: string,
    options?: {
      reviseFrom?: {
        storyBible: string;
        volumeOutline: string;
        bookRules: string;
        characterMatrix: string;
        userFeedback: string;
      };
    },
  ): Promise<ArchitectOutput> {
    const { profile: gp, body: genreBody } =
      await readGenreProfile(this.ctx.projectRoot, book.genre);
    const resolvedLanguage = book.language ?? gp.language;

    const contextBlock = externalContext
      ? `\n\n## 外部指令\n以下是来自外部系统的创作指令，请将其融入设定中：\n\n${externalContext}\n`
      : "";
    const reviewFeedbackBlock = this.buildReviewFeedbackBlock(reviewFeedback, resolvedLanguage);
    const revisePrompt = options?.reviseFrom
      ? this.buildRevisePrompt(options.reviseFrom)
      : "";

    const numericalBlock = gp.numericalSystem
      ? `- 有明确的数值/资源体系可追踪
- 在 book_rules 中定义 numericalSystemOverrides（hardCap、resourceTypes）`
      : "- 本题材无数值系统，不需要资源账本";

    const powerBlock = gp.powerScaling
      ? "- 有明确的战力等级体系"
      : "";

    const eraBlock = gp.eraResearch
      ? "- 需要年代考据支撑（在 book_rules 中设置 eraConstraints）"
      : "";

    const basePrompt = resolvedLanguage === "en"
      ? this.buildEnglishFoundationPrompt(book, gp, genreBody, contextBlock, reviewFeedbackBlock, numericalBlock, powerBlock, eraBlock)
      : this.buildChineseFoundationPrompt(book, gp, genreBody, contextBlock, reviewFeedbackBlock, numericalBlock, powerBlock, eraBlock);
    const systemPrompt = revisePrompt + basePrompt;

    const langPrefix = resolvedLanguage === "en"
      ? `【LANGUAGE OVERRIDE】ALL output (story_frame, volume_map, roles, book_rules, pending_hooks) MUST be written in English. Character names, place names, and all prose must be in English. The === SECTION: === tags remain unchanged. Do NOT emit rhythm_principles or current_state sections — rhythm principles live inside the last paragraph of volume_map; environment/era anchors (when relevant) are woven into story_frame's world-tonal-ground paragraph.\n\n`
      : "";
    const userMessage = resolvedLanguage === "en"
      ? `Generate the complete foundation for a ${gp.name} novel titled "${book.title}". Write everything in English.`
      : `请为标题为"${book.title}"的${gp.name}小说生成完整基础设定。`;

    const response = await this.chat([
      { role: "system", content: langPrefix + systemPrompt },
      { role: "user", content: userMessage },
    ], { temperature: 0.8, maxTokens: 16384 });

    return this.parseSections(response.content);
  }

  private buildRevisePrompt(reviseFrom: {
    storyBible: string;
    volumeOutline: string;
    bookRules: string;
    characterMatrix: string;
    userFeedback: string;
  }): string {
    return `你在把一本已有书的架构稿从条目式升级成段落式架构稿 + 一人一卡的角色目录。

原书信息（条目式架构稿原文，这是权威内容，必须完整保留里面的世界观 / 角色 / 主线 / 伏笔）：

【story_bible.md 全文】
${reviseFrom.storyBible || "（无）"}

【volume_outline.md 全文】
${reviseFrom.volumeOutline || "（无）"}

【book_rules.md 全文】
${reviseFrom.bookRules || "（无）"}

【character_matrix.md 全文】
${reviseFrom.characterMatrix || "（无）"}

你的任务：
1. 把 story_bible 的内容重新组织成 4 段段落式 story_frame.md（主题 / 核心冲突 / 世界观底色 / 终局方向）
2. 把 volume_outline 的内容重新组织成 5 段 volume_map.md + 末尾 1 段节奏原则
3. 把 character_matrix 里的每个角色拆成一份 roles/主要角色/<name>.md 或 roles/次要角色/<name>.md

严格约束：
- 世界观设定、角色设定、主线走向、已埋下的伏笔一个字都不能丢
- 如果原内容里有 bullet 点，把它们连成段落；不要只是把 bullet 转成句号分隔
- 主次角色的判断依据：character_matrix 里已标注的如果有，沿用；没有的话，把在 volume_outline 里出现频次高、或者承担主线冲突的列为主要，其余为次要
- 基调 / 语气不要改变
- 如果原内容里留有空白或未展开项，保留为空，不要主动补全

用户额外要求：
${reviseFrom.userFeedback || "（无）"}

---

`;
  }

  // -------------------------------------------------------------------------
  // Phase 5 段落式 prompt — zh
  // -------------------------------------------------------------------------
  private buildChineseFoundationPrompt(
    book: BookConfig,
    gp: GenreProfile,
    genreBody: string,
    contextBlock: string,
    reviewFeedbackBlock: string,
    numericalBlock: string,
    powerBlock: string,
    eraBlock: string,
  ): string {
    return `你是这本书的总架构师。你的唯一输出是**段落密度的基础设定**——不是表格、不是 schema、不是条目化 bullet。这本书的"灵气"从你这里来。你的段落密度决定了后面 planner 能不能读出"稀疏 memo"，writer 能不能写出活人，reviewer 能不能校准硬伤。${contextBlock}${reviewFeedbackBlock}

## 书籍元信息
- 平台：${book.platform}
- 题材：${gp.name}（${book.genre}）
- 目标章数：${book.targetChapters}章
- 每章字数：${book.chapterWordCount}字
- 标题：${book.title}

## 题材底色
${genreBody}

## 产出约束（硬性）
${numericalBlock}
${powerBlock}
${eraBlock}

## 输出结构（5 个 SECTION，严格按 === SECTION: === 分块，不要漏任何一块）

## 去重铁律（必读）
禁止在多段里重复同一事实。主角的完整角色线只写在 roles；世界铁律只写在 story_frame.世界观底色；节奏原则只写在 volume_map 最后一段；角色当前现状只写在 roles.当前现状；初始钩子只写在 pending_hooks（startChapter=0 行）。**如果本书是年代文/历史同人/都市重生等需要年份、季节、重大历史事件作为锚点的题材**，把环境/时代锚自然织进 story_frame.世界观底色（"1985 年 7 月，非典刚过"这类）；**修仙/玄幻/系统等没有真实年份的题材直接省略**，不要硬凑。如果一个段落写了另一段的内容，删掉。

## 预算（超预算必删）
- story_frame ≤ 3000 字
- volume_map ≤ 5000 字
- roles 总 ≤ 8000 字
- book_rules ≤ 500 字（仅 YAML）
- pending_hooks ≤ 2000 字

=== SECTION: story_frame ===

这是段落式骨架。**4 段**，每段约 600-900 字，不要写表格，不要写 bullet list，写成能被人读下去的段落。段落标题用 \`## \` 开头，段落内部是正经段落。**主角的完整角色线不写在本 section；它的权威来源是 roles/主要角色/<主角>.md。** 本段只需一句指针："本书主角是 X，完整角色线详见 roles/主要角色/X.md"。

### 段 1：主题与基调
写这本书到底讲的是什么——不是"讲主角如何从弱到强"这种空话，而是具体的命题（"一个被时代按在泥里的人，如何选择不被改写"、"当所有人都在撒谎时，坚持记录真相要付出什么代价"）。主题下面跟着基调——温情冷冽悲壮肃杀，哪一种？为什么是这种而不是另一种？结尾用一句话指向主角并引向 roles（例："本书主角是林辞，完整角色线详见 roles/主要角色/林辞.md"）。

### 段 2：核心冲突与对手定性
这本书的主要矛盾是什么？不是"正邪对抗"，而是"因为 A 相信 X、B 相信 Y，所以他们一定会在某件事上对撞"。主要对手是谁（至少 2 个：一个显性对手 + 一个结构性对手/体制），他们的动机从哪里长出来。对手不是工具，对手有自己的逻辑。

### 段 3：世界观底色（铁律 + 质感 + 本书专属规则）
这个世界的运行规则是什么？3-5 条**不可违反的铁律**——以段落形式写出，不要 bullet。这个世界的质感是什么——湿的还是干的、快的还是慢的、噪的还是静的？给 writer 一个明确的感官锚。**这一段同时承担原先 book_rules 正文里写的"叙事视角 / 本书专属规则 / 核心冲突驱动"等内容**——全部合并到这里写一次就够，不要再去 book_rules 重复。

### 段 4：终局方向
这本书最后一章大概是什么感觉——不是"主角登顶"、"大结局"这种套话，而是**最后一个镜头**大致长什么样。主角最后在哪、做什么、身边有谁、心里想什么。这是给全书所有后面的规划一个远方靶子。

=== SECTION: volume_map ===

这是分卷段落式地图，**5 段主体 + 1 段节奏原则尾段**。**关键要求：只写到卷级内容**——写清楚每卷的主题、情绪曲线、卷间钩子、角色阶段目标、卷尾不可逆事件。**禁止指定具体章号任务**（不要写"第 17 章让他回家"这种章级布局）。章级规划是 Phase 3 planner 的职责，架构师只搭骨架、不编章目。

### 段 1：各卷主题与情绪曲线
有几卷？每卷的主题一句话，每卷的情绪曲线一段（哪里压、哪里爽、哪里冷、哪里暖）。不要机械的"第一卷打小怪第二卷打大怪"，写情绪的流动。

### 段 2：卷间钩子与回收承诺
第 1 卷埋什么钩子、在哪一卷回收；第 2 卷埋什么、在哪一卷回收。段落式写，不要表格。**只写卷级**（如"第 1 卷埋的身世之谜在第 3 卷回收"），不要写具体章号。

### 段 3：角色阶段性目标
主角在第 1 卷末要到什么状态？第 2 卷末？每一卷结束时主角的身份/关系/能力/心境应该是什么。次要角色的阶段性变化也要点到（师父在第 2 卷会死、对手在第 3 卷会黑化等）。写阶段性，不写完整角色线（完整角色线在 roles）。

### 段 4：卷尾必须发生的改变
每一卷最后一章必须发生什么不可逆的事——权力结构改变、关系破裂、秘密暴露、主角身份重定位。写段落，一卷一段。**只写"必须发生什么"，不指定是第几章**。

### 段 5：节奏原则（具体化 + 通用）
**这是节奏原则的唯一归宿，不再有独立 rhythm_principles section。** 本段输出 6 条节奏原则。**至少 3 条必须具体化到本书**（例："前 30 章每 5 章一个小爽点"），其余可保留通用原则（例："拒绝机械降神"、"高潮前 3-5 章埋伏笔"）。具体化 + 通用混合是合法的。反面例子："节奏要张弛有度"（废话）。正面例子："前 30 章每 5 章一个小爽点，且小爽点必须落在章末 300 字内"。6 条各写 2-3 句，覆盖（顺序不强制、可替换同权重议题）：
1. 高潮间距——本书大高潮之间最长多少章？（具体化优先）
2. 喘息频率——高压段多长必须插一章喘息？喘息章承担什么任务？
3. 钩子密度——每章章末留钩数量，主钩最多允许悬多少章？
4. 信息释放节奏——主线信息在前 1/3、中段、后 1/3 分别释放多少比例？（可通用）
5. 爽点节奏——爽点间距多少章一个？什么类型为主？（具体化优先）
6. 情感节点递进——情感关系每多少章必须有一次实质推进？

### 黄金三章法则（前三章必须遵循）
- 第1章：抛出核心冲突（主角立即面临困境/危机/选择），禁止大段背景灌输
- 第2章：展示金手指/核心能力（主角如何应对第1章的困境），让读者看到爽点预期
- 第3章：明确短期目标（主角确立第一个具体可达成的目标），给读者追读理由

=== SECTION: roles ===

一人一卡。**主角卡是本书角色线的唯一权威来源**——story_frame 不再写主角的完整角色线，writer/planner 都从这里读。用以下格式分隔：

---ROLE---
tier: major
name: <角色名>
---CONTENT---
（这里写段落式角色卡，下面的小标题必须全部出现，每段至少 3 行正经段落，不要写表格）

## 核心标签
（3-5 个关键词 + 一句话为什么是这些词）

## 反差细节
（1-2 个与核心标签反差的具体细节——"冷酷杀手但会给流浪猫留鱼骨"。反差细节是人物立体化的公式，必须有。）

## 人物小传（过往经历）
（一段段落，说这个人怎么变成现在这样。童年/重大事件/塑造性格的那件事。只写关键过往，简版。）

## 主角线（起点 → 终点 → 代价）
**只有主角必须写本段；其他 major 角色如果分量重也可以写，否则略过。**主角从哪里出发（身份、处境、核心缺陷、一开始最想要什么），到哪里落脚（最终变成什么样的人、拿到/失去什么），为了这个落脚他付出了什么不可逆的代价（关系、身体、信念、某段过去）。不要只写"变强"这种平面变化，要写**内在的位移**。写足写实。

## 当前现状（第 0 章初始状态）
（第 0 章时他在哪、做什么、处境如何、最近最烦心的事。**只写角色个人处境**——初始钩子写在 pending_hooks 的 startChapter=0 行；环境/时代锚（如果是需要年份的题材）织进 story_frame.世界观底色。不再有独立的 current_state section。）

## 关系网络
（与主角、与其他重要角色的关系——一句话一条，关系不是标签是动态。）

## 内在驱动
（他想要什么、为什么想要、愿意付出什么代价。）

## 成长变化
（他在这本书里会经历什么内在位移——变好变坏变复杂，落在哪里。非主角可短可长。）

---ROLE---
tier: major
name: <下一个主要角色>
---CONTENT---
...

（主要角色至少 3 个：主角 + 主要对手 + 主要协作者。建议 2-3 主 + 2-3 辅，不要灌水。质量 > 数量。）

---ROLE---
tier: minor
name: <次要角色名>
---CONTENT---
（次要角色简化版，只需要 4 个小标题：核心标签 / 反差细节 / 当前现状 / 与主角关系，每段 1-2 行即可）

（次要角色 3-5 个，按出场密度给。）

=== SECTION: book_rules ===

**只输出 YAML frontmatter 一块——零段落正文。** 所有的"叙事视角 / 本书专属规则 / 核心冲突驱动"等段落已经合并到 story_frame.世界观底色，不要在这里重复写。
\`\`\`
---
version: "1.0"
protagonist:
  name: (主角名)
  personalityLock: [(3-5个性格关键词)]
  behavioralConstraints: [(3-5条行为约束)]
genreLock:
  primary: ${book.genre}
  forbidden: [(2-3种禁止混入的文风)]
${gp.numericalSystem ? `numericalSystemOverrides:
  hardCap: (根据设定确定)
  resourceTypes: [(核心资源类型列表)]` : ""}
prohibitions:
  - (3-5条本书禁忌)
chapterTypesOverride: []
fatigueWordsOverride: []
additionalAuditDimensions: []
enableFullCastTracking: false
---
\`\`\`

=== SECTION: pending_hooks ===

初始伏笔池（Markdown表格，8 列基础版）：
| hook_id | 起始章节 | 类型 | 状态 | 最近推进 | 预期回收 | 回收节奏 | 备注 |

伏笔表规则：
- 第5列必须是纯数字章节号，不能写自然语言描述
- 建书阶段所有伏笔都还没正式推进，所以第5列统一填 0
- 第7列必须填写：立即 / 近期 / 中程 / 慢烧 / 终局 之一
- 初始线索放备注列，不放第5列
- **初始世界状态 / 初始敌我关系** 如果有关键信息（例如"主角身上带着父亲的笔记本"、"体制已经开始监视码头"），可以作为 startChapter=0 的种子行录入，备注列说明其"初始状态"属性

## 最后强调
- 符合${book.platform}平台口味、${gp.name}题材特征
- 主角人设鲜明、行为边界清晰
- 伏笔前后呼应、配角有独立动机不是工具人
- **story_frame / volume_map / roles 必须是段落密度，不要退化成 bullet**
- **book_rules 只留 YAML，不要写段落正文**
- **不要输出 rhythm_principles 或 current_state 独立 section**——节奏原则合并进 volume_map 尾段；角色初始状态写在 roles.当前现状，初始钩子写在 pending_hooks（startChapter=0 行），环境/时代锚（仅历史/年代/都市重生等需要年份的题材）织进 story_frame.世界观底色，不要硬凑`;
  }

  // -------------------------------------------------------------------------
  // Phase 5 段落式 prompt — en
  // -------------------------------------------------------------------------
  private buildEnglishFoundationPrompt(
    book: BookConfig,
    gp: GenreProfile,
    genreBody: string,
    contextBlock: string,
    reviewFeedbackBlock: string,
    numericalBlock: string,
    powerBlock: string,
    eraBlock: string,
  ): string {
    return `You are the architect of this book. Your only job is to produce **prose-density foundation design** — not tables, not schema, not bullet lists. The book's aura comes from your prose density: the Phase 3 planner reads sparse memos out of your volume_map only if it was written to chapter-level prose; the writer only produces living characters because your role sheets carry contrast details; the reviewer only catches hard errors because your story_frame set the tonal anchors.${contextBlock}${reviewFeedbackBlock}

## Book metadata
- Platform: ${book.platform}
- Genre: ${gp.name} (${book.genre})
- Target chapters: ${book.targetChapters}
- Chapter length: ${book.chapterWordCount}
- Title: ${book.title}

## Genre body
${genreBody}

## Output constraints
${numericalBlock}
${powerBlock}
${eraBlock}

## Output contract (5 === SECTION: === blocks)

## Deduplication rule (MANDATORY)
Do not duplicate the same fact across sections. The protagonist's full character arc lives only in roles; world hard-rules live only in story_frame; rhythm principles live only in the last paragraph of volume_map; character initial status lives only in roles.Current_State; initial hooks live only in pending_hooks (start_chapter=0 rows). **When the book is period fiction / historical fanfic / urban reincarnation** — anything pinned to a real year, season, or historic marker — weave the environment/era anchor into story_frame's world-tonal-ground paragraph. **For cultivation / high-fantasy / system genres that have no real-world year, skip it entirely** — do not fabricate an era anchor. If a section repeats content that belongs elsewhere, delete it.

## Output budget (over-budget means cut)
- story_frame ≤ 3000 chars
- volume_map ≤ 5000 chars
- roles ≤ 8000 chars total
- book_rules ≤ 500 chars (YAML only)
- pending_hooks ≤ 2000 chars

=== SECTION: story_frame ===

Four prose sections, ~600-900 chars each. No tables. No bullet lists. Real paragraphs. **Do NOT write the protagonist's full character arc here** — that is owned by roles/主要角色/<protagonist>.md. Use a single-line pointer inside this block.

## 01_Theme_and_Tonal_Ground
What is this book actually about — not "hero grows from weak to strong" (empty), but a concrete proposition. Then the tonal ground: warm / cold / fierce / severe — which, and why this and not another. End with a one-line pointer to the protagonist role file.

## 02_Core_Conflict_and_Opponent
The book's main tension — not "good vs evil" but "because A believes X and B believes Y, they will inevitably collide on Z". At least two opponents: one visible, one structural/systemic. Opponents have their own logic.

## 03_World_Tonal_Ground (hard rules + sensory tone + book-specific rules)
The world's operating rules. 3-5 unbreakable laws written as prose, not bullets. Sensory texture: wet or dry, fast or slow, noisy or quiet — give the writer an anchor. **This paragraph also absorbs the narrative prose that used to live in book_rules** (narrative perspective, core conflict driver, book-specific rules). Write them all here once. Do not repeat them in book_rules.

## 04_Endgame_Direction
What the last chapter roughly feels like. The final shot: where, doing what, around whom, thinking what. A distant target for every planner call downstream.

=== SECTION: volume_map ===

Prose volume map, **5 sections + 1 closing rhythm paragraph**. **Critical requirement: stay at volume-level prose only**. No chapter-level task assignment.

## 01_Volume_Themes_and_Emotional_Curves
How many volumes? Each volume's theme in one sentence; each volume's emotional curve as a paragraph.

## 02_Cross_Volume_Hooks_and_Payoff_Promises
Volume 1 plants hook A, paid off in volume N; volume 2 plants hook B, paid off in volume M. Prose, not tables. **Stay at volume-level**.

## 03_Character_Stage_Goals
Protagonist's state at end of vol 1, vol 2, ... Supporting characters' stage changes. Stage goals only — full character arc lives in roles.

## 04_Volume_End_Mandatory_Changes
Each volume's last chapter must contain an irreversible event. Prose, one paragraph per volume.

## 05_Rhythm_Principles (concrete + universal)
**Single home for rhythm principles — no separate rhythm_principles section.** 6 rhythm principles. **At least 3 must be concretized for this book**; the rest may stay as universal rules.

### Golden First Three Chapters Rule
- Chapter 1: throw the core conflict immediately; no large background dump
- Chapter 2: show the core edge / ability / leverage that answers Chapter 1's pressure
- Chapter 3: establish the first concrete short-term goal that gives readers a reason to continue

=== SECTION: roles ===

One-file-per-character prose. **The protagonist card is the single source of truth for the protagonist's full character arc** — story_frame no longer carries it, and writer/planner both read it here.

---ROLE---
tier: major
name: <character name>
---CONTENT---
## Core_Tags
(3-5 tags + one sentence on why)

## Contrast_Detail
(1-2 concrete details that contradict the core tags.)

## Back_Story
(Prose paragraph — how this person became who they are.)

## Protagonist_Arc (start → end → cost)
**Mandatory for the protagonist; optional for other majors with substantial arcs.** Internal displacement, not just growth.

## Current_State (initial state at chapter 0)
(Character-only: initial hooks go in pending_hooks start_chapter=0 rows; environment/era anchors weave into story_frame.)

## Relationship_Network
(With protagonist, with other majors. One line each.)

## Inner_Driver
(What they want, why, what they're willing to pay.)

## Growth_Arc
(Internal displacement across the book.)

---ROLE---
tier: major
name: <next major>
---CONTENT---
...

(Aim for 2-3 majors + 2-3 supporting majors. Quality over quantity.)

---ROLE---
tier: minor
name: <minor name>
---CONTENT---
(Simplified: Core_Tags / Contrast_Detail / Current_State / Relationship_to_Protagonist only, 1-2 lines each.)

(3-5 minors.)

=== SECTION: book_rules ===

**Output ONLY the YAML frontmatter block — zero prose.** All narrative guidance moved into story_frame.03_World_Tonal_Ground.
\`\`\`
---
version: "1.0"
protagonist:
  name: (protagonist name)
  personalityLock: [(3-5 personality keywords)]
  behavioralConstraints: [(3-5 behavioral constraints)]
genreLock:
  primary: ${book.genre}
  forbidden: [(2-3 forbidden style intrusions)]
${gp.numericalSystem ? `numericalSystemOverrides:
  hardCap: (decide from setting)
  resourceTypes: [(core resource types)]` : ""}
prohibitions:
  - (3-5 book-specific prohibitions)
chapterTypesOverride: []
fatigueWordsOverride: []
additionalAuditDimensions: []
enableFullCastTracking: false
---
\`\`\`

=== SECTION: pending_hooks ===

Initial hook pool (Markdown table, 8-column base):
| hook_id | start_chapter | type | status | last_advanced_chapter | expected_payoff | payoff_timing | notes |

Rules:
- Column 5 is a pure chapter number, not narrative description
- At book creation all planned hooks have last_advanced_chapter = 0
- Column 7 must be: immediate / near-term / mid-arc / slow-burn / endgame
- Put initial signal text in notes, not column 5
- **Initial world / alliance state**: any load-bearing initial condition can be seeded as a start_chapter=0 row with a notes tag indicating its initial-state nature

## Final emphasis
- Fit ${book.platform} platform taste and ${gp.name} genre traits
- Protagonist persona clear with sharp behavioral boundaries
- Hooks planted with payoff promises; supporting characters have independent motivation
- **story_frame / volume_map / roles must be prose density — no bullet-list degradation**
- **book_rules is YAML only — no prose body**
- **Do NOT emit rhythm_principles or current_state as separate sections** — rhythm principles live in the last paragraph of volume_map; character initial status goes in roles.Current_State; initial hooks go in pending_hooks (start_chapter=0 rows); environment/era anchors (only when the genre has a real year) are woven into story_frame`;
  }

  /**
   * Write architect foundation output to disk.
   *
   * @param mode
   *   - "init"（默认）：首次建书。写架构稿 + 初始化所有运行时状态文件
   *     （current_state / pending_hooks / particle_ledger / subplot_board /
   *     emotional_arcs）为空模板。
   *   - "revise"：在已有书上重写架构稿。**只改架构稿相关文件**——outline/ /
   *     roles/ / 4 个 legacy shim——**完全不动运行时状态文件**。这和
   *     context-transform 注入给 LLM 的 upgrade hint 承诺"只改架构稿不动已写
   *     章节"一致；如果在 revise 模式下触动运行时文件，会把 consolidator 累积
   *     的章节状态、伏笔推进、资源账本等全部重置。
   */
  async writeFoundationFiles(
    bookDir: string,
    output: ArchitectOutput,
    numericalSystem: boolean = true,
    language: "zh" | "en" = "zh",
    mode: "init" | "revise" = "init",
  ): Promise<void> {
    const storyDir = join(bookDir, "story");
    const outlineDir = join(storyDir, "outline");
    const rolesDir = join(storyDir, "roles");
    const rolesMajorDir = join(rolesDir, "主要角色");
    const rolesMinorDir = join(rolesDir, "次要角色");

    await Promise.all([
      mkdir(storyDir, { recursive: true }),
      mkdir(outlineDir, { recursive: true }),
      mkdir(rolesMajorDir, { recursive: true }),
      mkdir(rolesMinorDir, { recursive: true }),
    ]);

    const writes: Array<Promise<void>> = [];

    const storyFrame = output.storyFrame ?? "";
    const volumeMap = output.volumeMap ?? "";
    const rhythmPrinciples = output.rhythmPrinciples ?? "";
    const roles = output.roles ?? [];
    const isPhase5Output = storyFrame.trim().length > 0;

    // debug: 让排查时能一眼看出 LLM 按哪套格式输出、落到哪套文件布局。
    // 如果用户新建书后发现只有 story_bible.md / 没有 outline/，看这行日志能
    // 确认是 LLM 没按新 prompt 输出（走了 legacy 分支），而不是 writeFoundationFiles
    // 本身的 bug。
    this.ctx.logger?.info(
      `[architect] writeFoundationFiles layout=${isPhase5Output ? "phase5" : "legacy"} ` +
      `storyFrame=${storyFrame.length}chars volumeMap=${volumeMap.length}chars roles=${roles.length}`,
    );

    // revise 模式 + LLM 回退 legacy 输出 → 必须抛错，不写任何文件。
    // 原因：如果走 legacy 分支覆盖 story_bible.md 等 flat 文件，而 outline/
    // 和 roles/ 保持不变，会让 Phase 5 书进入"outline 新 + shim 老 + roles
    // 残留"的混乱状态；读取端的 fallback 逻辑会读到互相矛盾的内容。
    // 抛错让用户立刻感知 LLM 响应异常，而不是默默破坏书的数据完整性。
    if (mode === "revise" && !isPhase5Output) {
      throw new Error(
        "Architect revise mode produced legacy-format output (storyFrame empty). " +
        "This likely means the LLM didn't follow the reviseFrom prompt. " +
        "The book's architecture files have NOT been modified. " +
        "Check prompt / model / temperature and try again.",
      );
    }

    // revise 模式下先清空旧 role 文件，再写本次 architect 输出——避免改名 / 删除 /
    // 合并角色后的旧卡片残留被 readRoleCards 当作有效角色继续注入（见 Bug 3）。
    // 备份由上游 runner.reviseFoundation 在调用前完成，这里可以安全清空。
    // init 模式下目录本来就是空的，不需要清。
    // 放在 if (isPhase5Output) 外面，保证所有 revise 场景都清。
    if (mode === "revise") {
      await rm(rolesMajorDir, { recursive: true, force: true });
      await rm(rolesMinorDir, { recursive: true, force: true });
      await mkdir(rolesMajorDir, { recursive: true });
      await mkdir(rolesMinorDir, { recursive: true });
    }

    if (isPhase5Output) {
      // book_rules 的 YAML frontmatter 提取后拼到 story_frame.md 顶部，作为权威位置。
      const { frontmatter: bookRulesFrontmatter, body: bookRulesBody } =
        extractYamlFrontmatter(output.bookRules);
      const storyFrameWithFrontmatter = bookRulesFrontmatter
        ? `${bookRulesFrontmatter}\n\n${storyFrame.trim()}\n`
        : storyFrame;

      // Phase 5 权威文件
      writes.push(writeFile(join(outlineDir, "story_frame.md"), storyFrameWithFrontmatter, "utf-8"));
      writes.push(writeFile(join(outlineDir, "volume_map.md"), volumeMap, "utf-8"));
      if (rhythmPrinciples.trim()) {
        const rhythmFileName = language === "en" ? "rhythm_principles.md" : "节奏原则.md";
        writes.push(writeFile(join(outlineDir, rhythmFileName), rhythmPrinciples, "utf-8"));
      }

      // 一人一卡
      for (const role of roles) {
        const targetDir = role.tier === "major" ? rolesMajorDir : rolesMinorDir;
        const safeName = role.name.replace(/[/\\:*?"<>|]/g, "_").trim();
        if (!safeName) continue;
        writes.push(writeFile(join(targetDir, `${safeName}.md`), role.content, "utf-8"));
      }

      // Legacy shim 文件
      writes.push(writeFile(
        join(storyDir, "story_bible.md"),
        this.buildStoryBibleShim(storyFrameWithFrontmatter, language),
        "utf-8",
      ));
      writes.push(writeFile(
        join(storyDir, "volume_outline.md"),
        volumeMap,
        "utf-8",
      ));
      writes.push(writeFile(
        join(storyDir, "character_matrix.md"),
        this.buildCharacterMatrixShim(roles, language),
        "utf-8",
      ));
      writes.push(writeFile(
        join(storyDir, "book_rules.md"),
        this.buildBookRulesShim(bookRulesBody, language),
        "utf-8",
      ));
    } else {
      // Legacy 输出路径（仅 init 模式——revise + legacy 已在上面抛错）：
      // LLM 还按老 prompt 输出 story_bible / volume_outline，走 Phase 4 落盘方式。
      writes.push(writeFile(join(storyDir, "story_bible.md"), output.storyBible, "utf-8"));
      writes.push(writeFile(join(storyDir, "volume_outline.md"), output.volumeOutline, "utf-8"));
      writes.push(writeFile(join(storyDir, "book_rules.md"), output.bookRules, "utf-8"));
      writes.push(writeFile(
        join(storyDir, "character_matrix.md"),
        language === "en"
          ? "# Character Matrix\n\n<!-- One ## section per character. Add new characters as new ## blocks. -->\n"
          : "# 角色矩阵\n\n<!-- 每个角色一个 ## 块，新角色追加新 ## 即可。 -->\n",
        "utf-8",
      ));
    }

    // 运行时状态文件——**只在 init 模式写**。revise 模式下这些文件已经存在且
    // 被 consolidator 累积了章节状态（伏笔进度、角色位置、资源账本、情感曲线
    // 等），重写会把已写章节的真实状态全部清零，违反 context-transform 里给
    // LLM 的承诺"升级只改架构稿，不动已写的章节"（见 Bug 1）。
    if (mode === "init") {
      // current_state.md — 架构师不再产出结构化初始状态，给占位 seed；运行时由
      // consolidator 每章追加。如果 output 里带了内容（legacy 输出或 reviser
      // 生成），直接用。
      const currentStateSeed = output.currentState?.trim()
        ? output.currentState
        : (language === "en"
            ? "# Current State\n\n> Seeded at book creation. Runtime state is appended by the consolidator after each chapter. Initial per-character state lives in roles/*.Current_State; load-bearing initial world facts live in pending_hooks rows with start_chapter=0.\n"
            : "# 当前状态\n\n> 建书时占位。运行时每章之后由 consolidator 追加最新状态。每个角色的初始状态详见 roles/*.当前现状；承重的初始世界设定见 pending_hooks 里 startChapter=0 的行。\n");
      writes.push(writeFile(join(storyDir, "current_state.md"), currentStateSeed, "utf-8"));
      writes.push(writeFile(join(storyDir, "pending_hooks.md"), output.pendingHooks, "utf-8"));

      // 运行时 append log 文件，下游 state-validator / consolidator 依赖这些存在。
      if (numericalSystem) {
        writes.push(writeFile(
          join(storyDir, "particle_ledger.md"),
          language === "en"
            ? "# Resource Ledger\n\n| Chapter | Opening Value | Source | Integrity | Delta | Closing Value | Evidence |\n| --- | --- | --- | --- | --- | --- | --- |\n| 0 | 0 | Initialization | - | 0 | 0 | Initial book state |\n"
            : "# 资源账本\n\n| 章节 | 期初值 | 来源 | 完整度 | 增量 | 期末值 | 依据 |\n|------|--------|------|--------|------|--------|------|\n| 0 | 0 | 初始化 | - | 0 | 0 | 开书初始 |\n",
          "utf-8",
        ));
      }
      writes.push(writeFile(
        join(storyDir, "subplot_board.md"),
        language === "en"
          ? "# Subplot Board\n\n| Subplot ID | Subplot | Related Characters | Start Chapter | Last Active Chapter | Chapters Since | Status | Progress Summary | Payoff ETA |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
          : "# 支线进度板\n\n| 支线ID | 支线名 | 相关角色 | 起始章 | 最近活跃章 | 距今章数 | 状态 | 进度概述 | 回收ETA |\n|--------|--------|----------|--------|------------|----------|------|----------|---------|\n",
        "utf-8",
      ));
      writes.push(writeFile(
        join(storyDir, "emotional_arcs.md"),
        language === "en"
          ? "# Emotional Arcs\n\n| Character | Chapter | Emotional State | Trigger Event | Intensity (1-10) | Arc Direction |\n| --- | --- | --- | --- | --- | --- |\n"
          : "# 情感弧线\n\n| 角色 | 章节 | 情绪状态 | 触发事件 | 强度(1-10) | 弧线方向 |\n|------|------|----------|----------|------------|----------|\n",
        "utf-8",
      ));
    }

    await Promise.all(writes);
  }

  /**
   * Reverse-engineer foundation from existing chapters.
   * Reads all chapters as a single text block and asks LLM to extract story_bible,
   * volume_outline, book_rules, current_state, and pending_hooks.
   */
  async generateFoundationFromImport(
    book: BookConfig,
    chaptersText: string,
    externalContext?: string,
    reviewFeedback?: string,
    options?: { readonly importMode?: "continuation" | "series" },
  ): Promise<ArchitectOutput> {
    const { profile: gp, body: genreBody } =
      await readGenreProfile(this.ctx.projectRoot, book.genre);
    const resolvedLanguage = book.language ?? gp.language;
    const reviewFeedbackBlock = this.buildReviewFeedbackBlock(reviewFeedback, resolvedLanguage);

    const contextBlock = externalContext
      ? (resolvedLanguage === "en"
          ? `\n\n## External Instructions\n${externalContext}\n`
          : `\n\n## 外部指令\n${externalContext}\n`)
      : "";

    const numericalBlock = gp.numericalSystem
      ? (resolvedLanguage === "en"
          ? `- The story uses a trackable numerical/resource system
- Define numericalSystemOverrides in book_rules (hardCap, resourceTypes)`
          : `- 有明确的数值/资源体系可追踪
- 在 book_rules 中定义 numericalSystemOverrides（hardCap、resourceTypes）`)
      : (resolvedLanguage === "en"
          ? "- This genre has no explicit numerical system and does not need a resource ledger"
          : "- 本题材无数值系统，不需要资源账本");

    const powerBlock = gp.powerScaling
      ? (resolvedLanguage === "en" ? "- The story has an explicit power-scaling ladder" : "- 有明确的战力等级体系")
      : "";

    const eraBlock = gp.eraResearch
      ? (resolvedLanguage === "en"
          ? "- The story needs era/historical grounding (set eraConstraints in book_rules)"
          : "- 需要年代考据支撑（在 book_rules 中设置 eraConstraints）")
      : "";

    const storyBiblePrompt = resolvedLanguage === "en"
      ? `Extract from the source text and organize with structured second-level headings:
## 01_Worldview
Extracted world setting, core rules, and frame

## 02_Protagonist
Inferred protagonist setup (identity / advantage / personality core / behavioral boundaries)

## 03_Factions_and_Characters
Factions and important supporting characters that appear in the source text

## 04_Geography_and_Environment
Locations, environments, and scene traits drawn from the source text

## 05_Title_and_Blurb
Keep the original title "${book.title}" and generate a matching blurb from the source text`
      : `从正文中提取，用结构化二级标题组织：
## 01_世界观
从正文中提取的世界观设定、核心规则体系

## 02_主角
从正文中推断的主角设定（身份/金手指/性格底色/行为边界）

## 03_势力与人物
从正文中出现的势力分布、重要配角（每人：名字、身份、动机、与主角关系、独立目标）

## 04_地理与环境
从正文中出现的地图/场景设定、环境特色

## 05_书名与简介
保留原书名"${book.title}"，根据正文内容生成简介`;

    const volumeOutlinePrompt = resolvedLanguage === "en"
      ? `Infer the volume plan from existing text:
- Existing chapters: review the actual structure already present
- Future projection: predict later directions from active hooks and plot momentum
For each volume include: title, chapter range, core conflict, and key turning points`
      : `基于已有正文反推卷纲：
- 已有章节部分：根据实际内容回顾每卷的结构
- 后续预测部分：基于已有伏笔和剧情走向预测未来方向
每卷包含：卷名、章节范围、核心冲突、关键转折`;

    const bookRulesPrompt = resolvedLanguage === "en"
      ? `Infer book_rules.md as YAML frontmatter plus narrative guidance from character behavior in the source text:
\`\`\`
---
version: "1.0"
protagonist:
  name: (extract protagonist name from the text)
  personalityLock: [(infer 3-5 personality keywords from behavior)]
  behavioralConstraints: [(infer 3-5 behavioral constraints from behavior)]
genreLock:
  primary: ${book.genre}
  forbidden: [(2-3 forbidden style intrusions)]
${gp.numericalSystem ? `numericalSystemOverrides:
  hardCap: (infer from the text)
  resourceTypes: [(extract core resource types from the text)]` : ""}
prohibitions:
  - (infer 3-5 book-specific prohibitions from the text)
chapterTypesOverride: []
fatigueWordsOverride: []
additionalAuditDimensions: []
enableFullCastTracking: false
---

## Narrative Perspective
(Infer the narrative perspective and style from the text)

## Core Conflict Driver
(Infer the book's core conflict and propulsion from the text)
\`\`\``
      : `从正文中角色行为反推 book_rules.md 格式的 YAML frontmatter + 叙事指导：
\`\`\`
---
version: "1.0"
protagonist:
  name: (从正文提取主角名)
  personalityLock: [(从行为推断3-5个性格关键词)]
  behavioralConstraints: [(从行为推断3-5条行为约束)]
genreLock:
  primary: ${book.genre}
  forbidden: [(2-3种禁止混入的文风)]
${gp.numericalSystem ? `numericalSystemOverrides:
  hardCap: (从正文推断)
  resourceTypes: [(从正文提取核心资源类型)]` : ""}
prohibitions:
  - (从正文推断3-5条本书禁忌)
chapterTypesOverride: []
fatigueWordsOverride: []
additionalAuditDimensions: []
enableFullCastTracking: false
---

## 叙事视角
(从正文推断本书叙事视角和风格)

## 核心冲突驱动
(从正文推断本书的核心矛盾和驱动力)
\`\`\``;

    const currentStatePrompt = resolvedLanguage === "en"
      ? `Reflect the state at the end of the latest chapter:
| Field | Value |
| --- | --- |
| Current Chapter | (latest chapter number) |
| Current Location | (location at the end of the latest chapter) |
| Protagonist State | (state at the end of the latest chapter) |
| Current Goal | (current goal) |
| Current Constraint | (current constraint) |
| Current Alliances | (current alliances / opposition) |
| Current Conflict | (current conflict) |`
      : `反映最后一章结束时的状态卡：
| 字段 | 值 |
|------|-----|
| 当前章节 | (最后一章章节号) |
| 当前位置 | (最后一章结束时的位置) |
| 主角状态 | (最后一章结束时的状态) |
| 当前目标 | (当前目标) |
| 当前限制 | (当前限制) |
| 当前敌我 | (当前敌我关系) |
| 当前冲突 | (当前冲突) |`;

    const pendingHooksPrompt = resolvedLanguage === "en"
      ? `Identify all active hooks from the source text (Markdown table):
| hook_id | start_chapter | type | status | latest_progress | expected_payoff | payoff_timing | notes |`
      : `从正文中识别的所有伏笔（Markdown表格）：
| hook_id | 起始章节 | 类型 | 状态 | 最近推进 | 预期回收 | 回收节奏 | 备注 |`;

    const keyPrinciplesPrompt = resolvedLanguage === "en"
      ? `## Key Principles

1. Derive everything from the source text; do not invent unsupported settings
2. Hook extraction must be complete: unresolved clues, hints, and foreshadowing all count
3. Character inference must come from dialogue and behavior, not assumption
4. Accuracy first; detailed is better than missing crucial information
${numericalBlock}
${powerBlock}
${eraBlock}`
      : `## 关键原则

1. 一切从正文出发，不要臆造正文中没有的设定
2. 伏笔识别要完整：悬而未决的线索、暗示、预告都算
3. 角色推断要准确：从对话和行为推断性格，不要想当然
4. 准确性优先，宁可详细也不要遗漏
${numericalBlock}
${powerBlock}
${eraBlock}`;

    const isSeries = options?.importMode === "series";
    const continuationDirectiveEn = isSeries
      ? `## Continuation Direction Requirements (Critical)
The continuation portion (chapters in volume_outline that have not happened yet) must open up **new narrative space**:
1. **New conflict dimension**: Do not merely stretch the imported conflict longer. Introduce at least one new conflict vector not yet covered by the source text (new character, new faction, new location, or new time horizon)
2. **Ignite within 5 chapters**: The first continuation volume must establish a fresh suspense engine within 5 chapters. Do not spend 3 chapters recapping known information
3. **Scene freshness**: At least 50% of key continuation scenes must happen in locations or situations not already used in the imported chapters
4. **No repeated meeting rooms**: If the imported chapters end on a meeting/discussion beat, the continuation must restart from action instead of opening another meeting`
      : `## Continuation Direction
The volume_outline should naturally extend the existing narrative arc. Continue from where the imported chapters left off — advance existing conflicts, pay off planted hooks, and introduce new complications that arise organically from the current situation. Do not recap known information.`;
    const continuationDirectiveZh = isSeries
      ? `## 续写方向要求（关键）
续写部分（volume_outline 中尚未发生的章节）必须设计**新的叙事空间**：
1. **新冲突维度**：续写不能只是把导入章节的冲突继续拉长。必须引入至少一个原文未涉及的新冲突方向（新角色、新势力、新地点、新时间跨度）
2. **5章内引爆**：续写的第一卷必须在前5章内建立新悬念，不允许用3章回顾已知信息
3. **场景新鲜度**：续写部分至少50%的关键场景发生在导入章节未出现的地点或情境中
4. **不重复会议**：如果导入章节以会议/讨论结束，续写必须从行动开始，不能再开一轮会`
      : `## 续写方向
卷纲应自然延续已有故事线。从导入章节的结尾处接续——推进现有冲突、兑现已埋伏笔、引入从当前局势中有机产生的新变数。不要回顾已知信息。`;

    const workingModeEn = isSeries
      ? `## Working Mode

This is not a zero-to-one foundation pass. You must extract durable story truth from the imported chapters **and design a continuation path**. You need to:
1. Extract worldbuilding, factions, characters, and systems from the source text -> generate story_bible
2. Infer narrative structure and future arc direction -> generate volume_outline (review existing chapters + design a **new continuation direction**)
3. Infer protagonist lock, prohibitions, and narrative constraints from character behavior -> generate book_rules
4. Reflect the latest chapter state -> generate current_state
5. Extract all active hooks already planted in the text -> generate pending_hooks`
      : `## Working Mode

This is not a zero-to-one foundation pass. You must extract durable story truth from the imported chapters **and preserve a clean continuation path**. You need to:
1. Extract worldbuilding, factions, characters, and systems from the source text -> generate story_bible
2. Infer narrative structure and near-future arc direction -> generate volume_outline (review existing chapters + continue naturally from where the imported chapters stop)
3. Infer protagonist lock, prohibitions, and narrative constraints from character behavior -> generate book_rules
4. Reflect the latest chapter state -> generate current_state
5. Extract all active hooks already planted in the text -> generate pending_hooks`;
    const workingModeZh = isSeries
      ? `## 工作模式

这不是从零创建，而是从已有正文中提取和推导，**并设计续写方向**。你需要：
1. 从正文中提取世界观、势力、角色、力量体系 → 生成 story_bible
2. 从叙事结构推断卷纲 → 生成 volume_outline（已有章节的回顾 + **续写部分的新方向设计**）
3. 从角色行为推断主角锁定和禁忌 → 生成 book_rules
4. 从最新章节状态推断 current_state（反映最后一章结束时的状态）
5. 从正文中识别已埋伏笔 → 生成 pending_hooks`
      : `## 工作模式

这不是从零创建，而是从已有正文中提取和推导，**并为自然续写保留清晰延续路径**。你需要：
1. 从正文中提取世界观、势力、角色、力量体系 → 生成 story_bible
2. 从叙事结构推断卷纲 → 生成 volume_outline（回顾已有章节，并从导入章节结束处自然接续）
3. 从角色行为推断主角锁定和禁忌 → 生成 book_rules
4. 从最新章节状态推断 current_state（反映最后一章结束时的状态）
5. 从正文中识别已埋伏笔 → 生成 pending_hooks`;

    const systemPrompt = resolvedLanguage === "en"
      ? `You are a professional web-fiction architect. Your task is to reverse-engineer a complete foundation from existing chapters.${contextBlock}

${workingModeEn}

All output sections — story_bible, volume_outline, book_rules, current_state, and pending_hooks — MUST be written in English. Keep the === SECTION: === tags unchanged.

${continuationDirectiveEn}
${reviewFeedbackBlock}
## Book Metadata

- Title: ${book.title}
- Platform: ${book.platform}
- Genre: ${gp.name} (${book.genre})
- Target Chapters: ${book.targetChapters}
- Chapter Target Length: ${book.chapterWordCount}

## Genre Profile

${genreBody}

## Output Contract

Generate the following sections. Separate every section with === SECTION: <name> ===:

=== SECTION: story_bible ===
${storyBiblePrompt}

=== SECTION: volume_outline ===
${volumeOutlinePrompt}

=== SECTION: book_rules ===
${bookRulesPrompt}

=== SECTION: current_state ===
${currentStatePrompt}

=== SECTION: pending_hooks ===
${pendingHooksPrompt}

${keyPrinciplesPrompt}`
      : `你是一个专业的网络小说架构师。你的任务是从已有的小说正文中反向推导完整的基础设定。${contextBlock}

${workingModeZh}

${continuationDirectiveZh}
${reviewFeedbackBlock}
## 书籍信息

- 标题：${book.title}
- 平台：${book.platform}
- 题材：${gp.name}（${book.genre}）
- 目标章数：${book.targetChapters}章
- 每章字数：${book.chapterWordCount}字

## 题材特征

${genreBody}

## 生成要求

你需要生成以下内容，每个部分用 === SECTION: <name> === 分隔：

=== SECTION: story_bible ===
${storyBiblePrompt}

=== SECTION: volume_outline ===
${volumeOutlinePrompt}

=== SECTION: book_rules ===
${bookRulesPrompt}

=== SECTION: current_state ===
${currentStatePrompt}

=== SECTION: pending_hooks ===
${pendingHooksPrompt}

${keyPrinciplesPrompt}`;
    const userMessage = resolvedLanguage === "en"
      ? `Generate the complete foundation for an imported ${gp.name} novel titled "${book.title}". Write everything in English.\n\n${chaptersText}`
      : `以下是《${book.title}》的全部已有正文，请从中反向推导完整基础设定：\n\n${chaptersText}`;

    const response = await this.chat([
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: userMessage,
      },
    ], { temperature: 0.5, maxTokens: 16384 });

    return this.parseSections(response.content);
  }

  async generateFanficFoundation(
    book: BookConfig,
    fanficCanon: string,
    fanficMode: FanficMode,
    reviewFeedback?: string,
  ): Promise<ArchitectOutput> {
    const { profile: gp, body: genreBody } =
      await readGenreProfile(this.ctx.projectRoot, book.genre);
    const reviewFeedbackBlock = this.buildReviewFeedbackBlock(reviewFeedback, book.language ?? "zh");

    const MODE_INSTRUCTIONS: Record<FanficMode, string> = {
      canon: "剧情发生在原作空白期或未详述的角度。不可改变原作已确立的事实。",
      au: "标注AU设定与原作的关键分歧点，分歧后的世界线自由发展。保留角色核心性格。",
      ooc: "标注角色性格偏离的起点和驱动事件。偏离必须有逻辑驱动。",
      cp: "以配对角色的关系线为主线规划卷纲。每卷必须有关系推进节点。",
    };

    const systemPrompt = `你是一个专业的同人小说架构师。你的任务是基于原作正典为同人小说生成基础设定。

## 同人模式：${fanficMode}
${MODE_INSTRUCTIONS[fanficMode]}

## 新时空要求（关键）
你必须为这本同人设计一个**原创的叙事空间**，而不是复述原作剧情。具体要求：
1. **明确分岔点**：story_bible 必须标注"本作从原作的哪个节点分岔"，或"本作发生在原作未涉及的什么时空"
2. **独立核心冲突**：volume_outline 的核心冲突必须是原创的，不是原作情节的翻版。原作角色可以出现，但他们面对的是新问题
3. **5章内引爆**：volume_outline 的第1卷必须在前5章内建立核心悬念，不允许用3章做铺垫才到引爆点
4. **场景新鲜度**：至少50%的关键场景发生在原作未出现的地点或情境中

${reviewFeedbackBlock}

## 原作正典
${fanficCanon}

## 题材特征
${genreBody}

## 关键原则
1. **不发明主要角色** — 主要角色必须来自原作正典的角色档案
2. 可以添加原创配角，但必须在 story_bible 中标注为"原创角色"
3. story_bible 保留原作世界观，标注同人的改动/扩展部分，并明确写出**分岔点**和**新时空设定**
4. volume_outline 不得复述原作剧情节拍。每卷的核心事件必须是原创的，标注"原创"
5. book_rules 的 fanficMode 必须设为 "${fanficMode}"
6. 主角设定来自原作角色档案中的第一个角色（或用户在标题中暗示的角色）

你需要生成以下内容，每个部分用 === SECTION: <name> === 分隔：

=== SECTION: story_bible ===
世界观（基于原作正典）+ 角色列表（原作角色标注来源，原创角色标注"原创"）

=== SECTION: volume_outline ===
卷纲规划。每卷标注：卷名、章节范围、核心事件（标注原作/原创）、关系发展节点

=== SECTION: book_rules ===
\`\`\`
---
version: "1.0"
protagonist:
  name: (从原作角色中选择)
  personalityLock: [(从正典角色档案提取)]
  behavioralConstraints: [(基于原作行为模式)]
genreLock:
  primary: ${book.genre}
  forbidden: []
fanficMode: "${fanficMode}"
allowedDeviations: []
prohibitions:
  - (3-5条同人特有禁忌)
---
(叙事视角和风格指导)
\`\`\`

=== SECTION: current_state ===
初始状态卡（基于正典起始点）

=== SECTION: pending_hooks ===
初始伏笔池（从正典关键事件和关系中提取）`;

    const response = await this.chat([
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `请为标题为"${book.title}"的${fanficMode}模式同人小说生成基础设定。目标${book.targetChapters}章，每章${book.chapterWordCount}字。`,
      },
    ], { temperature: 0.7, maxTokens: 16384 });

    return this.parseSections(response.content);
  }

  private buildReviewFeedbackBlock(
    reviewFeedback: string | undefined,
    language: "zh" | "en",
  ): string {
    const trimmed = reviewFeedback?.trim();
    if (!trimmed) return "";

    if (language === "en") {
      return `\n\n## Previous Review Feedback
The previous foundation draft was rejected. You must explicitly fix the following issues in this regeneration instead of paraphrasing the same design:

${trimmed}\n`;
    }

    return `\n\n## 上一轮审核反馈
上一轮基础设定未通过审核。你必须在这次重生中明确修复以下问题，不能只换措辞重写同一套方案：

${trimmed}\n`;
  }

  private parseSections(content: string): ArchitectOutput {
    const parsedSections = new Map<string, string>();
    const sectionPattern = /^\s*===\s*SECTION\s*[：:]\s*([^\n=]+?)\s*===\s*$/gim;
    const matches = [...content.matchAll(sectionPattern)];

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i]!;
      const rawName = match[1] ?? "";
      const start = (match.index ?? 0) + match[0].length;
      const end = matches[i + 1]?.index ?? content.length;
      const normalizedName = this.normalizeSectionName(rawName);
      parsedSections.set(normalizedName, content.slice(start, end).trim());
    }

    // Phase 5 新 sections
    const storyFrame = parsedSections.get("story_frame") ?? "";
    const volumeMap = parsedSections.get("volume_map") ?? "";
    const rhythmPrinciples = parsedSections.get("rhythm_principles") ?? "";
    const rolesRaw = parsedSections.get("roles") ?? "";
    // Legacy sections — 当 LLM 还按老 prompt 输出时兜底。
    const legacyStoryBible = parsedSections.get("story_bible") ?? "";
    const legacyVolumeOutline = parsedSections.get("volume_outline") ?? "";
    const bookRules = parsedSections.get("book_rules");
    const currentStateLegacy = parsedSections.get("current_state") ?? "";
    const pendingHooksRaw = parsedSections.get("pending_hooks");

    // 用老名字输出且没有 story_frame/volume_map 时，roles 可空（走 legacy shim fallback）。
    const usingLegacyOutlineNames = !storyFrame && !volumeMap
      && (legacyStoryBible.length > 0 || legacyVolumeOutline.length > 0);

    const effectiveStoryFrame = storyFrame || legacyStoryBible;
    const effectiveVolumeMap = volumeMap || legacyVolumeOutline;

    const missing: string[] = [];
    if (!effectiveStoryFrame) missing.push("story_frame");
    if (!effectiveVolumeMap) missing.push("volume_map");
    if (!rolesRaw.trim() && !usingLegacyOutlineNames) missing.push("roles");
    if (!bookRules) missing.push("book_rules");
    if (!pendingHooksRaw) missing.push("pending_hooks");
    if (missing.length > 0) {
      throw new Error(
        `Architect output missing required section${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
      );
    }

    const roles = this.parseRoles(rolesRaw);
    const pendingHooks = this.normalizePendingHooksSection(
      this.stripTrailingAssistantCoda(pendingHooksRaw!),
    );

    // Shim-facing 老字段：新 prompt 下用 buildStoryBibleShim 生成指针内容；
    // 老 prompt 下直接用老内容。volumeOutline 也同理。
    const storyBible = legacyStoryBible || effectiveStoryFrame;
    const volumeOutline = legacyVolumeOutline || effectiveVolumeMap;

    return {
      storyBible,
      volumeOutline,
      bookRules: bookRules!,
      // current_state 在 Phase 5 下不是必需 section——writeFoundationFiles 会 seed
      // 一个占位文件，consolidator 运行时按章追加。
      currentState: currentStateLegacy,
      pendingHooks,
      storyFrame: effectiveStoryFrame,
      volumeMap: effectiveVolumeMap,
      rhythmPrinciples,
      roles,
    };
  }

  /** Parse ---ROLE---...---CONTENT--- 块。畸形块静默丢弃。 */
  private parseRoles(raw: string): ReadonlyArray<ArchitectRole> {
    if (!raw.trim()) return [];

    const blocks = raw.split(/^---ROLE---$/m).map((chunk) => chunk.trim()).filter(Boolean);
    const roles: ArchitectRole[] = [];

    for (const block of blocks) {
      const contentSplit = block.split(/^---CONTENT---$/m);
      if (contentSplit.length < 2) continue;

      const headerRaw = contentSplit[0]!.trim();
      const content = contentSplit.slice(1).join("\n---CONTENT---\n").trim();

      const tierMatch = headerRaw.match(/tier\s*[:：]\s*(major|minor|主要|次要)/i);
      const nameMatch = headerRaw.match(/name\s*[:：]\s*(.+)/i);
      if (!tierMatch || !nameMatch) continue;

      const tierValue = tierMatch[1]!.toLowerCase();
      const tier: "major" | "minor" = (tierValue === "major" || tierValue === "主要") ? "major" : "minor";
      const name = nameMatch[1]!.trim();
      if (!name || !content) continue;

      roles.push({ tier, name, content });
    }

    return roles;
  }

  private buildStoryBibleShim(storyFrame: string, language: "zh" | "en"): string {
    if (language === "en") {
      return `# Story Bible (compat pointer — deprecated)\n\n> This file is kept for external readers only. The authoritative source is now:\n> - outline/story_frame.md (theme / tonal ground / core conflict / world rules / endgame)\n> - outline/volume_map.md (volume-level plot map)\n> - roles/ directory (one-file-per-character sheets)\n\n## Excerpt from story_frame\n\n${storyFrame.slice(0, 2000)}\n`;
    }
    return `# 故事圣经（兼容指针——已废弃）\n\n> 本文件仅为外部读取保留。权威来源已迁移至：\n> - outline/story_frame.md（主题 / 基调 / 核心冲突 / 世界铁律 / 终局）\n> - outline/volume_map.md（卷级分卷地图）\n> - roles/ 文件夹（一人一卡角色档案）\n\n## story_frame 摘录\n\n${storyFrame.slice(0, 2000)}\n`;
  }

  private buildCharacterMatrixShim(roles: ReadonlyArray<ArchitectRole>, language: "zh" | "en"): string {
    const majorLines = roles.filter((role) => role.tier === "major")
      .map((role) => `- roles/主要角色/${role.name}.md`);
    const minorLines = roles.filter((role) => role.tier === "minor")
      .map((role) => `- roles/次要角色/${role.name}.md`);

    if (language === "en") {
      return `# Character Matrix (compat pointer — deprecated)\n\n> This file is kept for external readers only. Authoritative source is now the roles/ directory (one-file-per-character).\n\n## Major characters\n\n${majorLines.join("\n") || "(none)"}\n\n## Minor characters\n\n${minorLines.join("\n") || "(none)"}\n`;
    }
    return `# 角色矩阵（兼容指针——已废弃）\n\n> 本文件仅为外部读取保留。权威来源已迁移至 roles/ 文件夹（一人一卡）。\n\n## 主要角色\n\n${majorLines.join("\n") || "（无）"}\n\n## 次要角色\n\n${minorLines.join("\n") || "（无）"}\n`;
  }

  private buildBookRulesShim(bookRulesBody: string, language: "zh" | "en"): string {
    const trimmedBody = bookRulesBody.trim();
    if (language === "en") {
      const excerpt = trimmedBody
        ? `\n\n## Narrative guidance excerpt\n\n${trimmedBody}\n`
        : "";
      return `# Book Rules (compat pointer — deprecated)\n\n> This file is kept for external readers only. The authoritative YAML frontmatter now lives at the top of outline/story_frame.md.${excerpt}`;
    }
    const excerpt = trimmedBody
      ? `\n\n## 叙事指引摘录\n\n${trimmedBody}\n`
      : "";
    return `# 本书规则（兼容指针——已废弃）\n\n> 本文件仅为外部读取保留。权威 YAML frontmatter 已迁移至 outline/story_frame.md 顶部。${excerpt}`;
  }

  private normalizeSectionName(name: string): string {
    return name
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[`"'*_]/g, " ")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  private stripTrailingAssistantCoda(section: string): string {
    const lines = section.split("\n");
    const cutoff = lines.findIndex((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      return /^(如果(?:你愿意|需要|想要|希望)|If (?:you(?:'d)? like|you want|needed)|I can (?:continue|next))/i.test(trimmed);
    });

    if (cutoff < 0) {
      return section;
    }

    return lines.slice(0, cutoff).join("\n").trimEnd();
  }

  private normalizePendingHooksSection(section: string): string {
    const rows = section
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("|"))
      .filter((line) => !line.includes("---"))
      .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
      .filter((cells) => cells.some(Boolean));

    if (rows.length === 0) {
      return section;
    }

    const dataRows = rows.filter((row) => (row[0] ?? "").toLowerCase() !== "hook_id");
    if (dataRows.length === 0) {
      return section;
    }

    const language: "zh" | "en" = /[\u4e00-\u9fff]/.test(section) ? "zh" : "en";
    const normalizedHooks = dataRows.map((row, index) => {
      const rawProgress = row[4] ?? "";
      const normalizedProgress = this.parseHookChapterNumber(rawProgress);
      const seedNote = normalizedProgress === 0 && this.hasNarrativeProgress(rawProgress)
        ? (language === "zh" ? `初始线索：${rawProgress}` : `initial signal: ${rawProgress}`)
        : "";
      const notes = this.mergeHookNotes(row[6] ?? "", seedNote, language);

      return {
        hookId: row[0] || `hook-${index + 1}`,
        startChapter: this.parseHookChapterNumber(row[1]),
        type: row[2] ?? "",
        status: row[3] ?? "open",
        lastAdvancedChapter: normalizedProgress,
        expectedPayoff: row[5] ?? "",
        payoffTiming: row.length >= 8 ? row[6] ?? "" : "",
        notes: row.length >= 8 ? this.mergeHookNotes(row[7] ?? "", seedNote, language) : notes,
      };
    });

    return renderHookSnapshot(normalizedHooks, language);
  }

  private parseHookChapterNumber(value: string | undefined): number {
    if (!value) return 0;
    const match = value.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  }

  private hasNarrativeProgress(value: string | undefined): boolean {
    const normalized = (value ?? "").trim().toLowerCase();
    if (!normalized) return false;
    return !["0", "none", "n/a", "na", "-", "无", "未推进"].includes(normalized);
  }

  private mergeHookNotes(notes: string, seedNote: string, language: "zh" | "en"): string {
    const trimmedNotes = notes.trim();
    const trimmedSeed = seedNote.trim();
    if (!trimmedSeed) {
      return trimmedNotes;
    }
    if (!trimmedNotes) {
      return trimmedSeed;
    }
    return language === "zh"
      ? `${trimmedNotes}（${trimmedSeed}）`
      : `${trimmedNotes} (${trimmedSeed})`;
  }
}
