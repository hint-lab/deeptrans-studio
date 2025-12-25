declare module 'pdf-parse' {
    export interface PdfParseResult {
        text: string;
        // add more fields if needed
    }
    // Accept Buffer/Uint8Array/ArrayBuffer
    export default function pdfParse(
        data: Buffer | Uint8Array | ArrayBuffer
    ): Promise<PdfParseResult>;
}
