import axios from 'axios';
import * as cheerio from 'cheerio';
import { CompetitorContent, ContentType } from '../types/index.js';
import { generateId } from '../utils/helpers.js';

export interface ScrapeConfig {
  titleSelector?: string;
  contentSelector?: string;
  dateSelector?: string;
  removeSelectors?: string[];
}

export class WebScraper {
  private defaultConfig: ScrapeConfig = {
    titleSelector: 'h1, .title, article h1',
    contentSelector: 'article, .content, .post-content, main',
    dateSelector: 'time, .date, .published',
    removeSelectors: ['script', 'style', 'nav', 'footer', 'header', '.ads']
  };

  async scrapePage(
    url: string,
    competitor: string,
    contentType: ContentType = 'blog_post',
    config?: ScrapeConfig
  ): Promise<CompetitorContent | null> {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Rival/2.0)'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const mergedConfig = { ...this.defaultConfig, ...config };

      // Remove unwanted elements
      mergedConfig.removeSelectors?.forEach(selector => {
        $(selector).remove();
      });

      // Extract title
      const title = this.extractTitle($, mergedConfig.titleSelector);
      if (!title) {
        console.warn(`No title found for ${url}`);
        return null;
      }

      // Extract content
      const content = this.extractContent($, mergedConfig.contentSelector);
      if (!content) {
        console.warn(`No content found for ${url}`);
        return null;
      }

      // Extract date
      const publishedAt = this.extractDate($, mergedConfig.dateSelector);

      return {
        id: generateId(),
        competitor,
        title,
        url,
        content,
        contentType,
        publishedAt,
        ingestedAt: new Date(),
        metadata: {
          scrapedFrom: url,
          wordCount: content.split(/\s+/).length
        }
      };
    } catch (error) {
      console.error(`Error scraping ${url}:`, error);
      return null;
    }
  }

  private extractTitle($: cheerio.CheerioAPI, selector?: string): string {
    if (selector) {
      const title = $(selector).first().text().trim();
      if (title) return title;
    }

    // Fallback to page title
    return $('title').text().trim();
  }

  private extractContent($: cheerio.CheerioAPI, selector?: string): string {
    if (!selector) {
      return $('body').text().trim();
    }

    const content = $(selector)
      .map((_, el) => $(el).text())
      .get()
      .join('\n\n');

    return content.replace(/\s+/g, ' ').trim();
  }

  private extractDate($: cheerio.CheerioAPI, selector?: string): Date {
    if (selector) {
      const dateText = $(selector).first().attr('datetime') || $(selector).first().text();
      const parsed = new Date(dateText);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    // Fallback to current date
    return new Date();
  }

  async scrapeMultiplePages(
    urls: string[],
    competitor: string,
    contentType: ContentType = 'blog_post',
    config?: ScrapeConfig
  ): Promise<CompetitorContent[]> {
    const results = await Promise.allSettled(
      urls.map(url => this.scrapePage(url, competitor, contentType, config))
    );

    return results
      .filter((result): result is PromiseFulfilledResult<CompetitorContent | null> =>
        result.status === 'fulfilled' && result.value !== null
      )
      .map(result => result.value!);
  }
}
