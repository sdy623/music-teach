# Music Teach

[English](README.md) | [简体中文](README.zh-CN.md)

Music Teach 是一个面向逐句音乐教学的 Vue 3 / SVG 组件库。运行时建立类型化乐谱与乐句 IR、完成歌词槽位对齐，并把每个可演唱乐句渲染为固定 16:9 的交互式教学画面。

JPW-ABC 是当前的一等乐谱输入适配器，简谱是第一套渲染器，但项目边界不局限于 JPW-ABC：同一套乐句 IR 可以继续承载其他乐谱来源、五线谱、播放时间轴和更多教学层。

本项目面向音乐教唱视频、课堂幻灯片和逐句练习工具，不以复刻 JP-Word 编辑器或 A4 纸张版面为目标。屏幕模式只缩放稳定的教学画面；宿主应用可以按音符槽位控制高亮、播放进度和教学 overlay。

公开版只保留公版民歌示例和人工合成的记谱样例；其他曲目可以在本机导入。

v0.3.0 加入本机工程库、导入预检、版本冲突保护、恢复草稿、检查点和附件，并参考 jpeditor 重构连音线、增时线与减时线。旧版乐句编辑器及播放器继续可用。详见[更新记录](CHANGELOG.md)和[工程库指南](docs/project-library.md)。

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

打开 `http://localhost:5173/library`。

- `/scores/sakura/phrases/1`：显示一个教学乐句
- `/scores/sakura/sections`：编辑段落分割点
- `/scores/notation-reference`：记谱规范回归样例
- `/scores/rhythm-x`：无音高节奏样例
- `/scores/im-eul-wihan-haengjingok`：《임을 위한 행진곡》韩语教学占位
- `/library`：浏览、导入、复制、归档和恢复工程
- `/projects/new`：先保存空白谱，再进入工程信息与预览页
- `/legacy/projects/new`：使用已有乐句编辑器及工程播放器

```bash
npm run test
npm run build
npm run build:web
npm run build:webview
npm run build:pages
npm run build:cloudflare
npm run build:lib
```

工程库使用当前浏览器的 IndexedDB 保存工程。导入先预检，再明确确认保存；修改工程信息时显示保存状态与版本。旧版编辑器独立保存，“播放当前工程”可在刷新后恢复同一份旧版工程。

默认 `build` 输出可放入任意二级目录的 `dist`，资源使用相对路径并通过 hash 路由导航。`build:web`、`build:webview` 和 `build:pages` 分别输出 `dist-web`、`dist-webview`、`dist-pages`，都不需要预先知道仓库名；Pages 地址形如 `/music-teach/#/scores/sakura`。`build:cloudflare` 输出使用 history 路由和 SPA 回退的 `dist-cloudflare`。`build:all` 会生成全部产物，但不会自动发布。

完整流程见 [中文入门教程](docs/getting-started.zh-CN.md)，英文版见 [Getting started](docs/getting-started.md)。

## 导入曲目

在工程库点击 **导入工程**，预检 JPW-ABC、MusicProject 或导出的工程包，再确认导入。迁入 v3 教学工程需要配对 JPW-ABC 作为原始乐谱。

需要沿用逐句编辑流程时，打开 **旧版编辑器**，可以导入：

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

- 新工程库支持信息编辑和只读谱面预览；音符、歌词及教学编排的撤销/重做编辑计划在 M3 接入。旧版乐句编辑器独立保留。
- 工程按浏览器 origin 保存在本机；清理站点数据前需先导出备份，目前没有云同步。
- 不是 JP-Word 编辑器，也不追求纸张像素级复刻。
- 和弦、装饰音细节、复杂附件和多声部仍不完整。
- 自动语言学分析不属于当前记谱核心。
- `StaffRenderer` 仍是预留接口。
- npm 包在确定正式名称和版本前仍标记为 `private`。

## 样例

- `public/fixtures/sakura.jpwabc`：公版民歌 smoke test
- `public/fixtures/notation-reference.jpwabc`：人工合成的记谱规范样例
- `public/fixtures/rhythm-x.jpwabc`：人工合成的无音高节奏样例
- `public/fixtures/im-eul-wihan-haengjingok-placeholder.jpwabc`：仅保留稳定曲目 ID 与合成占位节奏，不含原曲旋律或歌词

新增可再分发样例时，请放入 `public/fixtures/`，登记到 `src/demo/fixtures.ts`，并写明来源与许可证。

## 文档

| 主题 | English | 简体中文 |
| --- | --- | --- |
| 安装、导入与 Vue 使用 | [Getting started](docs/getting-started.md) | [入门教程](docs/getting-started.zh-CN.md) |
| Slidev 接入 | [Slidev guide](docs/slidev-integration.md) | [Slidev 接入](docs/slidev-integration.zh-CN.md) |
| 架构 | [Teaching slide architecture](docs/teaching-slide-architecture.md) | 当前为中文优先 |
| 记谱约束 | [Jianpu conformance](docs/jianpu-notation-conformance.md) | 当前为中文优先 |

## 发布许可证

项目源码采用 GPL-3.0-only。第三方组件保留各自许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。jpeditor 改编部分保留完整 MIT 许可；简谱数字使用随库提供的 Noto 开放字体。
