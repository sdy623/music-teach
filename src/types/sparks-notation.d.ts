declare module "@sparks-notation/core" {
  export const SparksNMN: {
    parse(doc: string): any;
    render(result: any, language: any, positionCallback?: (row: number, col: number) => void, sectionPickCallback?: (...args: any[]) => void): any[];
    paginize(result: any, fields: any[], language: any): { result: any[]; pages: number };
    fontLoader: {
      requestFontLoad(path: string, onComplete: () => void, onProgress?: (progress: number, total: number) => void): void;
    };
  };
  export const NMNI18n: {
    languages: {
      zh_cn: any;
      en?: any;
    };
  };
  export type NMNResult = any;
}

declare module "@sparks-notation/core/equifield/equifield" {
  export interface EquifieldSection {
    element: HTMLElement;
    height: number;
    breakAfter?: "always" | "avoid";
    isMargin?: boolean;
    label?: string;
    localeLabel?: string;
    padding?: [number, number];
  }

  export class Equifield {
    constructor(element: HTMLDivElement);
    resize(): void;
    render(sections: EquifieldSection[]): void;
    destroy(): void;
  }
}
