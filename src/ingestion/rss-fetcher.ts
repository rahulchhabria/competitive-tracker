import Parser from 'rss-parser';
import { CompetitorContent, ContentType } from '../types/index.js';
import { generateId } from '../utils/helpers.js';

export class RSSFetcher {
  private parser: Parser;

  constructor() {
    this.parser = new Parser({
      customFields: {
        item: [
          ['dc:creator', 'creator'],
          ['content:encoded', 'contentEncoded']
        ]
      }
    });
  }

  async fetchFeed(feedUrl: string, competitor: string): Promise<CompetitorContent[]> {
    try {
      const feed = await this.parser.parseURL(feedUrl);
      const contents: CompetitorContent[] = [];

      // Only get content from the last 6 months
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      for (const item of feed.items) {
        if (!item.title || !item.link) continue;

        const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();

        // Skip items older than 6 months
        if (publishedAt < sixMonthsAgo) {
          continue;
        }

        const content = this.extractContent(item);
        const contentType = this.detectContentType(item, feedUrl);

        contents.push({
          id: generateId(),
          competitor,
          title: item.title,
          url: item.link,
          content,
          contentType,
          publishedAt,
          ingestedAt: new Date(),
          metadata: {
            author: item.creator || item.author,
            categories: item.categories || [],
            guid: item.guid,
          }
        });
      }

      return contents;
    } catch (error) {
      console.error(`Error fetching RSS feed ${feedUrl}:`, error);
      return [];
    }
  }

  private extractContent(item: any): string {
    // Try to get the most complete content available
    if (item.contentEncoded) {
      return this.stripHtml(item.contentEncoded);
    }
    if (item['content:encoded']) {
      return this.stripHtml(item['content:encoded']);
    }
    if (item.content) {
      return this.stripHtml(item.content);
    }
    if (item.summary) {
      return this.stripHtml(item.summary);
    }
    if (item.description) {
      return this.stripHtml(item.description);
    }
    return '';
  }

  private stripHtml(html: string): string {
    // Basic HTML stripping - you might want to use cheerio for better handling
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private detectContentType(item: any, feedUrl: string): ContentType {
    const title = (item.title || '').toLowerCase();
    const url = (feedUrl || '').toLowerCase();
    const categories = (item.categories || []).map((c: string) => c.toLowerCase());

    // Check for release notes
    if (
      title.includes('release') ||
      title.includes('changelog') ||
      title.includes('update') ||
      url.includes('release') ||
      url.includes('changelog')
    ) {
      return 'release_notes';
    }

    // Check for press releases
    if (
      title.includes('announces') ||
      title.includes('press release') ||
      categories.includes('press') ||
      url.includes('press')
    ) {
      return 'press_release';
    }

    // Check for news
    if (
      categories.includes('news') ||
      url.includes('news')
    ) {
      return 'news_article';
    }

    // Default to blog post
    return 'blog_post';
  }

  async fetchMultipleFeeds(
    feedUrls: string[],
    competitor: string
  ): Promise<CompetitorContent[]> {
    const results = await Promise.allSettled(
      feedUrls.map(url => this.fetchFeed(url, competitor))
    );

    return results
      .filter((result): result is PromiseFulfilledResult<CompetitorContent[]> =>
        result.status === 'fulfilled'
      )
      .flatMap(result => result.value);
  }
}
