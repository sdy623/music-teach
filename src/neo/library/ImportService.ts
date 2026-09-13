import { decodeJPWABCWithInfo } from "../../core/decode";
import { parseJPWABC } from "../../parser/parseJPWABC";
import { convertParsedScoreToTeachingProject } from "../../project/jpwabcProject";
import { LocalStorageProjectRepository } from "../project/LocalStorageProjectRepository";
import { createDeterministicFingerprint as fingerprint } from "../project/fingerprint";
import { assertRepositoryProject, cloneRepositoryJson } from "../project/repositoryValidation";
import { adaptTeachingProjectV3 } from "../project/teachingProjectV3Adapter";
import type { MusicProjectV1, PreservationReport } from "../project/types";
import { IndexedDbProjectRepository, newProjectId, projectFingerprint, readDocument, sealDocument } from "./IndexedDbProjectRepository";
import { LibraryError, type BlankProjectInput, type ImportInput, type ImportPreview, type LibraryDocument, type ProjectBundle, type StoredAsset } from "./types";

const encoder = new TextEncoder();
const MAX_FILE_BYTES = 64 * 1024 * 1024;
function parseScore(bytes: ArrayBuffer) {
  const decoded = decodeJPWABCWithInfo(bytes);
  if (!/^\.Voice\s*$/m.test(decoded.text.replace(/\r/g, "")) || !/^\.Title\s*$/m.test(decoded.text.replace(/\r/g, ""))) {
    throw new LibraryError("invalid-import", "没有找到 JPW-ABC 的 Title / Voice 段。请检查文件格式。" );
  }
  const parsed = parseJPWABC(decoded.text);
  const errors = parsed.diagnostics.filter(entry => entry.severity === "error");
  if (errors.length) throw new LibraryError("invalid-import", `谱面解析未通过：${errors.slice(0, 3).map(entry => entry.message).join("；")}`);
  return { decoded, parsed };
}
function migrated(source: unknown, canonicalBytes: ArrayBuffer): { project: MusicProjectV1; preservation: PreservationReport } {
  const { parsed } = parseScore(canonicalBytes);
  const migration = adaptTeachingProjectV3(source, { canonicalScore: { snapshot: parsed.value, revision: `score-${crypto.randomUUID()}`, verified: true } });
  if (!migration.candidate || migration.lifecycle.commitEligibility !== "eligible") {
    throw new LibraryError("invalid-import", migration.diagnostics.filter(entry => entry.severity === "error").map(entry => entry.message).join("；") || "迁移候选未通过检查。" );
  }
  const project = migration.candidate;
  project.diagnostics.push(...parsed.diagnostics.map((entry, index) => ({ id: `import-parser-${index}`, severity: entry.severity, source: "parser" as const, code: entry.code, message: entry.message })));
  return { project, preservation: migration.preservation };
}
function newDocument(project: MusicProjectV1, preservation: PreservationReport | null, source: LibraryDocument["source"]): LibraryDocument {
  project.id = newProjectId();
  return sealDocument({ schema: "music-teach/library-document", version: 1, project, lifecycle: "draft", previousLifecycle: "draft", source, preservation, fingerprint: "pending" });
}
function fromBase64(value: string): ArrayBuffer {
  if (typeof value !== "string" || value.length > MAX_FILE_BYTES * 1.4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new LibraryError("invalid-import", "附件编码无效或超过单文件 64 MiB 上限。" );
  return Uint8Array.from(atob(value), character => character.charCodeAt(0)).buffer;
}
function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  const chunks: string[] = [];
  for (let at = 0; at < view.length; at += 32768) chunks.push(String.fromCharCode(...view.subarray(at, at + 32768)));
  return btoa(chunks.join(""));
}

export class ImportService {
  private pending: { token: string; document: LibraryDocument; assets: StoredAsset[]; migrationKey?: string; legacyText?: string } | null = null;
  constructor(readonly repository: IndexedDbProjectRepository) {}

