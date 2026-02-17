import { z } from 'zod';

// Enums for categorization
export const ThreatLevel = z.enum(['critical', 'high', 'medium', 'low']);
export type ThreatLevel = z.infer<typeof ThreatLevel>;

export const ProductArea = z.enum([
  'core',
  'integrations',
  'pricing',
  'marketing',
  'infrastructure',
  'security',
  'ux',
  'mobile',
  'api',
  'other'
]);
export type ProductArea = z.infer<typeof ProductArea>;

export const ContentType = z.enum([
  'blog_post',
  'release_notes',
  'news_article',
  'press_release',
  'social_media',
  'documentation'
]);
export type ContentType = z.infer<typeof ContentType>;

// Competitor content schema
export const CompetitorContentSchema = z.object({
  id: z.string(),
  competitor: z.string(),
  title: z.string(),
  url: z.string().url(),
  content: z.string(),
  contentType: ContentType,
  publishedAt: z.date(),
  ingestedAt: z.date(),
  metadata: z.record(z.any()).optional(),
});
export type CompetitorContent = z.infer<typeof CompetitorContentSchema>;

// Analysis result schema
export const AnalysisResultSchema = z.object({
  contentId: z.string(),
  summary: z.string().describe('Concise summary of the content in 2-3 sentences'),
  keyInsights: z.array(z.string()).describe('List of key insights or findings'),
  positioningChanges: z.array(z.string()).describe('Any changes in market positioning or messaging'),
  newFeatures: z.array(z.object({
    name: z.string(),
    description: z.string(),
    impact: z.string()
  })).default([]).describe('New features or capabilities announced'),
  threatLevel: ThreatLevel.describe('Competitive threat level assessment'),
  productAreas: z.array(ProductArea).describe('Product areas affected by this content'),
  competitiveImplications: z.string().describe('What this means for our competitive position'),
  recommendedActions: z.array(z.string()).describe('Suggested actions or responses'),
  analyzedAt: z.date(),
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

// Digest entry schema
export const DigestEntrySchema = z.object({
  competitor: z.string(),
  content: CompetitorContentSchema,
  analysis: AnalysisResultSchema,
});
export type DigestEntry = z.infer<typeof DigestEntrySchema>;

// Weekly digest schema
export const WeeklyDigestSchema = z.object({
  weekStartDate: z.date(),
  weekEndDate: z.date(),
  generatedAt: z.date(),
  entries: z.array(DigestEntrySchema),
  executiveSummary: z.string().describe('High-level overview of the week'),
  criticalThreats: z.array(DigestEntrySchema),
  topTrends: z.array(z.string()),
  productAreaBreakdown: z.record(z.array(DigestEntrySchema)),
});
export type WeeklyDigest = z.infer<typeof WeeklyDigestSchema>;

// Competitor configuration
export const CompetitorConfigSchema = z.object({
  name: z.string(),
  feedUrls: z.array(z.string().url()),
  blogUrl: z.string().url().optional(),
  releaseNotesUrl: z.string().url().optional(),
  websiteUrl: z.string().url().optional(),
  enabled: z.boolean().default(true),
});
export type CompetitorConfig = z.infer<typeof CompetitorConfigSchema>;

// Company profile schema
export const CompanyProfileSchema = z.object({
  name: z.string().min(1, 'Company name is required'),
  description: z.string().optional(),
  products: z.array(z.string()).optional(),
  targetMarket: z.string().optional(),
  differentiators: z.array(z.string()).optional(),
});
export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;

// System configuration
export interface Config {
  competitors: CompetitorConfig[];
  myCompany?: CompanyProfile;
  dataDir: string;
  model: string;
  temperature: number;
  maxTokens: number;
  digestFrequency: 'daily' | 'weekly' | 'monthly';
  digestOutputDir?: string;
}
