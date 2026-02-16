import { generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { CompetitorContent, AnalysisResult, AnalysisResultSchema, CompanyProfile } from '../types/index.js';

export interface AnalyzerConfig {
  model: string;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
  companyProfile?: CompanyProfile;
}

export class CompetitiveAnalyzer {
  private config: AnalyzerConfig;
  private progressCallback?: (analyzed: number, total: number) => void;

  constructor(config: AnalyzerConfig, progressCallback?: (analyzed: number, total: number) => void) {
    this.config = {
      temperature: 0.3,
      maxTokens: 4000,
      ...config
    };
    this.progressCallback = progressCallback;
  }

  private getModel() {
    const [provider, modelName] = this.config.model.split(':');

    switch (provider) {
      case 'anthropic':
        const anthropic = createAnthropic({
          apiKey: this.config.apiKey || process.env.ANTHROPIC_API_KEY
        });
        return anthropic(modelName || 'claude-sonnet-4-20250514');

      case 'openai':
        const openai = createOpenAI({
          apiKey: this.config.apiKey || process.env.OPENAI_API_KEY
        });
        return openai(modelName || 'gpt-4-turbo');

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  async analyzeContent(content: CompetitorContent): Promise<AnalysisResult> {
    const model = this.getModel();

    const prompt = this.buildAnalysisPrompt(content);

    const schema = AnalysisResultSchema.omit({
      contentId: true,
      analyzedAt: true
    });

    try {
      const result = await generateText({
        model,
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
        tools: {
          submitAnalysis: {
            description: 'Submit the competitive analysis results',
            parameters: schema,
          },
        },
        toolChoice: 'required',
        system: this.getSystemPrompt(),
        prompt,
      });

      // Extract the analysis from the tool call
      const toolCall = result.toolCalls?.[0];
      if (!toolCall || toolCall.toolName !== 'submitAnalysis') {
        throw new Error('Expected submitAnalysis tool call but got: ' + JSON.stringify(result.toolCalls));
      }

      return {
        ...toolCall.args,
        contentId: content.id,
        analyzedAt: new Date(),
      } as AnalysisResult;
    } catch (error) {
      console.error(`Error analyzing content ${content.id}:`, error);
      throw error;
    }
  }

  async analyzeMultipleContents(contents: CompetitorContent[]): Promise<AnalysisResult[]> {
    const results: AnalysisResult[] = [];

    // Process in batches to avoid rate limits
    const batchSize = 5;
    console.log(`Analyzing ${contents.length} items in batches of ${batchSize}...`);

    for (let i = 0; i < contents.length; i += batchSize) {
      const batch = contents.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(contents.length / batchSize)} (${batch.length} items)...`);

      const batchResults = await Promise.allSettled(
        batch.map(content => this.analyzeContent(content))
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
          console.log(`✓ Analysis successful`);
        } else {
          console.error('✗ Analysis failed:', result.reason);
        }
      }

      console.log(`Batch complete. ${results.length}/${contents.length} analyzed so far.`);

      // Report progress via callback
      if (this.progressCallback) {
        this.progressCallback(results.length, contents.length);
      }

      // Add delay between batches
      if (i + batchSize < contents.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`All analysis complete. ${results.length} successful out of ${contents.length} total.`);
    return results;
  }

  private buildCompanyContext(): string {
    if (!this.config.companyProfile) {
      return '';
    }

    const profile = this.config.companyProfile;
    const parts: string[] = [
      `\n--- COMPANY CONTEXT ---`,
      `You are analyzing from the perspective of: ${profile.name}`
    ];

    if (profile.description) {
      parts.push(`\nCompany Overview: ${profile.description}`);
    }

    if (profile.products && profile.products.length > 0) {
      parts.push(`\nOur Products: ${profile.products.join(', ')}`);
    }

    if (profile.targetMarket) {
      parts.push(`\nTarget Market: ${profile.targetMarket}`);
    }

    if (profile.differentiators && profile.differentiators.length > 0) {
      parts.push(`\nKey Differentiators: ${profile.differentiators.join(', ')}`);
    }

    parts.push(`\nWhen analyzing competitor content, consider how it specifically impacts ${profile.name}'s market position, products, and competitive advantages.\n---\n`);

    return parts.join('\n');
  }

  private getSystemPrompt(): string {
    const companyContext = this.buildCompanyContext();

    return `You are a competitive intelligence analyst specializing in analyzing competitor activities and market positioning.${companyContext}

Your role is to:
1. Analyze competitor content (blog posts, release notes, press releases, etc.)
2. Identify key insights, positioning changes, and new features
3. Assess the competitive threat level to our business
4. Recommend strategic actions based on competitive moves

When analyzing content:
- Focus on strategic implications rather than technical details
- Consider market positioning, pricing signals, and target audience shifts
- Identify features that could attract our customers or address market gaps
- Assess urgency and impact of competitive moves
- Be concise but thorough in your analysis

Threat level criteria:
- CRITICAL: Major feature launch, significant pricing change, or market positioning shift that directly threatens our core value proposition
- HIGH: Important feature or capability that addresses a key customer need we lack
- MEDIUM: Incremental improvements or features in areas of competition
- LOW: Minor updates, content marketing, or non-competitive announcements

Product area mapping:
- CORE: Main product functionality and user experience
- INTEGRATIONS: Third-party integrations and partnerships
- PRICING: Pricing models, packaging, or monetization changes
- MARKETING: Positioning, messaging, or brand changes
- INFRASTRUCTURE: Backend, performance, or technical capabilities
- SECURITY: Security features, compliance, or data protection
- UX: User interface and user experience improvements
- MOBILE: Mobile apps and mobile-specific features
- API: Developer APIs and programmatic access
- OTHER: Anything that doesn't fit above categories`;
  }

  private buildAnalysisPrompt(content: CompetitorContent): string {
    const companyReference = this.config.companyProfile
      ? ` relative to ${this.config.companyProfile.name}`
      : '';

    return `Analyze the following competitive content from ${content.competitor}:

**Title:** ${content.title}
**Type:** ${content.contentType}
**Published:** ${content.publishedAt.toISOString().split('T')[0]}
**URL:** ${content.url}

**Content:**
${this.truncateContent(content.content, 8000)}

---

Provide a comprehensive competitive analysis with:
1. A concise summary (2-3 sentences)
2. Key insights and takeaways
3. Any positioning or messaging changes detected
4. New features or capabilities announced (with impact assessment)
5. Threat level assessment${companyReference} (critical/high/medium/low)
6. Product areas affected
7. Competitive implications${companyReference}
8. Recommended strategic actions or responses${companyReference}`;
  }

  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }
    return content.substring(0, maxLength) + '\n\n[Content truncated...]';
  }

  async generateExecutiveSummary(
    analyses: AnalysisResult[],
    startDate: Date,
    endDate: Date
  ): Promise<string> {
    const model = this.getModel();

    const summaryPrompt = this.buildExecutiveSummaryPrompt(analyses, startDate, endDate);

    try {
      const { text } = await generateText({
        model,
        temperature: 0.4,
        maxTokens: 1500,
        prompt: summaryPrompt,
        system: 'You are an executive briefing specialist. Create concise, actionable summaries for senior leadership.'
      });

      return text;
    } catch (error) {
      console.error('Error generating executive summary:', error);
      throw error;
    }
  }

  private buildExecutiveSummaryPrompt(
    analyses: AnalysisResult[],
    startDate: Date,
    endDate: Date
  ): string {
    const criticalCount = analyses.filter(a => a.threatLevel === 'critical').length;
    const highCount = analyses.filter(a => a.threatLevel === 'high').length;
    const competitors = [...new Set(analyses.map(a => {
      // Find the competitor name from the analysis data
      return 'competitor'; // This would be populated from the full data
    }))];

    const summaries = analyses
      .slice(0, 10) // Top 10 most relevant
      .map(a => `- ${a.summary} [${a.threatLevel.toUpperCase()}]`)
      .join('\n');

    return `Generate an executive summary for competitive intelligence digest covering ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}.

**Statistics:**
- Total items analyzed: ${analyses.length}
- Critical threats: ${criticalCount}
- High threats: ${highCount}
- Competitors tracked: ${competitors.length}

**Key Developments:**
${summaries}

Create a 3-4 paragraph executive summary that:
1. Highlights the most critical competitive moves
2. Identifies emerging trends or patterns
3. Provides strategic context for leadership
4. Recommends top 3 priority actions

Keep it concise, strategic, and actionable.`;
  }
}
