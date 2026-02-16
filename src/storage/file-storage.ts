import { promises as fs } from 'fs';
import path from 'path';
import { CompetitorContent, AnalysisResult, DigestEntry, WeeklyDigest } from '../types/index.js';

export class FileStorage {
  private dataDir: string;

  constructor(dataDir: string = './data') {
    this.dataDir = dataDir;
  }

  async initialize(): Promise<void> {
    const dirs = [
      this.dataDir,
      path.join(this.dataDir, 'content'),
      path.join(this.dataDir, 'analysis'),
      path.join(this.dataDir, 'digests'),
      path.join(this.dataDir, 'digests', 'weekly'),
      path.join(this.dataDir, 'digests', 'marketing'),
      path.join(this.dataDir, 'digests', 'sales'),
      path.join(this.dataDir, 'digests', 'product'),
      path.join(this.dataDir, 'archive')
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  // Content storage
  async saveContent(content: CompetitorContent): Promise<void> {
    const filePath = path.join(
      this.dataDir,
      'content',
      `${content.competitor}_${content.id}.json`
    );
    await fs.writeFile(filePath, JSON.stringify(content, null, 2), 'utf-8');
  }

  async saveMultipleContents(contents: CompetitorContent[]): Promise<void> {
    await Promise.all(contents.map(c => this.saveContent(c)));
  }

  async loadContent(contentId: string): Promise<CompetitorContent | null> {
    try {
      const files = await fs.readdir(path.join(this.dataDir, 'content'));
      const file = files.find(f => f.includes(contentId));
      if (!file) return null;

      const filePath = path.join(this.dataDir, 'content', file);
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data, this.dateReviver);
    } catch {
      return null;
    }
  }

  async loadAllContent(): Promise<CompetitorContent[]> {
    try {
      const files = await fs.readdir(path.join(this.dataDir, 'content'));
      const contents = await Promise.all(
        files
          .filter(f => f.endsWith('.json'))
          .map(async f => {
            const data = await fs.readFile(
              path.join(this.dataDir, 'content', f),
              'utf-8'
            );
            return JSON.parse(data, this.dateReviver);
          })
      );
      return contents;
    } catch {
      return [];
    }
  }

  async loadContentByDateRange(
    startDate: Date,
    endDate: Date
  ): Promise<CompetitorContent[]> {
    const allContent = await this.loadAllContent();
    return allContent.filter(
      c => c.publishedAt >= startDate && c.publishedAt <= endDate
    );
  }

  async loadContentByCompetitor(competitor: string): Promise<CompetitorContent[]> {
    const allContent = await this.loadAllContent();
    return allContent.filter(c => c.competitor === competitor);
  }

  async contentExists(contentId: string): Promise<boolean> {
    try {
      const files = await fs.readdir(path.join(this.dataDir, 'content'));
      return files.some(f => f.includes(contentId));
    } catch {
      return false;
    }
  }

  // Analysis storage
  async saveAnalysis(analysis: AnalysisResult): Promise<void> {
    const filePath = path.join(
      this.dataDir,
      'analysis',
      `analysis_${analysis.contentId}.json`
    );
    await fs.writeFile(filePath, JSON.stringify(analysis, null, 2), 'utf-8');
  }

  async saveMultipleAnalyses(analyses: AnalysisResult[]): Promise<void> {
    await Promise.all(analyses.map(a => this.saveAnalysis(a)));
  }

  async analysisExists(contentId: string): Promise<boolean> {
    try {
      const filePath = path.join(
        this.dataDir,
        'analysis',
        `analysis_${contentId}.json`
      );
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async loadAnalysis(contentId: string): Promise<AnalysisResult | null> {
    try {
      const filePath = path.join(this.dataDir, 'analysis', `analysis_${contentId}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data, this.dateReviver);
    } catch {
      return null;
    }
  }

  async loadAllAnalyses(): Promise<AnalysisResult[]> {
    try {
      const files = await fs.readdir(path.join(this.dataDir, 'analysis'));
      const analyses = await Promise.all(
        files
          .filter(f => f.endsWith('.json'))
          .map(async f => {
            const data = await fs.readFile(
              path.join(this.dataDir, 'analysis', f),
              'utf-8'
            );
            return JSON.parse(data, this.dateReviver);
          })
      );
      return analyses;
    } catch {
      return [];
    }
  }

  // Digest storage
  async saveDigest(digest: WeeklyDigest): Promise<void> {
    const dateStr = digest.weekStartDate.toISOString().split('T')[0];
    const filePath = path.join(
      this.dataDir,
      'digests',
      'weekly',
      `digest_${dateStr}.json`
    );
    await fs.writeFile(filePath, JSON.stringify(digest, null, 2), 'utf-8');
  }

  async loadDigest(weekStartDate: Date): Promise<WeeklyDigest | null> {
    try {
      const dateStr = weekStartDate.toISOString().split('T')[0];
      const filePath = path.join(this.dataDir, 'digests', 'weekly', `digest_${dateStr}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data, this.dateReviver);
    } catch {
      return null;
    }
  }

  async loadAllDigests(): Promise<WeeklyDigest[]> {
    try {
      const files = await fs.readdir(path.join(this.dataDir, 'digests', 'weekly'));
      const digests = await Promise.all(
        files
          .filter(f => f.endsWith('.json'))
          .map(async f => {
            const data = await fs.readFile(
              path.join(this.dataDir, 'digests', 'weekly', f),
              'utf-8'
            );
            return JSON.parse(data, this.dateReviver);
          })
      );
      return digests.sort((a, b) =>
        b.weekStartDate.getTime() - a.weekStartDate.getTime()
      );
    } catch {
      return [];
    }
  }

  // Export digest to markdown
  async exportDigestToMarkdown(digest: WeeklyDigest): Promise<{ markdown: string; filePath: string }> {
    const md: string[] = [];

    md.push(`# Competitive Intelligence Digest`);
    md.push(`## Week of ${this.formatDate(digest.weekStartDate)} - ${this.formatDate(digest.weekEndDate)}`);
    md.push(`*Generated: ${this.formatDate(digest.generatedAt)}*\n`);

    md.push(`## Executive Summary\n`);
    md.push(digest.executiveSummary);
    md.push('');

    // Critical threats
    if (digest.criticalThreats.length > 0) {
      md.push(`## 🚨 Critical Threats (${digest.criticalThreats.length})\n`);
      for (const entry of digest.criticalThreats) {
        md.push(this.formatDigestEntry(entry));
      }
    }

    // Top trends
    if (digest.topTrends.length > 0) {
      md.push(`## 📈 Top Trends\n`);
      digest.topTrends.forEach((trend, i) => {
        md.push(`${i + 1}. ${trend}`);
      });
      md.push('');
    }

    // Product area breakdown
    md.push(`## 📊 Product Area Breakdown\n`);
    for (const [area, entries] of Object.entries(digest.productAreaBreakdown)) {
      if (entries.length > 0) {
        md.push(`### ${area.toUpperCase()} (${entries.length} items)\n`);
        for (const entry of entries) {
          md.push(this.formatDigestEntry(entry));
        }
      }
    }

    // All entries by competitor
    md.push(`## 📋 All Updates by Competitor\n`);
    const byCompetitor = new Map<string, DigestEntry[]>();
    for (const entry of digest.entries) {
      const existing = byCompetitor.get(entry.competitor) || [];
      existing.push(entry);
      byCompetitor.set(entry.competitor, existing);
    }

    for (const [competitor, entries] of byCompetitor) {
      md.push(`### ${competitor} (${entries.length} items)\n`);
      for (const entry of entries) {
        md.push(this.formatDigestEntry(entry));
      }
    }

    const markdown = md.join('\n');
    const dateStr = digest.weekStartDate.toISOString().split('T')[0];

    // Get digest output directory from environment variable or default to exports folder
    let digestOutputDir = process.env.DIGEST_OUTPUT_DIR;

    // Expand ~ to home directory
    if (digestOutputDir?.startsWith('~/')) {
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      digestOutputDir = path.join(homeDir!, digestOutputDir.substring(2));
    } else if (!digestOutputDir) {
      // Default to exports folder in repo root
      digestOutputDir = path.join(process.cwd(), 'exports');
    }

    // Ensure the directory exists
    await fs.mkdir(digestOutputDir, { recursive: true });

    const outputPath = path.join(digestOutputDir, `digest_${dateStr}.md`);
    await fs.writeFile(outputPath, markdown, 'utf-8');

    // Also save to the data directory for internal use
    const dataPath = path.join(this.dataDir, 'digests', 'weekly', `digest_${dateStr}.md`);
    await fs.mkdir(path.dirname(dataPath), { recursive: true });
    await fs.writeFile(dataPath, markdown, 'utf-8');

    console.log(`✓ Digest saved to: ${outputPath}`);

    return { markdown, filePath: outputPath };
  }

  private formatDigestEntry(entry: DigestEntry): string {
    const lines: string[] = [];
    const threat = this.getThreatEmoji(entry.analysis.threatLevel);

    lines.push(`#### ${threat} [${entry.content.title}](${entry.content.url})`);
    lines.push(`*${entry.competitor} • ${this.formatDate(entry.content.publishedAt)} • Threat: ${entry.analysis.threatLevel.toUpperCase()}*\n`);
    lines.push(`**Summary:** ${entry.analysis.summary}\n`);

    if (entry.analysis.newFeatures.length > 0) {
      lines.push(`**New Features:**`);
      entry.analysis.newFeatures.forEach(f => {
        lines.push(`- **${f.name}**: ${f.description} (${f.impact})`);
      });
      lines.push('');
    }

    if (entry.analysis.keyInsights.length > 0) {
      lines.push(`**Key Insights:**`);
      entry.analysis.keyInsights.forEach(insight => {
        lines.push(`- ${insight}`);
      });
      lines.push('');
    }

    lines.push(`**Product Areas:** ${entry.analysis.productAreas.join(', ')}`);
    lines.push(`**Implications:** ${entry.analysis.competitiveImplications}\n`);

    if (entry.analysis.recommendedActions.length > 0) {
      lines.push(`**Recommended Actions:**`);
      entry.analysis.recommendedActions.forEach(action => {
        lines.push(`- ${action}`);
      });
      lines.push('');
    }

    lines.push('---\n');
    return lines.join('\n');
  }

  private getThreatEmoji(level: string): string {
    switch (level) {
      case 'critical': return '🔴';
      case 'high': return '🟠';
      case 'medium': return '🟡';
      case 'low': return '🟢';
      default: return '⚪';
    }
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private dateReviver(key: string, value: any): any {
    const dateFields = ['publishedAt', 'ingestedAt', 'analyzedAt', 'generatedAt', 'weekStartDate', 'weekEndDate'];
    if (dateFields.includes(key) && typeof value === 'string') {
      return new Date(value);
    }
    return value;
  }

  // Generic save methods for team digests
  async saveJSON(filePath: string, data: any): Promise<void> {
    const fullPath = path.join(filePath);
    await fs.writeFile(fullPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async saveMarkdown(filePath: string, content: string): Promise<void> {
    const fullPath = path.join(filePath);
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  // Cleanup old data
  async archiveOldContent(olderThanDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const allContent = await this.loadAllContent();
    const toArchive = allContent.filter(c => c.ingestedAt < cutoffDate);

    for (const content of toArchive) {
      const oldPath = path.join(this.dataDir, 'content', `${content.competitor}_${content.id}.json`);
      const newPath = path.join(this.dataDir, 'archive', `${content.competitor}_${content.id}.json`);
      await fs.rename(oldPath, newPath);
    }

    return toArchive.length;
  }
}
