import { startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { CompetitorContent, AnalysisResult, DigestEntry, WeeklyDigest, ProductArea } from '../types/index.js';
import { FileStorage } from '../storage/file-storage.js';
import { CompetitiveAnalyzer } from '../analysis/analyzer.js';
import { CancellationToken } from '../utils/cancellation.js';

export class DigestGenerator {
  constructor(
    private storage: FileStorage,
    private analyzer: CompetitiveAnalyzer,
    private cancellationToken?: CancellationToken
  ) {}

  async generateWeeklyDigest(weekOffset: number = 0): Promise<WeeklyDigest> {
    // Check for cancellation at the start
    this.cancellationToken?.throwIfCancelled();

    // Calculate date range
    const referenceDate = subWeeks(new Date(), weekOffset);
    const weekStartDate = startOfWeek(referenceDate, { weekStartsOn: 1 }); // Monday
    const weekEndDate = endOfWeek(referenceDate, { weekStartsOn: 1 }); // Sunday

    return this.generateDigestForDateRange(weekStartDate, weekEndDate);
  }

  async generateCustomDigest(startDate: Date, endDate: Date): Promise<WeeklyDigest> {
    return this.generateDigestForDateRange(startDate, endDate);
  }

  private async generateDigestForDateRange(weekStartDate: Date, weekEndDate: Date): Promise<WeeklyDigest> {
    // Check for cancellation at the start
    this.cancellationToken?.throwIfCancelled();

    console.log(`Generating digest for week: ${weekStartDate.toISOString().split('T')[0]} to ${weekEndDate.toISOString().split('T')[0]}`);

    // Load content for the week
    const contents = await this.storage.loadContentByDateRange(
      weekStartDate,
      weekEndDate
    );

    console.log(`Found ${contents.length} content items for the week`);

    if (contents.length === 0) {
      return this.createEmptyDigest(weekStartDate, weekEndDate);
    }

    // Check for cancellation before processing
    this.cancellationToken?.throwIfCancelled();

    // Load or generate analyses
    const entries = await this.createDigestEntries(contents);

    // Sort by threat level
    const sortedEntries = this.sortByThreatLevel(entries);

    // Extract critical threats
    const criticalThreats = sortedEntries.filter(
      e => e.analysis.threatLevel === 'critical'
    );

    // Identify top trends
    const topTrends = this.extractTopTrends(entries);

    // Group by product area
    const productAreaBreakdown = this.groupByProductArea(sortedEntries);

    // Check for cancellation before final AI call
    this.cancellationToken?.throwIfCancelled();

    // Generate executive summary
    const executiveSummary = await this.analyzer.generateExecutiveSummary(
      entries.map(e => e.analysis),
      weekStartDate,
      weekEndDate
    );

    const digest: WeeklyDigest = {
      weekStartDate,
      weekEndDate,
      generatedAt: new Date(),
      entries: sortedEntries,
      executiveSummary,
      criticalThreats,
      topTrends,
      productAreaBreakdown,
    };

    // Save digest
    await this.storage.saveDigest(digest);

    return digest;
  }

  private async createDigestEntries(
    contents: CompetitorContent[]
  ): Promise<DigestEntry[]> {
    const entries: DigestEntry[] = [];

    for (const content of contents) {
      // Check for cancellation before each content item
      this.cancellationToken?.throwIfCancelled();

      // Try to load existing analysis
      let analysis = await this.storage.loadAnalysis(content.id);

      // If no analysis exists, generate one
      if (!analysis) {
        console.log(`Analyzing content: ${content.title}`);
        try {
          // Check for cancellation before expensive AI call
          this.cancellationToken?.throwIfCancelled();

          analysis = await this.analyzer.analyzeContent(content);
          await this.storage.saveAnalysis(analysis);
        } catch (error) {
          console.error(`Failed to analyze content ${content.id}:`, error);
          continue;
        }
      }

      entries.push({
        competitor: content.competitor,
        content,
        analysis,
      });
    }

    return entries;
  }

  private sortByThreatLevel(entries: DigestEntry[]): DigestEntry[] {
    const threatOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return [...entries].sort((a, b) => {
      const orderDiff = threatOrder[a.analysis.threatLevel] - threatOrder[b.analysis.threatLevel];
      if (orderDiff !== 0) return orderDiff;
      // Secondary sort by date (newest first)
      return b.content.publishedAt.getTime() - a.content.publishedAt.getTime();
    });
  }

  private extractTopTrends(entries: DigestEntry[]): string[] {
    // Collect all insights and features
    const insights = entries.flatMap(e => e.analysis.keyInsights);
    const positioningChanges = entries.flatMap(e => e.analysis.positioningChanges);
    const features = entries.flatMap(e => e.analysis.newFeatures.map(f => f.name));

    // Count frequency of similar topics (simplified approach)
    const trends = new Map<string, number>();

    // Extract key themes from positioning changes
    for (const change of positioningChanges) {
      const key = change.toLowerCase();
      trends.set(key, (trends.get(key) || 0) + 2); // Weight positioning changes higher
    }

    // Count feature categories
    const featureCategories = new Map<string, number>();
    for (const feature of features) {
      const category = this.categorizeFeature(feature);
      featureCategories.set(category, (featureCategories.get(category) || 0) + 1);
    }

    // Build trend statements
    const trendStatements: string[] = [];

    // Add positioning trends
    const topPositioning = [...trends.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    for (const [change, count] of topPositioning) {
      if (count >= 2) {
        trendStatements.push(`${count} competitors showing: ${change}`);
      }
    }

    // Add feature category trends
    const topCategories = [...featureCategories.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    for (const [category, count] of topCategories) {
      if (count >= 2) {
        trendStatements.push(`${count} new features in ${category}`);
      }
    }

    // If no clear trends, provide high-level summary
    if (trendStatements.length === 0) {
      const highThreatCount = entries.filter(e =>
        e.analysis.threatLevel === 'high' || e.analysis.threatLevel === 'critical'
      ).length;

      if (highThreatCount > 0) {
        trendStatements.push(`${highThreatCount} high-priority competitive moves this week`);
      } else {
        trendStatements.push('Quiet week with mostly incremental updates');
      }
    }

    return trendStatements.slice(0, 5);
  }

  private categorizeFeature(featureName: string): string {
    const lower = featureName.toLowerCase();

    if (lower.includes('ai') || lower.includes('ml') || lower.includes('intelligence')) {
      return 'AI/ML capabilities';
    }
    if (lower.includes('integration') || lower.includes('connect')) {
      return 'integrations';
    }
    if (lower.includes('mobile') || lower.includes('ios') || lower.includes('android')) {
      return 'mobile features';
    }
    if (lower.includes('security') || lower.includes('auth') || lower.includes('encrypt')) {
      return 'security';
    }
    if (lower.includes('api') || lower.includes('webhook')) {
      return 'API/developer tools';
    }
    if (lower.includes('analytics') || lower.includes('report') || lower.includes('dashboard')) {
      return 'analytics';
    }
    if (lower.includes('collaborate') || lower.includes('team') || lower.includes('share')) {
      return 'collaboration';
    }

    return 'product enhancements';
  }

  private groupByProductArea(entries: DigestEntry[]): Record<string, DigestEntry[]> {
    const grouped: Record<string, DigestEntry[]> = {};

    // Initialize all product areas
    const allAreas: ProductArea[] = ['core', 'integrations', 'pricing', 'marketing', 'infrastructure', 'security', 'ux', 'mobile', 'api', 'other'];
    for (const area of allAreas) {
      grouped[area] = [];
    }

    // Group entries
    for (const entry of entries) {
      for (const area of entry.analysis.productAreas) {
        grouped[area].push(entry);
      }
    }

    return grouped;
  }

  private createEmptyDigest(weekStartDate: Date, weekEndDate: Date): WeeklyDigest {
    return {
      weekStartDate,
      weekEndDate,
      generatedAt: new Date(),
      entries: [],
      executiveSummary: 'No competitive activity detected this week.',
      criticalThreats: [],
      topTrends: ['Quiet week - no significant updates'],
      productAreaBreakdown: {},
    };
  }

  async generateDigestSummary(digest: WeeklyDigest): Promise<string> {
    const summary: string[] = [];

    summary.push(`📊 Competitive Digest Summary`);
    summary.push(`Week: ${digest.weekStartDate.toISOString().split('T')[0]} to ${digest.weekEndDate.toISOString().split('T')[0]}`);
    summary.push('');

    summary.push(`📈 Overview:`);
    summary.push(`- Total updates: ${digest.entries.length}`);
    summary.push(`- Critical threats: ${digest.criticalThreats.length}`);
    summary.push(`- High threats: ${digest.entries.filter(e => e.analysis.threatLevel === 'high').length}`);
    summary.push('');

    if (digest.topTrends.length > 0) {
      summary.push(`🔥 Top Trends:`);
      digest.topTrends.forEach((trend, i) => {
        summary.push(`${i + 1}. ${trend}`);
      });
      summary.push('');
    }

    if (digest.criticalThreats.length > 0) {
      summary.push(`🚨 Critical Threats:`);
      digest.criticalThreats.forEach(entry => {
        summary.push(`- ${entry.competitor}: ${entry.content.title}`);
      });
      summary.push('');
    }

    summary.push(`📋 Product Area Activity:`);
    for (const [area, entries] of Object.entries(digest.productAreaBreakdown)) {
      if (entries.length > 0) {
        summary.push(`- ${area}: ${entries.length} updates`);
      }
    }

    return summary.join('\n');
  }
}
