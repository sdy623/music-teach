# Teaching Slide Architecture

## Product Boundary

这个模块服务于音乐教唱视频和 Slidev 页面。一个渲染实例只负责一句可演唱乐句，不负责整页纸张、编辑器排版或浏览器分页。

固定输出是 16:9 Slide。谱面仍按音乐宽度布局，但屏幕尺寸变化只缩放整个 Slide，不重新计算不同的换行。

## Evidence Sources

设计使用公开出版规范、JP-Word 导出的样张和人工复核过的五线谱做离线校准。原始参考文件不随开源分支分发。

从规范和样张抽出的稳定约束：

1. 简谱下划线属于节拍结构，同一拍内可连接，不能跨拍。
2. 小节线对齐谱符号区域，与歌词句法边界无关。
3. 教学乐句可以从小节中间开始，也可以在小节中间结束。
4. `ー` 是演唱延长槽，继承前一个语言 token，但不进入 NLP 文本。
5. 临时拍号、连音、休止和附点是音乐事件，不能从歌词字符推算。

## Layers

### Source

`decodeJPWABC` 和现有 parser 继续负责编码、section、Voice、Words 与 diagnostics。这里不做视觉布局。

### Score IR

`ScoreIR` 是整首歌事实层，保留事件位置、小节、歌词块和语义曲线。

### Phrase Builder

`buildLessonDeck` 将歌词 cell 顺序对齐到 Note/Rhythm event，并生成 `JianpuPhraseFrame[]`。

默认把每个 `/` 当作候选边界，不做不可靠的语言学猜测。歌曲配置可显式控制：

```ts
buildLessonDeck(score, {
  joinSoftBreaks: [
    { left: "さくら", right: "さくら" }
  ],
  splitPhrases: [
    { text: "explicitnormalizedtext", afterSlots: [8, 16] }
  ]
});
```

`afterSlots` 统计可演唱歌词槽，包括 extension；这与视频播放、高亮和 tie ghost 的时间轴一致。

### Phrase Layout

`layoutPhrase` 是纯函数。它接收 Phrase IR，输出 measure、beat、slot、beam、barline 和 curve 几何。

- beat 是一级布局单位
- measure 只组织 beat 和 barline
- lyric cell 绑定 slot，不参与小节线高度计算
- beam 每次只处理一个 beat
- 部分小节只占实际使用的 beat 宽度

### SVG Notation

`JianpuPhraseNotation.vue` 只消费布局结果，以 SVG primitive 和已许可字体渲染：

- 数字、休止、节奏 X
- 升降还原、八度点、附点
- 减时线、增时占位
- 小节线、拍号、弧线和三连音
- 歌词与交互 data attribute

### Lesson Slide

`JianpuLessonSlide.vue` 组合谱面和教学层：

- 上部：曲名、乐句序号、原谱小节范围
- 中部：单句 SVG 简谱
- 下部：日文、读音、罗马字、翻译、词汇和语法
- 底部：播放进度

它不持有播放器状态。宿主通过 `activeSlot` 驱动逐音高亮，因此可接 Slidev、Web Audio、视频导出或课堂遥控器。

## Runtime And Calibration Boundary

PDF/CV 校准工具可以在独立研究工程中用于：

- 比较字形轮廓
- OCR/定位参考
- 样张差异检查
- 为测试 fixture 生成校准数据

生产 Slide 不读取 PDF，也不依赖固定纸张坐标。这样可复用乐句，同时避免把扫描误差带入实时高亮。

## Extension Points

- 多 lyric layer：kana、romaji、translation
- 由外部 NLP 注入 reading/grammar/vocabulary marks
- 手工 phrase manifest，以 anchor 代替文本匹配
- StaffRenderer 使用同一个 Phrase IR
- 视频渲染器按 `activeSlot` 和 slot duration 生成时间轴

