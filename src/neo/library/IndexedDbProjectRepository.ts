import { convertParsedScoreToTeachingProject } from "../../project/jpwabcProject";
import { buildInstrumentalMeasureFrame } from "../../slide/buildLessonDeck";
import type { JianpuPhraseFrame } from "../../slide/types";
import { createDeterministicFingerprint as fingerprint } from "../project/fingerprint";
import { assertRepositoryProject, cloneRepositoryJson } from "../project/repositoryValidation";
import { LEGACY_SOURCE_SNAPSHOT_EXTENSION_KEY } from "../project/teachingProjectV3Adapter";
import type { MusicProjectV1, ProjectMetadata } from "../project/types";
import { IndexedDbProjectDatabase, type ProjectDatabase } from "./ProjectDatabase";
import { LibraryError, type Checkpoint, type LibraryDocument, type ProjectLifecycle, type ProjectSummary, type ProjectView, type StoredAsset } from "./types";

export const newProjectId = () => `neo-${crypto.randomUUID()}`;
export function projectFingerprint(project: MusicProjectV1): string {
  const { revisionFingerprint: _ignored, ...content } = project;
  return fingerprint(content);
}
function documentFingerprint(document: LibraryDocument): string {
  const { fingerprint: _ignored, ...content } = document;
  return fingerprint(content);
}
export function sealDocument(document: LibraryDocument): LibraryDocument {
  assertLibraryEnvelope(document);
  assertRepositoryProject(document.project);
  document.project.revisionFingerprint = projectFingerprint(document.project);
  document.fingerprint = documentFingerprint(document);
  return document;
}
export function readDocument(json: string): LibraryDocument {
  const document = cloneRepositoryJson(JSON.parse(json)) as LibraryDocument;
  assertLibraryEnvelope(document);
  assertRepositoryProject(document.project);
  if (document.project.revision < 1 || document.project.revisionFingerprint !== projectFingerprint(document.project)
    || document.fingerprint !== documentFingerprint(document)) throw new LibraryError("corrupt", "工程完整性检查失败。原记录仍保留。" );
  return document;
}
function assertLibraryEnvelope(document: LibraryDocument): void {
  if (!document || document.schema !== "music-teach/library-document" || document.version !== 1
    || !["draft", "active", "archived", "trashed"].includes(document.lifecycle)
    || !["draft", "active", "archived"].includes(document.previousLifecycle)
    || !document.source || typeof document.source.text !== "string" || typeof document.source.filename !== "string"
    || typeof document.source.format !== "string" || typeof document.source.encoding !== "string"
    || (document.source.legacyKey !== null && typeof document.source.legacyKey !== "string")) {
    throw new LibraryError("corrupt", "工程记录不完整，已停止读取。原记录仍保留。" );
  }
}

/** Full aggregates remain in the worker; the UI receives only explicit projections. */
export class IndexedDbProjectRepository {
  private projectionCache: { fingerprint: string; frames: JianpuPhraseFrame[] } | null = null;
  constructor(readonly database: ProjectDatabase = new IndexedDbProjectDatabase()) {}

  async get(id: string): Promise<LibraryDocument> {
    const stored = await this.database.read(id);
    if (!stored) throw new LibraryError("missing", "找不到这个工程。可返回工程库检查垃圾箱。" );
    const document = readDocument(stored.json);
    if (document.project.id !== id || document.project.revision !== stored.revision) throw new LibraryError("corrupt", "工程身份与索引不一致。" );
    return document;
  }
  list(): Promise<ProjectSummary[]> { return this.database.list(); }

  frames(document: LibraryDocument): JianpuPhraseFrame[] {
    const snapshot = document.project.score.snapshot!;
    const key = document.project.score.snapshotFingerprint!;
    if (this.projectionCache?.fingerprint === key) return this.projectionCache.frames;
    const score = { ...snapshot.value, voices: snapshot.value.voices.map(voice => ({ ...voice, anchors: new Map(voice.anchors) })) };
    const frames = convertParsedScoreToTeachingProject(score, "neo-preview").project.phrases.flatMap(phrase => phrase.frame ? [phrase.frame] : []);
    // Scores without lyrics still have canonical music to preview. Keep these
    // display slices separate from the persisted lesson phrase structure.
    if (!frames.length) {
      const measures = score.voices[0]?.measures ?? [];
      for (let index = 0; index < measures.length; index += 4) {
        const start = measures[index]!.number;
        const end = measures[Math.min(index + 3, measures.length - 1)]!.number;
        const frame = buildInstrumentalMeasureFrame(score, start, end, frames.length, {
          idPrefix: "neo-score-preview", label: "谱面片段",
          annotation: `第 ${start}–${end} 小节 · 已保存谱面`
        });
        if (frame) frames.push(frame);
      }
    }
    this.projectionCache = { fingerprint: key, frames };
    return frames;
  }
  summary(document: LibraryDocument): ProjectSummary {
    const project = document.project;
    const frames = this.frames(document);
    return {
      id: project.id, revision: project.revision, title: project.metadata.title || "未命名工程",
      artist: project.metadata.artist, tags: [...project.metadata.tags], updatedAt: project.updatedAt ?? "",
      lifecycle: document.lifecycle, notation: "jianpu", phrases: project.lesson.phrases.length,
      measures: project.score.snapshot!.value.voices.reduce((count, voice) => Math.max(count, voice.measures.length), 0),
      thumbnail: frames.find(frame => frame.slots.length > 0) ?? null
    };
  }
  async view(document: LibraryDocument): Promise<ProjectView> {
    const [assets, checkpoints] = await Promise.all([this.database.assets(document.project.id), this.database.checkpoints(document.project.id)]);
    const { text: _text, ...source } = document.source;
    return {
      summary: this.summary(document), metadata: cloneRepositoryJson(document.project.metadata), source,
      diagnostics: document.project.diagnostics, preservation: document.preservation,
      phrases: this.frames(document).map((frame, index) => ({ id: String(index), text: frame.lyricText || `谱面片段 ${index + 1}`, kind: "score" })),
      assets: document.project.assets.map(ref => ({ id: ref.id, name: String(ref.extensions.filename ?? ref.id), type: ref.mediaType, missing: !assets.some(asset => asset.assetId === ref.id) })),
      checkpoints: checkpoints.map(({ json: _json, ...entry }) => entry).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    };
  }

