import axios from 'axios';
import * as cheerio from 'cheerio';

interface DiscoveryResult {
  websiteUrl: string;
  blogUrl?: string;
  releaseNotesUrl?: string;
  feedUrls: string[];
}

export class FeedDiscovery {
  private commonFeedPaths = [
    '/feed',
    '/rss',
    '/feed.xml',
    '/rss.xml',
    '/atom.xml',
    '/blog/feed',
    '/blog/rss',
    '/blog/feed.xml',
    '/blog/rss.xml',
    '/changelog/feed',
    '/changelog/rss',
    '/releases/feed',
    '/news/feed',
    '/updates/feed'
  ];

  private commonBlogPaths = [
    '/blog',
    '/news',
    '/articles',
    '/posts',
    '/updates'
  ];

  private commonChangelogPaths = [
    '/changelog',
    '/releases',
    '/release-notes',
    '/updates',
    '/whats-new'
  ];

  private commonSubdomains = [
    'blog',
    'news',
    'press',
    'about',
    'developer',
    'developers',
    'devblog',
    'engineering',
    'updates',
    'changelog',
    'releases'
  ];

  async discoverFeeds(domain: string): Promise<DiscoveryResult> {
    // Clean and normalize domain
    domain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const websiteUrl = `https://${domain}`;

    const result: DiscoveryResult = {
      websiteUrl,
      feedUrls: []
    };

    try {
      // 1. Fetch the homepage and parse it
      const homepage = await this.fetchPage(websiteUrl);

      // 2. Look for RSS/Atom links in HTML
      const htmlFeeds = this.findFeedsInHtml(homepage, websiteUrl);
      result.feedUrls.push(...htmlFeeds);

      // 3. Look for blog and changelog URLs in HTML
      const { blogUrl, changelogUrl } = this.findUrlsInHtml(homepage, websiteUrl);
      result.blogUrl = blogUrl;
      result.releaseNotesUrl = changelogUrl;

      // 4. Try common feed paths
      const commonFeeds = await this.tryCommonPaths(websiteUrl);
      result.feedUrls.push(...commonFeeds);

      // 5. If we found a blog URL, try to find its feed
      if (result.blogUrl) {
        const blogFeeds = await this.discoverBlogFeed(result.blogUrl);
        result.feedUrls.push(...blogFeeds);
      }

      // 6. If we found a changelog URL, try to find its feed
      if (result.releaseNotesUrl) {
        const changelogFeeds = await this.discoverChangelogFeed(result.releaseNotesUrl);
        result.feedUrls.push(...changelogFeeds);
      }

      // 7. Check common subdomains (blog.domain.com, press.domain.com, etc.)
      const subdomainFeeds = await this.checkCommonSubdomains(domain);
      result.feedUrls.push(...subdomainFeeds.feeds);

      // Update blogUrl if we found one on a subdomain
      if (!result.blogUrl && subdomainFeeds.blogUrl) {
        result.blogUrl = subdomainFeeds.blogUrl;
      }

      // 8. Deduplicate feed URLs
      result.feedUrls = [...new Set(result.feedUrls)];

    } catch (error) {
      console.error(`Error discovering feeds for ${domain}:`, error);
    }

    return result;
  }