  async prepare(input: ImportInput): Promise<ImportPreview> {
    this.pending = null;
    if (input.bytes.byteLength > MAX_FILE_BYTES) throw new LibraryError("too-large", "单个导入文件最大为 64 MiB。" );
    const decoded = decodeJPWABCWithInfo(input.bytes);
    const text = decoded.text.replace(/^\uFEFF/, "");
    let document: LibraryDocument;
    let format: string;
    let bundleAssets: ProjectBundle["assets"] = [];
    if (text.trimStart().startsWith("{")) {
      const value = cloneRepositoryJson(JSON.parse(text)) as Record<string, unknown>;
      let project: MusicProjectV1;
      let preservation: PreservationReport | null = null;
      if (value.schema === "music-teach/project-bundle") {
        if (value.version !== 1 || !Array.isArray(value.assets)) throw new LibraryError("invalid-import", "不支持这个工程包版本。" );
        document = readDocument(JSON.stringify(value.document));
        bundleAssets = value.assets as ProjectBundle["assets"];
        document.project.id = newProjectId();
        document.lifecycle = "draft";
        document.previousLifecycle = "draft";
        sealDocument(document);
        format = "Music Teach 工程包 v1";
      } else {
        if (value.schema === "music-teach/neo-project-record") {
          const id = (value.project as MusicProjectV1 | undefined)?.id;
          if (!id) throw new LibraryError("invalid-import", "旧仓库记录缺少工程身份。" );
          const reader = new LocalStorageProjectRepository({ storage: { getItem: () => text, setItem: () => { throw new Error("Read only"); } }, lock: null });
          const read = await reader.get(id);
          if (read.status !== "found") throw new LibraryError("invalid-import", "旧仓库记录未通过完整性检查。" );
          project = read.record.project;
          preservation = read.record.migration.preservation;
          format = "M1 仓库记录 v1";
        } else if (value.schema === "music-teach/project") {
          assertRepositoryProject(value);
          project = value;
          if (project.revisionFingerprint !== projectFingerprint(project)) throw new LibraryError("invalid-import", "工程指纹不匹配。请重新导出完整工程。" );
          format = "MusicProject v1";
        } else if (value.formatVersion === 3) {
          if (!input.canonicalBytes) throw new LibraryError("canonical-required", "这个旧版 JSON 没有独立的完整谱面。请选择与它配对的 JPW-ABC 文件后重新预检；旧乐句画面不会被当作原始谱面。" );
          ({ project, preservation } = migrated(value, input.canonicalBytes));
          format = "TeachingProject v3 + 配对 JPW-ABC";
        } else throw new LibraryError("invalid-import", "无法识别 JSON 工程格式或版本。" );
        document = newDocument(project, preservation, { filename: input.filename, format, encoding: decoded.encoding, text, legacyKey: input.legacyKey ?? null });
      }
    } else {
      const { parsed } = parseScore(input.bytes);
      // The converter produces an in-memory v3 object with optional undefined
      // properties. Its JSON representation is the migration source format.
      const source = JSON.parse(JSON.stringify(convertParsedScoreToTeachingProject(parsed.value, `import-${crypto.randomUUID()}`).project));
      const result = migrated(source, input.bytes);
      format = "JPW-ABC";
      document = newDocument(result.project, result.preservation, { filename: input.filename, format, encoding: decoded.encoding, text, legacyKey: input.legacyKey ?? null });
    }
    assertRepositoryProject(document.project);
    const assets: StoredAsset[] = [];
    const seen = new Set<string>();
    for (const entry of bundleAssets) {
      if (!entry || typeof entry.assetId !== "string" || typeof entry.name !== "string" || typeof entry.type !== "string" || seen.has(entry.assetId)) throw new LibraryError("invalid-import", "工程包有无效或重复的附件。" );
      seen.add(entry.assetId);
      const ref = document.project.assets.find(asset => asset.id === entry.assetId);
      if (!ref) throw new LibraryError("invalid-import", "工程包附件缺少对应引用。" );
      const bytes = fromBase64(entry.base64);
      const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
      if (ref.fingerprint !== `sha256:${digest}`) throw new LibraryError("invalid-import", "工程包附件的内容指纹不匹配。" );
      assets.push({ key: `${document.project.id}/${entry.assetId}`, projectId: document.project.id, assetId: entry.assetId, name: entry.name, type: entry.type, bytes });
    }
    const token = crypto.randomUUID();
    this.pending = { token, document, assets, ...(input.legacyKey ? { migrationKey: `${input.legacyKey}:${fingerprint(text)}`, legacyText: text } : {}) };
    const existingProjectId = this.pending.migrationKey ? await this.repository.database.migration(this.pending.migrationKey) : null;
    return {
      token, ...(existingProjectId ? { existingProjectId } : {}), summary: this.repository.summary(document), format, encoding: decoded.encoding, sourceBytes: input.bytes.byteLength,
      recordBytes: encoder.encode(JSON.stringify(document)).length, lyricLayers: document.project.lyricLayers.length,
      diagnostics: document.project.diagnostics, preservation: document.preservation,
      missingAssets: document.project.assets.filter(ref => !seen.has(ref.id)).map(ref => String(ref.extensions.filename ?? ref.id)),
      keyAndMeters: document.project.metadata.keyAndMeters, expression: document.project.metadata.expression
    };
  }
  discard(): void { this.pending = null; }
  async commit(token: string, legacyText?: string): Promise<LibraryDocument> {
    const pending = this.pending;
    if (!pending || pending.token !== token) throw new LibraryError("expired-preview", "预检已失效，请重新选择文件。" );
    if (pending.legacyText !== undefined && legacyText !== pending.legacyText) throw new LibraryError("source-changed", "旧工程在预检后发生变化，请重新预检。" );
    if (pending.migrationKey) {
      const existing = await this.repository.database.migration(pending.migrationKey);
      if (existing) { this.pending = null; return this.repository.get(existing); }
    }
    let result: LibraryDocument;
    try { result = await this.repository.create(pending.document, pending.assets, pending.migrationKey); }
    catch (error) {
      const existing = pending.migrationKey ? await this.repository.database.migration(pending.migrationKey) : null;
      if (!existing) throw error;
      result = await this.repository.get(existing);
    }
    const readback = await this.repository.get(result.project.id);
    if (readback.fingerprint !== result.fingerprint) throw new LibraryError("readback-failed", "工程已写入，但重新读取核验不一致。请从工程库检查，勿重复导入。" );
    this.pending = null;
    return readback;
  }
  buildBlank(input: BlankProjectInput): LibraryDocument {
    if (!Number.isInteger(input.measures) || input.measures < 1 || input.measures > 64
      || !Number.isInteger(input.tempo) || input.tempo < 20 || input.tempo > 300
      || !["C", "D", "E", "F", "G", "A", "B", "Bb", "Eb"].includes(input.key)
      || !["2/4", "3/4", "4/4", "6/8"].includes(input.meter)) throw new LibraryError("invalid", "请检查调号、拍号、速度（20–300）和小节数（1–64）。" );
    const [beats] = input.meter.split("/").map(Number);
    const title = input.title.trim() || "未命名工程";
    const source = `.Options\n.Fonts\n.Title\nTitle = ${title.replace(/[\r\n]/g, " ")}\nKeyAndMeters = 1=${input.key},${input.meter}\nExpression = J=${input.tempo}\n.Voice\n${Array.from({ length: input.measures }, () => `${Array(beats).fill(input.meter === "6/8" ? "0_" : "0").join(" ")} |`).join("\n")}\n.Words\n.Attachments\n.Page\n`;
    const bytes = encoder.encode(source).buffer;
    const { parsed } = parseScore(bytes);
    const result = migrated(JSON.parse(JSON.stringify(convertParsedScoreToTeachingProject(parsed.value, `blank-${crypto.randomUUID()}`).project)), bytes);
    result.project.metadata.title = title;
    result.project.metadata.artist = input.artist;
    const document = newDocument(result.project, result.preservation, { filename: "blank.jpwabc", format: "简谱空白模板", encoding: "utf-8", text: source, legacyKey: null });
    return document;
  }
  createBlank(input: BlankProjectInput): Promise<LibraryDocument> {
    return this.repository.create(this.buildBlank(input));
  }
  async export(id: string): Promise<{ filename: string; bytes: ArrayBuffer; missingAssets: string[] }> {
    const document = await this.repository.get(id);
    const stored = await this.repository.database.assets(id);
    const bundle: ProjectBundle = { schema: "music-teach/project-bundle", version: 1, document,
      assets: stored.filter(asset => document.project.assets.some(ref => ref.id === asset.assetId)).map(asset => ({ assetId: asset.assetId, name: asset.name, type: asset.type, base64: toBase64(asset.bytes) })) };
    return { filename: `${document.project.metadata.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_") || "project"}.musicteach.json`, bytes: encoder.encode(JSON.stringify(bundle)).buffer,
      missingAssets: document.project.assets.filter(ref => !stored.some(asset => asset.assetId === ref.id)).map(ref => ref.id) };
  }
}
