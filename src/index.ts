// Main exports for the Rival library

export { RSSFetcher } from './ingestion/rss-fetcher.js';
export { WebScraper } from './ingestion/web-scraper.js';
export type { ScrapeConfig } from './ingestion/web-scraper.js';

export { CompetitiveAnalyzer } from './analysis/analyzer.js';
export type { AnalyzerConfig } from './analysis/analyzer.js';

export { FileStorage } from './storage/file-storage.js';

export { DigestGenerator } from './digest/digest-generator.js';

export {
  type CompetitorContent,
  type AnalysisResult,
  type DigestEntry,
  type WeeklyDigest,
  type CompetitorConfig,
  type Config,
  type ThreatLevel,
  type ProductArea,
  type ContentType,
  CompetitorContentSchema,
  AnalysisResultSchema,
  DigestEntrySchema,
  WeeklyDigestSchema,
  CompetitorConfigSchema,
  ThreatLevel as ThreatLevelEnum,
  ProductArea as ProductAreaEnum,
  ContentType as ContentTypeEnum,
} from './types/index.js';

export { loadConfig, validateConfig } from './utils/config.js';
export { generateId, sleep, formatDate, chunk, deduplicateByUrl, truncateText } from './utils/helpers.js';
