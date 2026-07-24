import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import {
    DICTIONARY_TEMPLATE_FILENAME,
    DICTIONARY_TEMPLATE_HEADERS,
} from '../src/lib/dictionary-template';

const outputDir = path.join(process.cwd(), 'public', 'templates');
const outputPath = path.join(outputDir, 'deeptrans-dictionary-template.xlsx');

const termsSheet = XLSX.utils.aoa_to_sheet([[...DICTIONARY_TEMPLATE_HEADERS]]);
termsSheet['!cols'] = [{ wch: 24 }, { wch: 24 }, { wch: 26 }];

const instructionsSheet = XLSX.utils.aoa_to_sheet([
    ['DeepTrans 词库模板 / Dictionary Template'],
    [],
    ['列名 / Column', '填写规则与示例 / Rules and example'],
    ['source', '必填；原文术语，每行一个。示例：governing law\nRequired; one source term per row.'],
    ['target', '必填；对应的标准译文。示例：准据法\nRequired; approved target translation.'],
    ['notes', '可选；领域、语境或限制。示例：法律合同\nOptional; domain, context, or restrictions.'],
    [],
    ['步骤 / Step', '操作 / Action'],
    ['1', '保持第一个工作表“词条”的表头不变。\nKeep the headers in the first sheet unchanged.'],
    ['2', '从第 2 行开始填写；source 和 target 不能为空。\nFill from row 2; source and target are required.'],
    ['3', '回到 DeepTrans，选择导入私有词库或项目词库。\nImport it as a private or project dictionary.'],
    [],
    ['提示 / Tip', '只读取第一个工作表；请勿合并单元格，一行一个词条。\nOnly the first sheet is read; do not merge cells.'],
]);
instructionsSheet['!cols'] = [{ wch: 18 }, { wch: 42 }];

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, termsSheet, '词条');
XLSX.utils.book_append_sheet(workbook, instructionsSheet, '填写说明');
workbook.Props = {
    Title: DICTIONARY_TEMPLATE_FILENAME,
    Subject: 'DeepTrans bilingual dictionary import template',
    Author: 'DeepTrans Studio',
    Company: 'DeepTrans Studio',
};

fs.mkdirSync(outputDir, { recursive: true });
XLSX.writeFile(workbook, outputPath, { compression: true });
console.log(outputPath);
