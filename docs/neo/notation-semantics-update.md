# 三连音、倚音与伴奏段落

参考 jpeditor 固定版本 [64d4afa](https://github.com/lodebar2026/jpeditor/tree/64d4afa0af293783e6add7ed34351e96d460ad43)：
`layout.ts::addTuplet`、`entry.ts::addGraceNotes`、`common/gracenote.ts`、
`jpword/Jpwabc.g4`、`model/fromjpw.ts` 与 `model/capability.ts`。
许可记录见 `THIRD_PARTY_NOTICES.md`。

Luopu 的既有公开界面与样式资料继续用于“一份乐谱、多种视图”、
倚音不占歌词格、不同字体各司其职的产品规则；不复制其源码或资源。
倚音直接复用 jpeditor 的 `common/gracenote.ts` 几何，按本地字体墨迹适配；三连音采用 JP-Word 弧线样式。保留两个版本各自现有的数字字体。

[JP-Word 官方手册](https://happyeo.gitbooks.io/jp-word-manual/content/04/04.html)说明：选中音符后，使用多连音按钮或 Shift+F4 添加带连音数的弧线。弧线位于音符与技法记号上方，可多层排列、自动折行。局部 JP-Word PDF 校样用于校准弧顶、尖端粗细和数字位置，不随开源版分发。

| 能力 | 实现与边界 |
| --- | --- |
| 三连音 | 遵循 JP-Word：两段渐变粗细的弧线，数字在弧顶缺口居中；不使用 jpeditor 的直括线；整曲与教学页共用几何，并避让组内记号 |
| 时值 | 三连音成员解析共用于播放拍位和渲染；覆盖四分、八分、十六分及二音三连音；内部圆滑线闭合不提前结束三连音 |
| 倚音 | `{6,}`、`{57}`、升降还原与八度；小号数字、两层连续减时线、第二层下方的连接钩和前置空间；依附主音，不另占歌词格或增加主音时值 |
| 装饰/奏法记号 | `DunYin` 顿音、`BoYin` 波音、`YanYin` 延长记号、`ZhongYin` 重音及其组合 |
| 过门括号 | 在段落边界开始、包住完整小节且在小节线后闭合的括号识别为器乐段；音符间与跨小节的圆滑线仍保留；内层连线与三连音独立配对 |
| 长伴奏 | 自动识别的段落每页至多四小节；相邻器乐页合计实际时值和小节数，遇到人声或空白页停止；每页显示同一段合计，逐页速度分别计算、最后统一四舍五入 |
| 旧数据 | 旧 ScoreIR 中的已知装饰 token 与三连音 marker 在显示副本中补全；保留主音 ID、旧 `Text@@` 文字锚点和已保存的 canonical snapshot |

未知或没有主音的装饰语法仍保留原文与诊断，不猜成普通音符。
这里没有引入自由时长的倚音演奏、延长号的自定延时、全部 MusicXML 装饰记号，
也没有移植 jpeditor 的全部 capability 列表。旧 Sparks 转换器会明确提示不能输出的装饰记号；
整曲 SVG 和教学 SVG 提供上述完整绘制。

`public/fixtures/notation-reference.jpwabc` 是既有示例，现在包含三连音中间的装饰音、
多倚音、四种奏法记号与九小节连续过门；没有新增临时测试页面。

验证覆盖解析、歌词与拍位不变、两种 SVG、括号嵌套、不同速度的伴奏合计、
M2 预检无写入、确认导入后保存重开及显示投影不修改已存数据。
