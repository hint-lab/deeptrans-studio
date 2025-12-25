// Preprocess Agents - 预处理智能体
export { DocumentTermExtractAgent } from './preprocess/DocumentTermExtractAgent';
export {
    DocumentTermTranslateAgent,
    type DocumentTermTranslateInput,
    type DocumentTermTranslateItem,
} from './preprocess/DocumentTermTranslateAgent';
export { MonoTermExtractAgent } from './pre-translate/MonoTermExtractAgent';
export { DictLookupAgent } from './pre-translate/DictLookupAgent';
export { TermEmbedTranslateAgent } from './pre-translate/TermEmbedTranslateAgent';
export { SyntaxMarkerExtractAgent } from './qa/SyntaxMarkerExtractAgent';
export { SyntaxEvaluateAgent } from './qa/SyntaxEvaluateAgent';
export { SyntaxAdviceEmbedAgent } from './qa/SyntaxAdviceEmbedAgent';

// 未来可以添加更多预处理智能体：
// - DocumentClassifyAgent (文档分类)
// - LanguageDetectAgent (语言检测)
// - TextSegmentAgent (文本分段)
// - MetadataExtractAgent (元数据提取)
// - QualityAssessAgent (质量初评)
// - ComplexityAnalyzeAgent (复杂度分析)
