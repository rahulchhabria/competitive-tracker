import { addWeeks, startOfWeek, endOfWeek, format } from 'date-fns';
import { CompetitiveAnalyzer } from '../analysis/analyzer.js';
import { FileStorage } from '../storage/file-storage.js';
import { AnalysisResult, DigestEntry } from '../types/index.js';
import { CancellationToken } from '../utils/cancellation.js';

interface TeamDigest {
  team: string;
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  summary: string;
  priorities: ActionItem[];
  insights: TeamInsight[];
}

interface ActionItem {
  priority: 'urgent' | 'high' | 'medium';
  title: string;
  description: string;
  rationale: string;
  estimatedEffort?: string;
  deadline?: string;
}

interface TeamInsight {
  competitor: string;
  title: string;
  whatTheyDid: string;
  whyItMatters: string;
  ourResponse: string;
  metrics?: string[];
}

export class TeamDigestGenerator {
  constructor(
    private storage: FileStorage,
    private analyzer: CompetitiveAnalyzer,
    private cancellationToken?: CancellationToken
  ) {}

  async generateTeamDigests(weekOffset: number = 0): Promise<void> {
    // Check for cancellation at the start
    this.cancellationToken?.throwIfCancelled();

    const now = new Date();
    const weekStart = startOfWeek(addWeeks(now, weekOffset), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

    console.log(`Generating team digests for: ${format(weekStart, 'yyyy-MM-dd')} to ${format(weekEnd, 'yyyy-MM-dd')}`);

    // Load all analyses
    const allContent = await this.storage.loadAllContent();
    const analyses: AnalysisResult[] = [];

    for (const content of allContent) {
      if (content.publishedAt >= weekStart && content.publishedAt <= weekEnd) {
        const analysis = await this.storage.loadAnalysis(content.id);
        if (analysis) {
          analyses.push(analysis);
        }
      }
    }

    if (analyses.length === 0) {
      console.log('No analyses found for this week');
      return;
    }

    // Check for cancellation before processing teams
    this.cancellationToken?.throwIfCancelled();

    // Generate digests for each team
    const teams = ['marketing', 'sales', 'product'];

    for (const team of teams) {
      // Check for cancellation before each team
      this.cancellationToken?.throwIfCancelled();

      console.log(`\nGenerating ${team} digest...`);
      const digest = await this.generateTeamDigest(team, analyses, weekStart, weekEnd);

      // Save JSON
      const jsonPath = `data/digests/${team}/digest_${format(weekStart, 'yyyy-MM-dd')}.json`;
      await this.storage.saveJSON(jsonPath, digest);

      // Generate markdown
      const markdown = this.generateTeamMarkdown(digest);
      const mdPath = `data/digests/${team}/digest_${format(weekStart, 'yyyy-MM-dd')}.md`;
      await this.storage.saveMarkdown(mdPath, markdown);

      console.log(`✅ ${team} digest saved to ${mdPath}`);
    }
  }

  private async generateTeamDigest(
    team: string,
    analyses: AnalysisResult[],
    weekStart: Date,
    weekEnd: Date
  ): Promise<TeamDigest> {
    const allContent = await this.storage.loadAllContent();
    const entries: DigestEntry[] = analyses.map(analysis => {
      const content = allContent.find(c => c.id === analysis.contentId)!;
      return {
        competitor: content.competitor,
        content,
        analysis
      };
    });

    switch (team) {
      case 'marketing':
        return this.generateMarketingDigest(entries, weekStart, weekEnd);
      case 'sales':
        return this.generateSalesDigest(entries, weekStart, weekEnd);
      case 'product':
        return this.generateProductDigest(entries, weekStart, weekEnd);
      default:
        throw new Error(`Unknown team: ${team}`);
    }
  }

  private async generateMarketingDigest(
    entries: DigestEntry[],
    weekStart: Date,
    weekEnd: Date
  ): Promise<TeamDigest> {
    // Filter for marketing-relevant items
    const marketingRelevant = entries.filter(e =>
      e.analysis.productAreas.includes('marketing') ||
      e.analysis.productAreas.includes('pricing') ||
      e.analysis.threatLevel === 'critical' ||
      e.analysis.threatLevel === 'high'
    );

    // Ensure balanced representation across competitors
    const balancedSelection = this.selectBalancedItems(marketingRelevant, 15);

    const prompt = `You are a marketing strategist advising Sentry (error monitoring and performance monitoring platform) on how to respond to competitive moves.

Analyze these ${balancedSelection.length} competitive updates and provide strategic marketing advice for Sentry.

COMPETITIVE UPDATES:
${balancedSelection.map(e => `
Competitor: ${e.competitor}
Title: ${e.content.title}
Threat: ${e.analysis.threatLevel}
Summary: ${e.analysis.summary}
Key Insights: ${e.analysis.keyInsights.join('; ')}
Positioning Changes: ${e.analysis.positioningChanges.join('; ')}
`).join('\n---\n')}

Create a marketing digest with strategic advice for Sentry:

1. EXECUTIVE SUMMARY (2-3 sentences): What happened in the competitive landscape this week and what it means for Sentry's marketing strategy

2. PRIORITY ACTIONS (3-5 items):
   - Priority: urgent/high/medium
   - Title: Clear action item for Sentry
   - Description: What Sentry should do
   - Rationale: Why this matters for Sentry's competitive position
   - Estimated effort: hours/days/weeks
   - Deadline: when Sentry should complete this

3. COMPETITIVE INSIGHTS (top 5):
   For each:
   - Competitor name
   - Title: What they did
   - What they did: 1 sentence
   - Why it matters: Impact on Sentry's positioning/messaging
   - Our response: Specific marketing counter-move Sentry should make
   - Metrics: What Sentry should track

Focus on advising Sentry on:
- How to adjust positioning and messaging in response to competitors
- What content and campaigns Sentry should create
- How to address competitive claims
- Market opportunities Sentry should exploit
- Website/landing page updates Sentry needs

Be specific and actionable. Frame all advice as recommendations for what Sentry should do to respond to the competition.`;

    // Check for cancellation before expensive AI call
    this.cancellationToken?.throwIfCancelled();

    const model = this.analyzer['getModel']();
    const response = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    });

