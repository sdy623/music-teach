import { formatInstrumentalRunCaption } from "../../slide/teachingPresentation";
import { cloneRepositoryJson } from "../project/repositoryValidation";
import type { ProjectMetadata } from "../project/types";
import { ImportService } from "./ImportService";
import { IndexedDbProjectRepository } from "./IndexedDbProjectRepository";
import { LibraryError, type BlankProjectInput, type ImportInput, type LibraryDocument, type ProjectLifecycle } from "./types";

export type LibraryCommand =
  | { method: "list" }
  | { method: "open"; id: string }
  | { method: "create"; input: BlankProjectInput }
  | { method: "configure-blank"; id: string; revision: number; input: BlankProjectInput }
  | { method: "metadata"; id: string; revision: number; metadata: ProjectMetadata }
  | { method: "fork"; metadata: ProjectMetadata }
  | { method: "frame"; id: string; revision: number; index: number }
  | { method: "prepare"; input: ImportInput }
  | { method: "discard" }
  | { method: "commit"; token: string; legacyText?: string }
  | { method: "duplicate"; id: string; revision: number }
  | { method: "lifecycle"; id: string; revision: number; lifecycle: ProjectLifecycle | "restore" }
  | { method: "checkpoint"; id: string; revision: number; name: string }
  | { method: "restore-checkpoint"; id: string; revision: number; key: string }
  | { method: "asset"; id: string; revision: number; name: string; type: string; bytes: ArrayBuffer; assetId?: string }
  | { method: "export"; id: string };

export class LibraryService {
  readonly imports: ImportService;
  private opened: LibraryDocument | null = null;
  constructor(readonly repository = new IndexedDbProjectRepository()) { this.imports = new ImportService(repository); }
  private async show(document: LibraryDocument) { this.opened = document; return this.repository.view(document); }
  async run(command: LibraryCommand): Promise<unknown> {
    const repository = this.repository;
    switch (command.method) {
      case "list": return repository.list();
      case "open": return this.show(await repository.get(command.id));
      case "create": return this.show(await this.imports.createBlank(command.input));
      case "configure-blank": return this.show(await repository.configureBlank(command.id, command.revision, this.imports.buildBlank(command.input)));
      case "metadata": return this.show(await repository.updateMetadata(command.id, command.revision, command.metadata));
      case "fork": {
        if (!this.opened) throw new LibraryError("missing-session", "原会话已关闭，请先重新打开工程。" );
        const copy = cloneRepositoryJson(this.opened);
        copy.project.metadata = cloneRepositoryJson(command.metadata);
        return this.show(await repository.duplicate(copy));
      }
      case "frame": {
        const document = this.opened?.project.id === command.id ? this.opened : await repository.get(command.id);
        if (document.project.revision !== command.revision) throw new LibraryError("conflict", "预览版本已改变，请重新打开。", document.project.revision);
        const frames = repository.frames(document);
        const frame = frames[command.index];
        return frame ? { ...frame, instrumentalRunCaption: formatInstrumentalRunCaption(frames, command.index) } : null;
      }
      case "prepare": return this.imports.prepare(command.input);
      case "discard": this.imports.discard(); return null;
      case "commit": return this.show(await this.imports.commit(command.token, command.legacyText));
      case "duplicate": {
        const document = await repository.get(command.id);
        if (document.project.revision !== command.revision) throw new LibraryError("conflict", "工程已有更新，请刷新工程库。", document.project.revision);
        return repository.view(await repository.duplicate(document));
      }
      case "lifecycle": {
        const document = await repository.setLifecycle(command.id, command.revision, command.lifecycle);
        return this.opened?.project.id === command.id ? this.show(document) : repository.view(document);
      }
      case "checkpoint": await repository.checkpoint(command.id, command.revision, command.name); return this.show(await repository.get(command.id));
      case "restore-checkpoint": return this.show(await repository.restoreCheckpoint(command.id, command.revision, command.key));
      case "asset": return this.show(await repository.attachAsset(command.id, command.revision, command.name, command.type, command.bytes, command.assetId));
      case "export": return this.imports.export(command.id);
    }
  }
}
