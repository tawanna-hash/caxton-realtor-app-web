declare module 'pdfjs-dist/build/pdf.mjs' {
  export const GlobalWorkerOptions: { workerSrc: string };
  export function getDocument(params: unknown): {
    promise: Promise<{
      numPages: number;
      getPage: (n: number) => Promise<{
        getAnnotations: () => Promise<Array<{ subtype?: string; url?: string; rect?: number[] }>>;
        getViewport: (params: { scale: number }) => { width: number; height: number };
        cleanup: () => void;
      }>;
      destroy: () => Promise<void>;
    }>;
  };
}