  async create(input: LibraryDocument, assets: StoredAsset[] = [], migrationKey?: string): Promise<LibraryDocument> {
    const document = cloneRepositoryJson(input);
    document.project.revision = 1;
    const now = new Date().toISOString();
    document.project.createdAt = now;
    document.project.updatedAt = now;
    sealDocument(document);
    const json = JSON.stringify(document);
    // Verify the exact bytes BEFORE opening a write transaction.
    readDocument(json);
    await this.database.commit({ expected: null, record: { id: document.project.id, revision: 1, json }, summary: this.summary(document), assets,
      ...(migrationKey ? { migration: { key: migrationKey, projectId: document.project.id } } : {}) });
    return document;
  }

  async save(input: LibraryDocument, expectedRevision: number, options: { assets?: StoredAsset[]; checkpoint?: Checkpoint } = {}): Promise<LibraryDocument> {
    const document = cloneRepositoryJson(input); // Capture caller data before any await.
    assertLibraryEnvelope(document);
    assertRepositoryProject(document.project);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || expectedRevision >= Number.MAX_SAFE_INTEGER
      || document.project.revision !== expectedRevision) throw new LibraryError("invalid", "工程版本无效。" );
    const stored = await this.database.read(document.project.id);
    if (!stored) throw new LibraryError("missing", "工程已不存在。" );
    const previous = readDocument(stored.json);
    if (previous.project.revision !== expectedRevision) throw new LibraryError("conflict", "另一页面已保存更新。你的修改仍被保留。", previous.project.revision);
    if (fingerprint(previous.source) !== fingerprint(document.source)
      || fingerprint(previous.preservation) !== fingerprint(document.preservation)
      || fingerprint(previous.project.extensions[LEGACY_SOURCE_SNAPSHOT_EXTENSION_KEY]) !== fingerprint(document.project.extensions[LEGACY_SOURCE_SNAPSHOT_EXTENSION_KEY])) {
      throw new LibraryError("invalid", "原始来源和保留报告不能通过普通保存修改。" );
    }
    for (const provenance of previous.project.provenance.filter(entry => entry.kind === "migration")) {
      if (fingerprint(document.project.provenance.find(entry => entry.id === provenance.id)) !== fingerprint(provenance)) throw new LibraryError("invalid", "原始迁移来源必须保留。" );
    }
    if (previous.project.score.snapshotFingerprint !== document.project.score.snapshotFingerprint
      && previous.project.score.revision === document.project.score.revision) throw new LibraryError("invalid", "谱面变更需要新的谱面版本。" );
    document.project.revision++;
    document.project.updatedAt = new Date().toISOString();
    sealDocument(document);
    const json = JSON.stringify(document);
    await this.database.commit({ expected: stored.json, record: { id: document.project.id, revision: document.project.revision, json }, summary: this.summary(document), ...options });
    return document;
  }

  async updateMetadata(id: string, revision: number, input: ProjectMetadata): Promise<LibraryDocument> {
    const metadata = cloneRepositoryJson(input);
    const document = await this.get(id);
    if (document.project.revision !== revision) throw new LibraryError("conflict", "另一页面已保存更新。你的修改仍被保留。", document.project.revision);
    if (document.lifecycle === "trashed") throw new LibraryError("trashed", "请先从垃圾箱恢复工程。" );
    document.project.metadata = metadata;
    return this.save(document, revision);
  }
  async configureBlank(id: string, revision: number, input: LibraryDocument): Promise<LibraryDocument> {
    const stored = await this.database.read(id);
    if (!stored) throw new LibraryError("missing", "工程已不存在。" );
    const previous = readDocument(stored.json);
    if (previous.project.revision !== revision) throw new LibraryError("conflict", "另一页面已保存更新，请重新打开。", previous.project.revision);
    if (previous.lifecycle !== "draft" || previous.source.format !== "简谱空白模板") throw new LibraryError("invalid", "模板设置只适用于新建的空白草稿。" );
    const document = cloneRepositoryJson(input);
    document.project.id = id;
    document.project.revision = revision + 1;
    document.project.createdAt = previous.project.createdAt;
    document.project.updatedAt = new Date().toISOString();
    document.project.metadata = { ...previous.project.metadata, keyAndMeters: document.project.metadata.keyAndMeters, expression: document.project.metadata.expression };
    document.project.assets = previous.project.assets;
    sealDocument(document);
    await this.database.commit({ expected: stored.json, record: { id, revision: document.project.revision, json: JSON.stringify(document) }, summary: this.summary(document), checkpoint: this.checkpointOf(previous, "空白模板调整前") });
    return document;
  }
  async setLifecycle(id: string, revision: number, lifecycle: ProjectLifecycle | "restore"): Promise<LibraryDocument> {
    const document = await this.get(id);
    if (document.project.revision !== revision) throw new LibraryError("conflict", "工程已有更新，请刷新后重试。", document.project.revision);
    if (lifecycle === "restore") {
      document.lifecycle = document.lifecycle === "trashed" ? document.previousLifecycle : "active";
    } else {
      if (lifecycle === "trashed" && document.lifecycle !== "trashed") document.previousLifecycle = document.lifecycle;
      document.lifecycle = lifecycle;
    }
    return this.save(document, revision);
  }
  async duplicate(input: LibraryDocument, title?: string): Promise<LibraryDocument> {
    const document = cloneRepositoryJson(input);
    const oldId = document.project.id;
    document.project.id = newProjectId();
    document.project.metadata.title = title ?? `${document.project.metadata.title} · 副本`;
    document.lifecycle = "draft";
    document.previousLifecycle = "draft";
    const assets = (await this.database.assets(oldId)).map(asset => ({ ...asset, projectId: document.project.id, key: `${document.project.id}/${asset.assetId}` }));
    return this.create(document, assets);
  }
  private checkpointOf(document: LibraryDocument, name: string): Checkpoint {
    return { key: `${document.project.id}/${crypto.randomUUID()}`, projectId: document.project.id, name: name.trim() || "未命名检查点",
      createdAt: new Date().toISOString(), revision: document.project.revision, json: JSON.stringify(document) };
  }
  async checkpoint(id: string, revision: number, name: string): Promise<void> {
    const document = await this.get(id);
    if (document.project.revision !== revision) throw new LibraryError("conflict", "工程已有更新，请重新打开后建立检查点。", document.project.revision);
    const json = JSON.stringify(document);
    await this.database.commit({ expected: json, record: { id, revision, json }, summary: this.summary(document), checkpoint: this.checkpointOf(document, name) });
  }
  async restoreCheckpoint(id: string, revision: number, key: string): Promise<LibraryDocument> {
    const stored = await this.database.read(id);
    if (!stored) throw new LibraryError("missing", "工程已不存在。" );
    const current = readDocument(stored.json);
    if (current.project.revision !== revision) throw new LibraryError("conflict", "工程已有更新，请重新打开。", current.project.revision);
    const checkpoint = (await this.database.checkpoints(id)).find(entry => entry.key === key);
    if (!checkpoint) throw new LibraryError("missing", "找不到这个检查点。" );
    const restored = readDocument(checkpoint.json);
    if (restored.project.id !== id) throw new LibraryError("invalid", "检查点不属于此工程。" );
    restored.project.revision = revision + 1;
    restored.project.updatedAt = new Date().toISOString();
    sealDocument(restored);
    await this.database.commit({ expected: stored.json, record: { id, revision: restored.project.revision, json: JSON.stringify(restored) }, summary: this.summary(restored), checkpoint: this.checkpointOf(current, "恢复之前的版本") });
    return restored;
  }
  async attachAsset(id: string, revision: number, name: string, type: string, input: ArrayBuffer, assetId?: string): Promise<LibraryDocument> {
    const bytes = input.slice(0);
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
    const document = await this.get(id);
    if (document.project.revision !== revision) throw new LibraryError("conflict", "工程已有更新，附件未写入。", document.project.revision);
    const existing = assetId ? document.project.assets.find(asset => asset.id === assetId) : undefined;
    if (assetId && !existing) throw new LibraryError("missing", "待补充的资产引用不存在。" );
    if (existing && existing.fingerprint !== `sha256:${digest}`) throw new LibraryError("asset-mismatch", "文件指纹与缺失资产不一致，未替换引用。" );
    const ref = existing ?? { id: `asset-${crypto.randomUUID()}`, kind: type.startsWith("audio/") ? "audio" : "attachment", fingerprint: `sha256:${digest}`, mediaType: type || "application/octet-stream", extensions: { filename: name } };
    if (!existing) document.project.assets.push(ref);
    return this.save(document, revision, { assets: [{ key: `${id}/${ref.id}`, projectId: id, assetId: ref.id, name, type, bytes }] });
  }
}