  private async fetchPage(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Rival/2.0)'
        }
      });
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch ${url}:`, error);
      return '';
    }
  }

  private findFeedsInHtml(html: string, baseUrl: string): string[] {
    const feeds: string[] = [];

    try {
      const $ = cheerio.load(html);

      // Look for RSS/Atom link tags - these are the most reliable
      $('link[type="application/rss+xml"], link[type="application/atom+xml"]').each((_, elem) => {
        const href = $(elem).attr('href');
        if (href) {
          feeds.push(this.normalizeUrl(href, baseUrl));
        }
      });

      // Look for links with "rss" or "feed" in href, but filter out article URLs
      $('a[href*="rss"], a[href*="feed"], a[href*="atom"]').each((_, elem) => {
        const href = $(elem).attr('href');
        if (href && this.isValidFeedUrl(href)) {
          feeds.push(this.normalizeUrl(href, baseUrl));
        }
      });
    } catch (error) {
      console.error('Error parsing HTML for feeds:', error);
    }

    return feeds;
  }

  private isValidFeedUrl(url: string): boolean {
    // Filter out URLs that are likely article pages, not feeds
    const invalidPatterns = [
      /\?utm_/,           // UTM parameters
      /\?[a-zA-Z0-9]+=/, // Other query parameters (except standalone ?feed or ?rss)
      /\/\d{4}\/\d{2}\//,  // Date-based URLs (2024/01/)
      /[a-zA-Z]{10,}/     // Long strings (likely article slugs)
    ];

    // Check if URL matches any invalid pattern
    for (const pattern of invalidPatterns) {
      if (pattern.test(url)) {
        return false;
      }
    }

    // Must contain feed-related keywords
    return url.includes('feed') || url.includes('rss') || url.includes('atom');
  }

  private findUrlsInHtml(html: string, baseUrl: string): { blogUrl?: string; changelogUrl?: string } {
    const result: { blogUrl?: string; changelogUrl?: string } = {};

    try {
      const $ = cheerio.load(html);

      // Look for blog link - try multiple candidates and pick the first clean one
      const blogCandidates: string[] = [];
      $('a[href*="/blog"]').each((_, elem) => {
        const href = $(elem).attr('href');
        if (href) blogCandidates.push(href);
      });

      // Find the first clean blog URL (prefer exact /blog or /blog/ matches)
      for (const candidate of blogCandidates) {
        if (this.isCleanUrl(candidate) && (candidate.endsWith('/blog') || candidate.endsWith('/blog/'))) {
          result.blogUrl = this.normalizeUrl(candidate, baseUrl);
          break;
        }
      }

      // If no exact match, accept any clean blog URL
      if (!result.blogUrl) {
        for (const candidate of blogCandidates) {
          if (this.isCleanUrl(candidate)) {
            result.blogUrl = this.normalizeUrl(candidate, baseUrl);
            break;
          }
        }
      }

      // Look for changelog/releases link - same approach
      const changelogCandidates: string[] = [];
      $('a[href*="/changelog"], a[href*="/releases"]').each((_, elem) => {
        const href = $(elem).attr('href');
        if (href) changelogCandidates.push(href);
      });

      for (const candidate of changelogCandidates) {
        if (this.isCleanUrl(candidate)) {
          result.changelogUrl = this.normalizeUrl(candidate, baseUrl);
          break;
        }
      }
    } catch (error) {
      console.error('Error parsing HTML for URLs:', error);
    }

    return result;
  }

  private isCleanUrl(url: string): boolean {
    // Only accept URLs that look like section pages, not article pages
    // Must NOT have query parameters, date patterns, or long slugs
    if (url.includes('?') && !url.endsWith('?feed') && !url.endsWith('?rss')) {
      return false;
    }

    // Check for date patterns (article URLs)
    if (/\/\d{4}\/\d{2}\//.test(url)) {
      return false;
    }

    // Check for very long path segments (likely article slugs)
    const pathSegments = url.split('/').filter(s => s.length > 0);
    for (const segment of pathSegments) {
      if (segment.length > 30) {
        return false;
      }
    }

    return true;
  }

  private async tryCommonPaths(baseUrl: string): Promise<string[]> {
    const feeds: string[] = [];

    for (const path of this.commonFeedPaths) {
      const url = `${baseUrl}${path}`;

      try {
        const response = await axios.head(url, {
          timeout: 5000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Rival/2.0)'
          }
        });

        if (response.status === 200) {
          const contentType = response.headers['content-type'] || '';
          if (contentType.includes('xml') || contentType.includes('rss') || contentType.includes('atom')) {
            feeds.push(url);
          }
        }
      } catch (error) {
        // URL doesn't exist, skip
      }
    }

    return feeds;
  }

  private async discoverBlogFeed(blogUrl: string): Promise<string[]> {
    const feeds: string[] = [];

    try {
      const html = await this.fetchPage(blogUrl);
      const htmlFeeds = this.findFeedsInHtml(html, blogUrl);
      feeds.push(...htmlFeeds);

      // Try common paths under blog URL
      const blogFeeds = ['/feed', '/rss', '/feed.xml', '/rss.xml'];
      for (const path of blogFeeds) {
        const url = `${blogUrl}${path}`;

        try {
          const response = await axios.head(url, { timeout: 5000 });
          if (response.status === 200) {
            feeds.push(url);
          }
        } catch (error) {
          // Skip
        }
      }
    } catch (error) {
      console.error(`Error discovering blog feed for ${blogUrl}:`, error);
    }

    return feeds;
  }

  private async discoverChangelogFeed(changelogUrl: string): Promise<string[]> {
    const feeds: string[] = [];

    try {
      const html = await this.fetchPage(changelogUrl);
      const htmlFeeds = this.findFeedsInHtml(html, changelogUrl);
      feeds.push(...htmlFeeds);

      // Try common paths
      const changelogFeeds = ['/feed', '/rss', '/feed.xml'];
      for (const path of changelogFeeds) {
        const url = `${changelogUrl}${path}`;

        try {
          const response = await axios.head(url, { timeout: 5000 });
          if (response.status === 200) {
            feeds.push(url);
          }
        } catch (error) {
          // Skip
        }
      }
    } catch (error) {
      console.error(`Error discovering changelog feed for ${changelogUrl}:`, error);
    }

    return feeds;
  }

  private normalizeUrl(url: string, baseUrl: string): string {
    // If URL is already absolute, return it
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    // Parse base URL
    const base = new URL(baseUrl);

    // If URL starts with //, add protocol
    if (url.startsWith('//')) {
      return `${base.protocol}${url}`;
    }

    // If URL starts with /, it's absolute path
    if (url.startsWith('/')) {
      return `${base.protocol}//${base.host}${url}`;
    }

    // Otherwise, it's relative - join with base
    return `${baseUrl}/${url}`;
  }

  private async checkCommonSubdomains(domain: string): Promise<{ feeds: string[]; blogUrl?: string }> {
    const feeds: string[] = [];
    let blogUrl: string | undefined;

    // Extract root domain (handle www. prefix)
    const rootDomain = domain.replace(/^www\./, '');

    // Try each common subdomain
    for (const subdomain of this.commonSubdomains) {
      const subdomainUrl = `https://${subdomain}.${rootDomain}`;

      try {
        // First check if subdomain exists
        const response = await axios.head(subdomainUrl, {
          timeout: 5000,
          maxRedirects: 5,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Rival/2.0)'
          }
        });

        if (response.status === 200) {
          console.log(`✓ Found subdomain: ${subdomainUrl}`);

          // Subdomain exists! Try to find feeds
          // 1. Check for RSS links in the HTML
          const html = await this.fetchPage(subdomainUrl);
          const htmlFeeds = this.findFeedsInHtml(html, subdomainUrl);
          feeds.push(...htmlFeeds);

          // 2. Try common feed paths
          const feedPaths = ['/feed', '/rss', '/feed.xml', '/rss.xml', '/blog/feed', '/blogs/feed'];
          for (const path of feedPaths) {
            const feedUrl = `${subdomainUrl}${path}`;
            try {
              const feedResponse = await axios.head(feedUrl, { timeout: 3000 });
              if (feedResponse.status === 200) {
                const contentType = feedResponse.headers['content-type'] || '';
                if (contentType.includes('xml') || contentType.includes('rss') || contentType.includes('atom')) {
                  feeds.push(feedUrl);
                  console.log(`  ✓ Found feed: ${feedUrl}`);
                }
              }
            } catch (error) {
              // Feed doesn't exist, continue
            }
          }

          // If this is a blog subdomain and we found feeds, set it as blogUrl
          if (subdomain === 'blog' && feeds.length > 0 && !blogUrl) {
            blogUrl = subdomainUrl;
          }
        }
      } catch (error) {
        // Subdomain doesn't exist or is inaccessible, continue
      }
    }

    // Special case for Amazon: check aws.amazon.com
    if (rootDomain === 'amazon.com') {
      const awsUrl = 'https://aws.amazon.com/blogs/aws/feed/';
      try {
        const response = await axios.head(awsUrl, { timeout: 5000 });
        if (response.status === 200) {
          feeds.push(awsUrl);
          console.log(`✓ Found AWS feed: ${awsUrl}`);
        }
      } catch (error) {
        // Skip
      }
    }

    return { feeds, blogUrl };
  }
}
