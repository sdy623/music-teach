import type { JianpuPhraseFrame } from "../../slide/types";
import type { MusicProjectV1, PreservationReport, ProjectMetadata } from "../project/types";

export type ProjectLifecycle = "draft" | "active" | "archived" | "trashed";
export interface LibraryDocument {
  schema: "music-teach/library-document";
  version: 1;
  project: MusicProjectV1;
  lifecycle: ProjectLifecycle;
  previousLifecycle: Exclude<ProjectLifecycle, "trashed">;
  source: { filename: string; format: string; encoding: string; text: string; legacyKey: string | null };
  preservation: PreservationReport | null;
  fingerprint: string;
}
export interface ProjectSummary {
  id: string;
  revision: number;
  title: string;
  artist: string;
  tags: string[];
  updatedAt: string;
  lifecycle: ProjectLifecycle;
  notation: "jianpu";
  phrases: number;
  measures: number;
  thumbnail: JianpuPhraseFrame | null;
}
export interface StoredProject { id: string; revision: number; json: string }
export interface StoredAsset { key: string; projectId: string; assetId: string; name: string; type: string; bytes: ArrayBuffer }
export interface Checkpoint { key: string; projectId: string; name: string; createdAt: string; revision: number; json: string }
export type CheckpointSummary = Omit<Checkpoint, "json">;
export interface ProjectView {
  summary: ProjectSummary;
  metadata: ProjectMetadata;
  source: Omit<LibraryDocument["source"], "text">;
  diagnostics: MusicProjectV1["diagnostics"];
  preservation: PreservationReport | null;
  phrases: { id: string; text: string; kind: string }[];
  assets: { id: string; name: string; type: string | null; missing: boolean }[];
  checkpoints: CheckpointSummary[];
}
export interface ImportPreview {
  token: string;
  existingProjectId?: string;
  summary: ProjectSummary;
  format: string;
  encoding: string;
  sourceBytes: number;
  recordBytes: number;
  lyricLayers: number;
  diagnostics: MusicProjectV1["diagnostics"];
  preservation: PreservationReport | null;
  missingAssets: string[];
  keyAndMeters: string;
  expression: string;
}
export interface ImportInput {
  filename: string;
  bytes: ArrayBuffer;
  canonicalBytes?: ArrayBuffer;
  legacyKey?: string;
}
export interface BlankProjectInput {
  title: string; artist: string; key: string; meter: string; tempo: number; measures: number;
}
export interface ProjectBundle {
  schema: "music-teach/project-bundle";
  version: 1;
  document: LibraryDocument;
  assets: { assetId: string; name: string; type: string; base64: string }[];
}
export class LibraryError extends Error {
  constructor(readonly code: string, message: string, readonly actualRevision?: number) {
    super(message);
    this.name = "LibraryError";
  }
}
export function libraryFailure(error: unknown): LibraryError {
  if (error instanceof LibraryError) return error;
  const detail = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "";
  return new LibraryError(name === "QuotaExceededError" ? "quota-exceeded" : "storage-error", detail);
}
