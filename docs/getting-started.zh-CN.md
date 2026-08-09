# 入门教程

[English](getting-started.md) | [简体中文](getting-started.zh-CN.md)

本教程从本地 JPW-ABC 文件开始，依次完成导入、乐句整理以及 Vue/Slidev 教学页面接入。

## 1. 安装并启动工程

环境要求：

- Node.js `^20.19.0` 或 `>=22.12.0`
- npm
- 支持 SVG 的现代浏览器

```bash
git clone <repository-url>
cd <repository-directory>
npm ci
npm run dev
```

打开 `http://127.0.0.1:5173/projects/new`。Vite 默认绑定 `127.0.0.1`，因此开发服务只在当前电脑本地可见。

## 2. 导入 JPW-ABC

教学工程页面支持 `.jpwabc`、`.abc` 和已经导出的 JSON 工程。

1. 打开 **新建教学工程**。
2. 选择 **导入**，选取 JPW-ABC 文件。
3. 检查识别出的编码、乐句数和 diagnostics。
4. 核对标题、歌手、作词、作曲、编曲、调号拍号和速度表情。
5. 编辑完成后导出 JSON，得到可迁移的教学工程文件。

`convertJPWABCToTeachingProject()` 支持 UTF-8、UTF-16LE 和 UTF-16BE。解析警告会保留在 diagnostics 中；单个未知 token 不应导致后续乐谱全部丢失。

导入器把 `.Words` 当作歌词对位证据，不会根据普通歌词文本猜测音乐时值。

## 3. 理解歌词槽位

JPW-ABC 歌词是乐谱对位 cell，不是普通自然语言段落：

- 普通字符消耗一个可演唱槽位；
- `ー` 作为延长占位消耗一个槽位，并继承前一个语言 token；
- `{文字}` 把多个字符强制放进同一个音位；
- `/`、`//`、`///` 产生候选乐句边界；
- 默认跳过休止符，音符和 `X` 节奏符可以对齐歌词。

例如：

```text
まちあかりーてらーーしたー
```

显示 cell 保留全部 `ー`，而 NLP 归一化文本是 `まちあかりてらした`。

不要为了缩短可见文字而删除延长 cell。歌词高亮、播放时间轴和 tie ghost 共享同一套槽位身份。

## 4. 编辑乐句与段落

教学工程为每个乐句保存一条 `voiceLine` 和一段歌词。乐句类型包括：

- `vocal`：显示对位歌词；
- `instrumental`：适合前奏、间奏、尾奏和伴奏提示；
- `blank`：纯文字或停顿页面。

自由注释区可填写换气、乐器进入、动机重复、播放提示等内容。`showMetronome` 控制节拍指示，`skipDuringPlayback` 可以让自动连续播放跳过指定伴奏乐句。

段落采用“分割点”，不是在每个乐句下重复一遍标签。在某个乐句起点指定 `Verse`、`Pre-Chorus`、`Chorus`、`Bridge`、字母段落或自定义段落后，该标签会持续到下一个分割点。

## 5. 从 TypeScript 渲染

```ts
import {
  buildLessonDeck,
  decodeJPWABC,
  parseJPWABC
} from "music-teach";

const buffer = await fetch("/fixtures/sakura.jpwabc")
  .then((response) => response.arrayBuffer());
const decoded = decodeJPWABC(buffer);
const parsed = parseJPWABC(decoded);
const deck = buildLessonDeck(parsed.value, {
  id: "sakura-lesson"
});

console.table(parsed.diagnostics);
console.log(deck.phrases);
```

如需按曲目显式调整切句：

```ts
const deck = buildLessonDeck(parsed.value, {
  joinSoftBreaks: [
    { left: "前半段归一化文本", right: "后半段归一化文本" }
  ],
  splitPhrases: [
    { text: "目标归一化文本", afterSlots: [8, 16] }
  ]
});
```

`afterSlots` 统计已经对齐的演唱槽位，包含歌词延长占位，不等于 NLP token 数量。

## 6. 使用 Vue 组件

把当前仓库作为本地包接入前，先构建组件库：

```bash
npm run build:lib
```

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import {
  JianpuVideoLessonSlide,
  type JianpuLessonDeck
} from "music-teach";
import "music-teach/style.css";

const props = defineProps<{ deck: JianpuLessonDeck }>();
const phraseIndex = ref(0);
const activeSlot = ref(-1);
const phrase = computed(() => props.deck.phrases[phraseIndex.value]!);
</script>

<template>
  <JianpuVideoLessonSlide
    :phrase="phrase"
    :active-slot="activeSlot"
    :teaching-ghost="true"
    :show-key-changes="true"
  />
</template>
```

播放状态由宿主系统持有。Web Audio、视频时间轴、MIDI 或课堂遥控器只需更新 `activeSlot`；记谱组件本身不擅自启动音频。

手工输入单句时，可直接给 `SlidevJianpuPhrase` 传入 `voice-line`、`lyric-text`、`key-and-meters` 和 `expression`。完整示例见 [Slidev 接入教程](slidev-integration.zh-CN.md)。

## 7. 验证记谱修改

```bash
npm run test
npm run build
npm run build:lib
```

修改记谱几何时打开 `/scores/notation-reference`。该样例覆盖减时线、小节线、反复、升降还原、临时拍号、休止、`X`、多连音、tie 和终止线。

必须保持的约束：

- 减时线只能在所属节拍组内部连接；
- 小节线对齐简谱符号带，不受歌词高度影响；
- 临时拍号是乐谱事件，不改写标题元数据；
- tie ghost 只改变后续音的 attack/透明度，不移动歌词；
- 屏幕尺寸变化只缩放固定乐句画面，不重新断谱。

## 曲目与许可证

受版权约束或私人使用的曲目应保存在源码仓库外，通过 JPW-ABC 或教学工程 JSON 本地导入。只有来源与再分发许可明确的样例才能加入 fixture。

项目源码采用 GPL-3.0-only。第三方资产保留各自许可证，详见 `THIRD_PARTY_NOTICES.md`。