    // Parse the response into structured format
    // For now, return a placeholder structure
    return {
      team: 'Marketing',
      weekStart: format(weekStart, 'yyyy-MM-dd'),
      weekEnd: format(weekEnd, 'yyyy-MM-dd'),
      generatedAt: new Date().toISOString(),
      summary: response.text || '',
      priorities: this.extractMarketingPriorities(marketingRelevant),
      insights: this.extractMarketingInsights(this.selectBalancedItems(marketingRelevant, 8))
    };
  }

  // Select items ensuring each competitor gets fair representation
  private selectBalancedItems(entries: DigestEntry[], targetCount: number): DigestEntry[] {
    // Group by competitor
    const byCompetitor = new Map<string, DigestEntry[]>();
    for (const entry of entries) {
      const existing = byCompetitor.get(entry.competitor) || [];
      existing.push(entry);
      byCompetitor.set(entry.competitor, existing);
    }

    // Sort each competitor's entries by threat level
    const threatOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    for (const [_, competitorEntries] of byCompetitor) {
      competitorEntries.sort((a, b) =>
        (threatOrder[a.analysis.threatLevel] || 4) - (threatOrder[b.analysis.threatLevel] || 4)
      );
    }

    // Round-robin selection to ensure balance
    const selected: DigestEntry[] = [];
    const competitors = Array.from(byCompetitor.keys());
    let round = 0;

    while (selected.length < targetCount && competitors.length > 0) {
      for (let i = competitors.length - 1; i >= 0; i--) {
        const competitor = competitors[i];
        const competitorEntries = byCompetitor.get(competitor)!;

        if (round < competitorEntries.length) {
          selected.push(competitorEntries[round]);
          if (selected.length >= targetCount) break;
        } else {
          // This competitor is exhausted, remove from rotation
          competitors.splice(i, 1);
        }
      }
      round++;
    }

    return selected;
  }

  private extractMarketingPriorities(entries: DigestEntry[]): ActionItem[] {
    const critical = entries.filter(e => e.analysis.threatLevel === 'critical');
    const high = entries.filter(e => e.analysis.threatLevel === 'high');

    const actions: ActionItem[] = [];

    // Critical positioning threats
    if (critical.length > 0) {
      actions.push({
        priority: 'urgent',
        title: 'Update competitive positioning messaging',
        description: `Review and update our positioning against ${critical.map(e => e.competitor).join(', ')} based on their recent announcements`,
        rationale: `${critical.length} critical competitive moves could impact our market position`,
        estimatedEffort: '1 week',
        deadline: format(addWeeks(new Date(), 1), 'yyyy-MM-dd')
      });
    }

    // High-threat feature announcements
    const featuresCount = high.reduce((sum, e) => sum + (e.analysis.newFeatures?.length || 0), 0);
    if (featuresCount > 0) {
      actions.push({
        priority: 'high',
        title: 'Create competitive response content',
        description: `Develop blog posts, comparison pages, or battlecards addressing ${featuresCount} new features from competitors`,
        rationale: 'Prospects will be asking about these capabilities in sales conversations',
        estimatedEffort: '2 weeks',
        deadline: format(addWeeks(new Date(), 2), 'yyyy-MM-dd')
      });
    }

    // Pricing changes
    const pricingChanges = entries.filter(e =>
      e.analysis.productAreas.includes('pricing')
    );
    if (pricingChanges.length > 0) {
      actions.push({
        priority: 'high',
        title: 'Review competitive pricing strategy',
        description: 'Analyze competitor pricing changes and update our pricing page messaging',
        rationale: `${pricingChanges.length} competitors made pricing-related announcements`,
        estimatedEffort: '3 days'
      });
    }

    return actions.slice(0, 5);
  }

  private extractMarketingInsights(entries: DigestEntry[]): TeamInsight[] {
    return entries.map(entry => ({
      competitor: entry.competitor,
      title: entry.content.title,
      whatTheyDid: entry.analysis.summary.split('.').slice(0, 2).join('.') + '.',
      whyItMatters: entry.analysis.competitiveImplications.split('.').slice(0, 2).join('.') + '.',
      ourResponse: entry.analysis.recommendedActions[0] || 'Monitor for customer impact',
      metrics: [`Track "${entry.competitor}" mentions in sales calls`, 'Monitor competitive win/loss', `Track "${entry.competitor}" search trends`]
    }));
  }

  private async generateSalesDigest(
    entries: DigestEntry[],
    weekStart: Date,
    weekEnd: Date
  ): Promise<TeamDigest> {
    // Filter for sales-relevant items
    const salesRelevant = entries.filter(e =>
      e.analysis.threatLevel === 'critical' ||
      e.analysis.threatLevel === 'high' ||
      (e.analysis.newFeatures && e.analysis.newFeatures.length > 0)
    );

    return {
      team: 'Sales',
      weekStart: format(weekStart, 'yyyy-MM-dd'),
      weekEnd: format(weekEnd, 'yyyy-MM-dd'),
      generatedAt: new Date().toISOString(),
      summary: this.generateSalesSummary(salesRelevant),
      priorities: this.extractSalesPriorities(salesRelevant),
      insights: this.extractSalesInsights(salesRelevant.slice(0, 5))
    };
  }

  private generateSalesSummary(entries: DigestEntry[]): string {
    const competitors = [...new Set(entries.map(e => e.competitor))];
    const featuresCount = entries.reduce((sum, e) => sum + (e.analysis.newFeatures?.length || 0), 0);
    const critical = entries.filter(e => e.analysis.threatLevel === 'critical').length;

    return `This week, ${competitors.length} competitors made ${entries.length} significant announcements including ${featuresCount} new features. ${critical > 0 ? `${critical} are critical threats requiring immediate sales team awareness.` : ''} Key areas: ${this.getTopProductAreas(entries, 3).join(', ')}.`;
  }

  private extractSalesPriorities(entries: DigestEntry[]): ActionItem[] {
    const actions: ActionItem[] = [];

    // Battlecard updates
    const critical = entries.filter(e => e.analysis.threatLevel === 'critical');
    if (critical.length > 0) {
      actions.push({
        priority: 'urgent',
        title: 'Update battlecards for critical threats',
        description: `Revise competitive battlecards for ${critical.map(e => e.competitor).join(', ')}`,
        rationale: 'These features will come up in active deals - reps need talking points now',
        estimatedEffort: '2 days',
        deadline: format(addWeeks(new Date(), 1), 'yyyy-MM-dd')
      });
    }

    // New feature objection handling
    const newFeatures = entries.filter(e => e.analysis.newFeatures && e.analysis.newFeatures.length > 0);
    if (newFeatures.length > 0) {
      actions.push({
        priority: 'high',
        title: 'Train team on new competitor capabilities',
        description: 'Conduct sales enablement session on how to handle objections about new competitor features',
        rationale: 'Prospects will ask about these in discovery and demo calls',
        estimatedEffort: '1 day'
      });
    }

    // Win/loss analysis
    actions.push({
      priority: 'medium',
      title: 'Flag active deals competing with these vendors',
      description: `Review open opportunities against ${entries.slice(0, 3).map(e => e.competitor).join(', ')}`,
      rationale: 'Proactively address new positioning in active deals',
      estimatedEffort: '2 hours'
    });

    return actions;
  }

  private extractSalesInsights(entries: DigestEntry[]): TeamInsight[] {
    return entries.map(entry => ({
      competitor: entry.competitor,
      title: entry.content.title,
      whatTheyDid: entry.analysis.summary,
      whyItMatters: `In deals: ${this.getSalesImplication(entry)}`,
      ourResponse: this.getSalesResponse(entry),
      metrics: [
        'Deals competing with this vendor',
        'Win rate change',
        'Common objections'
      ]
    }));
  }

  private getSalesImplication(entry: DigestEntry): string {
    if (entry.analysis.threatLevel === 'critical') {
      return 'Expect this to be raised in every competitive deal';
    }
    if (entry.analysis.newFeatures && entry.analysis.newFeatures.length > 0) {
      return `Prospects may ask about: ${entry.analysis.newFeatures[0].name}`;
    }
    return 'Monitor for mention in discovery calls';
  }

  private getSalesResponse(entry: DigestEntry): string {
    // Extract the most actionable recommended action
    const actions = entry.analysis.recommendedActions;
    if (actions.length > 0) {
      return actions[0];
    }
    return 'Position our strengths in this area';
  }

  private async generateProductDigest(
    entries: DigestEntry[],
    weekStart: Date,
    weekEnd: Date
  ): Promise<TeamDigest> {
    // Filter for product-relevant items
    const productRelevant = entries.filter(e =>
      e.analysis.productAreas.includes('core') ||
      e.analysis.productAreas.includes('integrations') ||
      e.analysis.productAreas.includes('api') ||
      e.analysis.productAreas.includes('ux') ||
      (e.analysis.newFeatures && e.analysis.newFeatures.length > 0)
    );

    return {
      team: 'Product',
      weekStart: format(weekStart, 'yyyy-MM-dd'),
      weekEnd: format(weekEnd, 'yyyy-MM-dd'),
      generatedAt: new Date().toISOString(),
      summary: this.generateProductSummary(productRelevant),
      priorities: this.extractProductPriorities(productRelevant),
      insights: this.extractProductInsights(productRelevant.slice(0, 8))
    };
  }

  private generateProductSummary(entries: DigestEntry[]): string {
    const features = entries.reduce((sum, e) => sum + (e.analysis.newFeatures?.length || 0), 0);
    const topAreas = this.getTopProductAreas(entries, 3);
    const criticalFeatures = entries.filter(e =>
      e.analysis.threatLevel === 'critical' &&
      e.analysis.newFeatures &&
      e.analysis.newFeatures.length > 0
    );

    return `This week, competitors shipped ${features} new features. Critical gaps to address: ${criticalFeatures.length}. Focus areas: ${topAreas.join(', ')}. ${criticalFeatures.length > 0 ? 'Immediate roadmap review recommended.' : ''}`;
  }

  private extractProductPriorities(entries: DigestEntry[]): ActionItem[] {
    const actions: ActionItem[] = [];

    // Critical feature gaps
    const critical = entries.filter(e =>
      e.analysis.threatLevel === 'critical' &&
      e.analysis.newFeatures &&
      e.analysis.newFeatures.length > 0
    );

    if (critical.length > 0) {
      const topFeature = critical[0].analysis.newFeatures![0];
      actions.push({
        priority: 'urgent',
        title: `Evaluate competitive response to: ${topFeature.name}`,
        description: `${critical[0].competitor} launched ${topFeature.name}. Assess if we need similar capability.`,
        rationale: topFeature.impact,
        estimatedEffort: '1 week',
        deadline: format(addWeeks(new Date(), 2), 'yyyy-MM-dd')
      });
    }

    // High-impact features
    const highImpact = entries.filter(e =>
      e.analysis.threatLevel === 'high' &&
      e.analysis.newFeatures &&
      e.analysis.newFeatures.length > 0
    );

    if (highImpact.length > 0) {
      actions.push({
        priority: 'high',
        title: `Roadmap review: ${highImpact.length} new competitor capabilities`,
        description: 'Schedule competitive feature review session with product team',
        rationale: 'Multiple competitors shipped features in our core areas',
        estimatedEffort: '4 hours'
      });
    }

    // UX improvements
    const uxUpdates = entries.filter(e => e.analysis.productAreas.includes('ux'));
    if (uxUpdates.length > 0) {
      actions.push({
        priority: 'medium',
        title: 'Review competitor UX innovations',
        description: `Analyze UX changes from ${uxUpdates.map(e => e.competitor).join(', ')}`,
        rationale: 'Identify UX patterns that might improve our product experience',
        estimatedEffort: '2 days'
      });
    }

    return actions.slice(0, 5);
  }

  private extractProductInsights(entries: DigestEntry[]): TeamInsight[] {
    return entries
      .filter(e => e.analysis.newFeatures && e.analysis.newFeatures.length > 0)
      .flatMap(entry =>
        entry.analysis.newFeatures!.slice(0, 2).map(feature => ({
          competitor: entry.competitor,
          title: feature.name,
          whatTheyDid: feature.description,
          whyItMatters: feature.impact,
          ourResponse: this.getProductResponse(entry, feature),
          metrics: [
            'Customer requests for similar feature',
            'Churn mentions of this gap',
            'Sales competitive losses citing this'
          ]
        }))
      )
      .slice(0, 8);
  }

  private getProductResponse(entry: DigestEntry, feature: any): string {
    const actions = entry.analysis.recommendedActions;
    const relevant = actions.find(a =>
      a.toLowerCase().includes('feature') ||
      a.toLowerCase().includes('capability') ||
      a.toLowerCase().includes('develop')
    );
    return relevant || 'Evaluate for roadmap inclusion';
  }

  private getTopProductAreas(entries: DigestEntry[], limit: number): string[] {
    const areaCounts = new Map<string, number>();

    entries.forEach(e => {
      e.analysis.productAreas.forEach(area => {
        areaCounts.set(area, (areaCounts.get(area) || 0) + 1);
      });
    });

    return Array.from(areaCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([area]) => area);
  }

  private generateTeamMarkdown(digest: TeamDigest): string {
    let md = `# ${digest.team} Competitive Digest\n`;
    md += `**Week of ${digest.weekStart} to ${digest.weekEnd}**\n\n`;
    md += `*Generated: ${new Date(digest.generatedAt).toLocaleDateString()}*\n\n`;

    md += `## 📋 Executive Summary\n\n`;
    md += `${digest.summary}\n\n`;

    md += `---\n\n`;
    md += `## 🎯 Priority Actions\n\n`;

    digest.priorities.forEach((action, i) => {
      const emoji = action.priority === 'urgent' ? '🔴' : action.priority === 'high' ? '🟠' : '🟡';
      md += `### ${emoji} ${i + 1}. ${action.title}\n\n`;
      md += `**Priority:** ${action.priority.toUpperCase()}\n\n`;
      md += `**What to do:** ${action.description}\n\n`;
      md += `**Why:** ${action.rationale}\n\n`;
      if (action.estimatedEffort) {
        md += `**Effort:** ${action.estimatedEffort}\n\n`;
      }
      if (action.deadline) {
        md += `**Deadline:** ${action.deadline}\n\n`;
      }
      md += `---\n\n`;
    });

    md += `## 📊 Key Competitive Insights\n\n`;

    digest.insights.forEach((insight, i) => {
      md += `### ${i + 1}. ${insight.competitor}: ${insight.title}\n\n`;
      md += `**What they did:** ${insight.whatTheyDid}\n\n`;
      md += `**Why it matters:** ${insight.whyItMatters}\n\n`;
      md += `**Our response:** ${insight.ourResponse}\n\n`;
      if (insight.metrics && insight.metrics.length > 0) {
        md += `**Track:**\n`;
        insight.metrics.forEach(m => md += `- ${m}\n`);
        md += `\n`;
      }
      md += `---\n\n`;
    });

    return md;
  }
}
