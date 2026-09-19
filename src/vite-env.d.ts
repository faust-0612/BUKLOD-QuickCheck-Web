/// <reference types="vite/client" />

declare module 'mammoth' {
  type RawTextResult = { value: string; messages: unknown[] };
  const mammoth: {
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<RawTextResult>;
  };
  export default mammoth;
}
