"use strict";
/**
 * PDF 提取器实现
 * 调用 Python 脚本进行实际的 PDF 提取
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PDFExtractor = void 0;
exports.extractPDFWithPython = extractPDFWithPython;
exports.initializePDFExtractor = initializePDFExtractor;
exports.getPDFExtractor = getPDFExtractor;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const logger_1 = require("../src/utils/logger");
const DEFAULT_OPTIONS = {
    extractFigures: true,
    extractTables: true,
    extractFormulas: true,
    extractText: true,
    figureMinSize: { width: 100, height: 100 },
    tableMinRows: 2
};
/**
 * 使用 Python 脚本提取 PDF
 */
async function extractPDFWithPython(pdfPath, outputDir, paperId, paperTitle) {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'pdf_extract.py');
    // 检查 Python 脚本是否存在
    if (!fs.existsSync(scriptPath)) {
        throw new Error(`Python script not found: ${scriptPath}`);
    }
    // 检查 PDF 是否存在
    if (!fs.existsSync(pdfPath)) {
        throw new Error(`PDF file not found: ${pdfPath}`);
    }
    return new Promise((resolve, reject) => {
        const pythonProcess = (0, child_process_1.spawn)('python', [
            scriptPath,
            pdfPath,
            outputDir,
            paperId,
            paperTitle
        ]);
        let stdout = '';
        let stderr = '';
        pythonProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        pythonProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                logger_1.logger.error('PDF extraction failed', { code, stderr });
                reject(new Error(`PDF extraction failed: ${stderr}`));
                return;
            }
            try {
                const result = JSON.parse(stdout);
                if (result.error) {
                    reject(new Error(result.error));
                    return;
                }
                // 转换结果为标准格式
                const extractionResult = {
                    paperId: result.paperId,
                    paperTitle: result.paperTitle,
                    pageCount: result.pageCount,
                    coverPath: result.coverPath,
                    abstract: result.abstract,
                    fullText: result.fullText,
                    pages: result.pages || [],
                    figures: (result.figures || []).map((fig, index) => ({
                        id: fig.id,
                        number: index + 1,
                        caption: `图 ${index + 1}`,
                        page: fig.page,
                        imagePath: fig.path,
                        width: fig.width,
                        height: fig.height,
                        bbox: fig.bbox
                    })),
                    tables: (result.tables || []).map((table, index) => ({
                        id: table.id,
                        number: index + 1,
                        caption: `表 ${index + 1}`,
                        page: table.page,
                        headers: [],
                        rows: [],
                        rawText: table.text,
                        bbox: table.bbox
                    })),
                    formulas: (result.formulas || []).map((formula) => ({
                        id: formula.id,
                        number: formula.id.split('_').pop() || '1',
                        latex: formula.latex,
                        rawText: formula.raw,
                        page: formula.page,
                        type: formula.type
                    })),
                    metadata: result.metadata
                };
                logger_1.logger.info('PDF extraction completed', {
                    paperId,
                    pageCount: extractionResult.pageCount,
                    figureCount: extractionResult.figures.length,
                    tableCount: extractionResult.tables.length,
                    formulaCount: extractionResult.formulas.length
                });
                resolve(extractionResult);
            }
            catch (error) {
                logger_1.logger.error('Failed to parse extraction result', { error, stdout });
                reject(new Error(`Failed to parse extraction result: ${error}`));
            }
        });
        pythonProcess.on('error', (error) => {
            logger_1.logger.error('Failed to start Python process', { error });
            reject(new Error(`Failed to start Python process: ${error.message}`));
        });
    });
}
/**
 * PDF 提取器类
 */
class PDFExtractor {
    options;
    constructor(options = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }
    /**
     * 从文件路径提取 PDF
     */
    async extractFromFile(pdfPath, paperId, paperTitle, outputDir) {
        return extractPDFWithPython(pdfPath, outputDir, paperId, paperTitle);
    }
    /**
     * 从 Buffer 提取 PDF
     */
    async extractFromBuffer(pdfBuffer, paperId, paperTitle, outputDir) {
        // 保存临时文件
        const tempPath = path.join(outputDir, `${paperId}_temp.pdf`);
        fs.writeFileSync(tempPath, pdfBuffer);
        try {
            const result = await this.extractFromFile(tempPath, paperId, paperTitle, outputDir);
            return result;
        }
        finally {
            // 清理临时文件
            if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
            }
        }
    }
    /**
     * 从 URL 下载并提取 PDF
     */
    async extractFromUrl(pdfUrl, paperId, paperTitle, outputDir) {
        // 下载 PDF
        const response = await fetch(pdfUrl);
        if (!response.ok) {
            throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`);
        }
        const pdfBuffer = Buffer.from(await response.arrayBuffer());
        return this.extractFromBuffer(pdfBuffer, paperId, paperTitle, outputDir);
    }
}
exports.PDFExtractor = PDFExtractor;
// 导出单例实例
let globalExtractor = null;
function initializePDFExtractor(options) {
    globalExtractor = new PDFExtractor(options);
    return globalExtractor;
}
function getPDFExtractor() {
    if (!globalExtractor) {
        globalExtractor = new PDFExtractor();
    }
    return globalExtractor;
}
//# sourceMappingURL=pdf-extractor-impl.js.map