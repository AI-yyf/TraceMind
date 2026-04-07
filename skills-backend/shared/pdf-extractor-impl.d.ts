/**
 * PDF 提取器实现
 * 调用 Python 脚本进行实际的 PDF 提取
 */
export interface ExtractedFigure {
    id: string;
    number: number;
    caption: string;
    page: number;
    imagePath: string;
    width: number;
    height: number;
    bbox: number[] | null;
}
export interface ExtractedTable {
    id: string;
    number: number;
    caption: string;
    page: number;
    headers: string[];
    rows: Array<Record<string, string>>;
    rawText: string;
    bbox: number[];
}
export interface ExtractedFormula {
    id: string;
    number: string;
    latex: string;
    rawText: string;
    page: number;
    type: 'inline' | 'display';
}
export interface ExtractedPage {
    pageNumber: number;
    text: string;
    blocks: Array<{
        bbox: number[];
        text: string;
        type: string;
    }>;
}
export interface PDFExtractionResult {
    paperId: string;
    paperTitle: string;
    pageCount: number;
    coverPath?: string;
    abstract?: string;
    fullText: string;
    pages: ExtractedPage[];
    figures: ExtractedFigure[];
    tables: ExtractedTable[];
    formulas: ExtractedFormula[];
    metadata: {
        title: string;
        author: string;
        subject: string;
        creator: string;
        producer: string;
    };
}
export interface ExtractionOptions {
    extractFigures: boolean;
    extractTables: boolean;
    extractFormulas: boolean;
    extractText: boolean;
    figureMinSize?: {
        width: number;
        height: number;
    };
    tableMinRows?: number;
}
/**
 * 使用 Python 脚本提取 PDF
 */
export declare function extractPDFWithPython(pdfPath: string, outputDir: string, paperId: string, paperTitle: string): Promise<PDFExtractionResult>;
/**
 * PDF 提取器类
 */
export declare class PDFExtractor {
    private options;
    constructor(options?: Partial<ExtractionOptions>);
    /**
     * 从文件路径提取 PDF
     */
    extractFromFile(pdfPath: string, paperId: string, paperTitle: string, outputDir: string): Promise<PDFExtractionResult>;
    /**
     * 从 Buffer 提取 PDF
     */
    extractFromBuffer(pdfBuffer: Buffer, paperId: string, paperTitle: string, outputDir: string): Promise<PDFExtractionResult>;
    /**
     * 从 URL 下载并提取 PDF
     */
    extractFromUrl(pdfUrl: string, paperId: string, paperTitle: string, outputDir: string): Promise<PDFExtractionResult>;
}
export declare function initializePDFExtractor(options?: Partial<ExtractionOptions>): PDFExtractor;
export declare function getPDFExtractor(): PDFExtractor;
//# sourceMappingURL=pdf-extractor-impl.d.ts.map