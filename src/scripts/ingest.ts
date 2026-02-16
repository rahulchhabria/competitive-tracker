#!/usr/bin/env node

import 'dotenv/config';
import { RSSFetcher } from '../ingestion/rss-fetcher.js';
import { FileStorage } from '../storage/file-storage.js';
import { loadConfig, validateConfig } from '../utils/config.js';
import { deduplicateByUrl } from '../utils/helpers.js';

async function main() {
  console.log('🔍 Starting content ingestion...\n');

  try {
    // Load configuration
    const config = loadConfig();
    validateConfig(config);

    // Initialize storage
    const storage = new FileStorage(config.dataDir);
    await storage.initialize();

    // Initialize RSS fetcher
    const rssFetcher = new RSSFetcher();

    let totalIngested = 0;

    // Fetch content from each competitor
    for (const competitor of config.competitors) {
      if (!competitor.enabled) {
        console.log(`⏭️  Skipping ${competitor.name} (disabled)`);
        continue;
      }

      console.log(`📰 Fetching content from ${competitor.name}...`);

      try {
        const contents = await rssFetcher.fetchMultipleFeeds(
          competitor.feedUrls,
          competitor.name
        );

        if (contents.length === 0) {
          console.log(`   No new content found`);
          continue;
        }

        // Deduplicate by URL
        const uniqueContents = deduplicateByUrl(contents);

        // Check for existing content
        const existingContent = await storage.loadContentByCompetitor(competitor.name);
        const existingUrls = new Set(existingContent.map(c => c.url));

        const newContents = uniqueContents.filter(c => !existingUrls.has(c.url));

        if (newContents.length === 0) {
          console.log(`   No new content (${uniqueContents.length} already ingested)`);
          continue;
        }

        // Save new content
        await storage.saveMultipleContents(newContents);

        console.log(`   ✅ Ingested ${newContents.length} new items`);
        totalIngested += newContents.length;

        // Show sample titles
        newContents.slice(0, 3).forEach(c => {
          console.log(`      - ${c.title}`);
        });

        if (newContents.length > 3) {
          console.log(`      ... and ${newContents.length - 3} more`);
        }
      } catch (error) {
        console.error(`   ❌ Error fetching from ${competitor.name}:`, error);
      }

      console.log('');
    }

    console.log(`\n✨ Ingestion complete! Total new items: ${totalIngested}`);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
