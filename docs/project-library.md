# Project library / 工程库

Music Teach v0.3.0 opens the local project library at /library. The library UI currently uses Chinese. Projects are stored in the browser, with no account or cloud service required.

## 开始使用

1. 在工程库选择“さくら →”或“导入工程”，查看编码、格式、小节与乐句数量、诊断、缺失附件及字段保留报告。
2. 点击“确认导入”才会保存。新建空白谱也先保存为版本 1，再打开工程页。
3. 修改标题、作者、标签和说明时，检查保存状态与版本。工程页提供乐句预览、来源原文、附件和检查点。
4. 在工程库搜索、排序、复制或归档。移入垃圾箱后可以恢复，也可以继续预览和导出。
5. 导出工程包作为备份或迁移文件；当前已存在的二进制附件会随包导出。

## 保存与恢复

- IndexedDB 保存完整工程、摘要、附件、检查点与迁移标记，相关写入在一个事务内提交。Worker 负责解析、校验和序列化。
- 保存检查期望版本。另一个页面已经保存时，当前文字继续保留，可以重试或另存副本；不会默默覆盖新版本。
- 文字恢复草稿独立记录，重新打开时必须明确采用。突发退出仍可能早于异步保存完成，恢复日志也不能替代导出备份。
- 命名检查点最多保留 20 个。恢复检查点会生成新版本，并保留恢复前的状态。
- 旧工程只读扫描；明确迁入后使用新 ID，保留旧存储。TeachingProject v3 迁入需要配对 JPW-ABC，旧版 phrase.frame 不替代 canonical ScoreIR。
- 未知字段、来源文本及保留报告通过迁移适配器保存。解码后的来源文本不承诺保留输入 BOM 的原始字节。

## 格式与限制

导入支持 JPW-ABC、配对原谱的 TeachingProject v3、M1 仓库记录、MusicProject v1 和 M2 工程包。单个输入文件和附件上限为 64 MiB；大型附件经 base64 打包后可能超过再导入上限。

工程库当前支持元数据编辑和简谱预览；音符、歌词、教学编排的统一可撤销编辑属于后续 M3。五线谱和 TAB 尚未实现。旧版乐句编辑与播放仍从 /legacy/projects/new 进入，旧歌曲路径和 query 链接继续兼容。

浏览器按 origin 隔离数据，包括协议、主机和端口。更换 localhost/127.0.0.1、端口或部署地址不会自动迁移工程；请导出后再导入。清理站点数据会删除本机工程。静态构建应通过 HTTP(S) 提供，不把 file://、WebView 宿主或真实手机视为已验收环境。

## Developer map

- src/neo/project: MusicProject v1, preservation adapters, revision-checked repository contracts and localStorage compatibility.
- src/neo/library: IndexedDB transactions, import/export, Worker messages, and recovery sessions.
- src/neo/ui: library, reviewed import dialog, project metadata, and read-only score previews.
- tests/neo: migration/unknown-field preservation, conflicts, failed transaction protection, recovery, checkpoints, assets, and an original large synthetic score.

All notation views derive from canonical ScoreIR. See [engraving notes](notation-rendering.md) for the shared curve and duration-line renderer.
