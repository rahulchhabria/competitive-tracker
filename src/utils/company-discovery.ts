import { generateObject } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { CompanyProfileSchema } from '../types/index.js';
import https from 'https';
import http from 'http';

interface DiscoveryResult {
  name: string;
  description?: string;
  products?: string[];
  targetMarket?: string;
  differentiators?: string[];
}

export class CompanyDiscovery {
  async discoverCompanyInfo(domain: string, companyName: string): Promise<DiscoveryResult> {
    try {
      // Fetch the company website
      const websiteUrl = domain.startsWith('http') ? domain : `https://${domain}`;
      const html = await this.fetchWebsite(websiteUrl);

      // Extract text content from HTML (simple approach)
      const textContent = this.extractTextFromHTML(html);

      // Use AI to analyze the website and extract company information
      const discoveredInfo = await this.analyzeWebsite(textContent, companyName);

      return {
        name: companyName,
        ...discoveredInfo
      };
    } catch (error) {
      console.error('Error discovering company info:', error);
      // Return minimal info if discovery fails
      return {
        name: companyName,
        description: undefined,
        products: undefined,
        targetMarket: undefined,
        differentiators: undefined
      };
    }
  }

  private extractTextFromHTML(html: string): string {
    // Remove script and style tags
    let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Decode HTML entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');

    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();

    // Truncate to reasonable length for AI analysis
    return text.substring(0, 10000);
  }

  private async analyzeWebsite(content: string, companyName: string): Promise<Omit<DiscoveryResult, 'name'>> {
    const model = this.getModel();

    const schema = z.object({
      description: z.string().describe('A concise 1-2 sentence description of what the company does'),
      products: z.array(z.string()).describe('List of main products or services (2-5 items)'),
      targetMarket: z.string().describe('Primary target market or customer segment'),
      differentiators: z.array(z.string()).describe('Key competitive advantages or unique selling points (2-4 items)')
    });

    try {
      const { object } = await generateObject({
        model,
        schema,
        prompt: `Analyze the following website content for ${companyName} and extract key company information:

${content}

Extract:
1. A concise description (1-2 sentences) of what the company does
2. Main products or services (2-5 items, be specific)
3. Primary target market or customer segment
4. Key competitive advantages or differentiators (2-4 items)

Focus on factual information from the website. Be concise and specific.`
      });

      return object;
    } catch (error) {
      console.error('Error analyzing website with AI:', error);
      return {
        description: undefined,
        products: undefined,
        targetMarket: undefined,
        differentiators: undefined
      };
    }
  }

  private getModel() {
    // Check which API key is available
    if (process.env.ANTHROPIC_API_KEY) {
      const anthropic = createAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
      return anthropic('claude-sonnet-4-20250514');
    } else if (process.env.OPENAI_API_KEY) {
      const openai = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      return openai('gpt-4-turbo');
    } else {
      throw new Error('No API key configured');
    }
  }

  private fetchWebsite(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const client = url.startsWith('https') ? https : http;

      const req = client.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CompetitiveTracker/1.0)',
          'Accept': 'text/html,application/xhtml+xml'
        },
        timeout: 10000
      }, (res) => {
        // Handle redirects
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307 || res.statusCode === 308) {
          if (res.headers.location) {
            // Handle relative redirects
            const redirectUrl = res.headers.location.startsWith('http')
              ? res.headers.location
              : `${parsedUrl.protocol}//${parsedUrl.host}${res.headers.location}`;
            return this.fetchWebsite(redirectUrl)
              .then(resolve)
              .catch(reject);
          }
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }

        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve(data));
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }
}
