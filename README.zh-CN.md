# Music Teach

[English](README.md) | [简体中文](README.zh-CN.md)

Music Teach 是一个面向逐句音乐教学的 Vue 3 / SVG 组件库。运行时建立类型化乐谱与乐句 IR、完成歌词槽位对齐，并把每个可演唱乐句渲染为固定 16:9 的交互式教学画面。

JPW-ABC 是当前的一等乐谱输入适配器，简谱是第一套渲染器，但项目边界不局限于 JPW-ABC：同一套乐句 IR 可以继续承载其他乐谱来源、五线谱、播放时间轴和更多教学层。

本项目面向音乐教唱视频、课堂幻灯片和逐句练习工具，不以复刻 JP-Word 编辑器或 A4 纸张版面为目标。屏幕模式只缩放稳定的教学画面；宿主应用可以按音符槽位控制高亮、播放进度和教学 overlay。

仓库只附带公版民歌示例和人工合成的记谱测试样例。受许可约束或私人使用的曲目应作为本地 `.jpwabc`/教学工程 JSON 导入，不应作为组件库源码提交。

## 处理管线

```text
JPW-ABC ArrayBuffer
-> decodeJPWABC
-> parser / ScoreIR
-> 歌词与可演唱事件对齐
-> 可配置乐句切分
-> JianpuPhraseFrame[]
-> SVG 乐句布局
-> Vue / Slidev 教学页面
```

PDF 样张和出版规范只作为离线校准证据，不在运行时读取，也不随开源仓库分发。

## 快速运行

需要 Node.js `^20.19.0` 或 `>=22.12.0`。

```bash
npm ci
npm run dev
```

打开 `http://127.0.0.1:5173/scores/sakura`。

- `/scores/sakura/phrases/1`：显示一个教学乐句
- `/scores/sakura/sections`：编辑段落分割点
- `/scores/notation-reference`：记谱规范回归样例
- `/scores/rhythm-x`：无音高节奏样例
- `/projects/new`：新建或导入教学工程
- `/legacy/sakura`：打印优先的旧渲染路径

```bash
npm run test
npm run build
npm run build:lib
```

完整流程见 [中文入门教程](docs/getting-started.zh-CN.md)，英文版见 [Getting started](docs/getting-started.md)。

## 导入曲目

进入 **新建教学工程** 后可以导入：

- `.jpwabc` 文件：自动解码、解析并转换为可编辑教学工程；
- `.teaching-project.json` 或导出的 `.json`：恢复标题、人员信息、逐句简谱、注释、播放开关和段落分割点。

歌词按乐谱槽位对齐。`ー` 会消耗一个演唱槽位，但不会进入 `normalizedText`；花括号中的多个字符占用一个音位。未知符号会进入 diagnostics，而不是令整页崩溃。

## Vue 使用

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import {
  buildLessonDeck,
  decodeJPWABC,
  JianpuVideoLessonSlide,
  parseJPWABC
} from "music-teach";
import "music-teach/style.css";

const buffer = await fetch("/fixtures/sakura.jpwabc")
  .then((response) => response.arrayBuffer());
const score = parseJPWABC(decodeJPWABC(buffer)).value;
const deck = buildLessonDeck(score);
const phraseIndex = ref(0);
const phrase = computed(() => deck.phrases[phraseIndex.value]!);
</script>

<template>
  <JianpuVideoLessonSlide
    :phrase="phrase"
    :active-slot="3"
    :teaching-ghost="true"
  />
</template>
```

`joinSoftBreaks` 用于合并明确的软歌词边界，`splitPhrases.afterSlots` 按已经对齐的演唱槽位切分。歌词、tie ghost 和音符高亮因此共享同一个时间轴。

Slidev 接入见 [中文教程](docs/slidev-integration.zh-CN.md) 或 [English guide](docs/slidev-integration.md)。

## 对外模块

- `decodeJPWABC`、`parseJPWABC`
- `convertJPWABCToTeachingProject`
- `buildLessonDeck`、`layoutPhrase`
- `JianpuPhraseNotation`
- `JianpuVideoLessonSlide`
- `SlidevJianpuPhrase`
- `JianpuPhraseFrame` 与教学工程类型

## 当前支持

- UTF-8、UTF-16LE、UTF-16BE JPW-ABC
- 音符 `1-7`、休止 `0`、无音高节奏 `X`
- 高低八度点、升降还原、附点、增时线和减时线
- 以拍为单位的减时线分组
- 小节线、反复、临时拍号、圆滑线、延音线和多连音
- `.Words` 锚点与歌词槽位对齐
- 延长占位与 tie-ghost 教学模式
- Text Attachment 和转调注记
- 固定布局乐句 Slide、交互高亮
- 人员信息、注释、播放开关、段落分割点

## 当前限制

- 不是 JP-Word 编辑器，也不追求纸张像素级复刻。
- 和弦、装饰音细节、复杂附件和多声部仍不完整。
- 自动语言学分析不属于当前记谱核心。
- `StaffRenderer` 仍是预留接口。
- npm 包在确定正式名称和版本前仍标记为 `private`。

## 样例

- `public/fixtures/sakura.jpwabc`：公版民歌 smoke test
- `public/fixtures/notation-reference.jpwabc`：人工合成的记谱规范样例
- `public/fixtures/rhythm-x.jpwabc`：人工合成的无音高节奏样例

新增可再分发样例时，请放入 `public/fixtures/`，登记到 `src/demo/fixtures.ts`，并写明来源与许可证。

## 文档

| 主题 | English | 简体中文 |
| --- | --- | --- |
| 安装、导入与 Vue 使用 | [Getting started](docs/getting-started.md) | [入门教程](docs/getting-started.zh-CN.md) |
| Slidev 接入 | [Slidev guide](docs/slidev-integration.md) | [Slidev 接入](docs/slidev-integration.zh-CN.md) |
| 架构 | [Teaching slide architecture](docs/teaching-slide-architecture.md) | 当前为中文优先 |
| 记谱约束 | [Jianpu conformance](docs/jianpu-notation-conformance.md) | 当前为中文优先 |

## 许可证

项目源码采用 GPL-3.0-only。第三方组件保留各自许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
