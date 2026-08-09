# Slidev 接入

[English](slidev-integration.md) | [简体中文](slidev-integration.zh-CN.md)

`SlidevJianpuPhrase` 在固定 16:9 教学画面中渲染一句 JPW-ABC。Slidev 可以整体缩放该画面，但浏览器宽度变化不会触发重新断谱。

## 本地构建与安装

先在本仓库构建 Vue 组件库：

```bash
npm ci
npm run build:lib
```

在 Slidev 工程中安装本地 checkout：

```bash
npm install ../music-teach
```

该包导出 ES module 和 `style.css`。渲染器源码变化后需要重新执行 `npm run build:lib`。

## 直接输入一个乐句

在 `slides.md` 中导入组件和样式：

```md
<script setup lang="ts">
import { SlidevJianpuPhrase } from "music-teach"
import "music-teach/style.css"
</script>

# Verse

<SlidevJianpuPhrase
  voice-line="| 6 6 1g- | 6 6 1g- |"
  lyric-text="さくらさくら"
  reference-reading="さくらさくら"
  title="さくら"
  key-and-meters="1=D,4/4"
  expression="J=80"
  section="Verse"
  annotation="第二遍保持同一呼吸位置。"
  :show-metronome="false"
  :teaching-ghost="true"
/>
```

组件会在内部建立最小 JPW-ABC 文档，通过同一套 Score IR 管线解析，并渲染第一个乐句。

常用参数：

| 参数 | 作用 |
| --- | --- |
| `voice-line` | 当前乐句的 JPW-ABC `.Voice` 内容 |
| `lyric-text` | Slide 显示的歌词原文 |
| `reference-reading` | 用于演唱和对位的参考读音 |
| `key-and-meters` | 调号与拍号，如 `1=D,4/4` |
| `expression` | 速度/表情文字，如 `J=80` |
| `section` | 当前段落标签 |
| `annotation` | 自由教学或配器注释 |
| `active-slot` | 由宿主时间轴控制的零起始槽位 |
| `teaching-ghost` | 虚化 tie 后续音的 attack |
| `show-metronome` | 显示节拍提示 |
| `show-key-changes` | 显示检测到的转调注记 |

## 传入已经建立的乐句

完整乐谱应只解码和建立 deck 一次，然后把已有 `JianpuPhraseFrame` 传给组件：

```vue
<SlidevJianpuPhrase
  :phrase="deck.phrases[0]"
  :active-slot="activeSlot"
  section="Chorus"
  @select-slot="handleSlot"
/>
```

翻页和 `activeSlot` 由宿主持有。这样记谱渲染与 Slidev 导航、音频播放、视频导出互不绑死。

## 段落与页面生成

教学工程的段落使用分割点：在一个乐句起点开始某段，并持续到下一个分割点。不要在每个乐句下面重复放置段落选择器。

通常可将一个工程乐句映射为一页 Slidev：

```ts
const pages = project.phrases.map((phrase, index) => ({
  phrase,
  section: resolvePhraseSection(project, index)
}));
```

器乐乐句可以保存配器/进入提示，并可在自动播放时省略。空白乐句可以生成纯文字讲解页，不需要伪造音符。

## 常见问题

- 页面空白：确认 `voice-line` 至少包含音符、休止符或 `X` 事件。
- 没有样式：导入 `music-teach/style.css`。
- tie 后歌词错位：保留 extension cell，并用槽位序号驱动高亮。
- 开发修改没有出现：重新运行 `npm run build:lib`，然后重启 Slidev。
- 生产环境直接打开 SPA 子路由 404：为宿主配置回退到 `index.html`。
