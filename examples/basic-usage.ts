/**
 * Basic usage example for the competitive tracker
 *
 * This demonstrates the complete workflow:
 * 1. Initialize storage
 * 2. Ingest competitor content
 * 3. Analyze with AI
 * 4. Generate digest
 */

import {
  RSSFetcher,
  CompetitiveAnalyzer,
  FileStorage,
  DigestGenerator,
  type CompetitorConfig
} from '../src/index.js';

async function main() {
  console.log('🚀 Competitive Tracker - Basic Usage Example\n');

  // Configure competitors
  const competitors: CompetitorConfig[] = [
    {
      name: 'Example Competitor',
      feedUrls: ['https://example.com/blog/rss'],
      blogUrl: 'https://example.com/blog',
      websiteUrl: 'https://example.com',
      enabled: true
    }
  ];

  // Initialize storage
  const storage = new FileStorage('./data');
  await storage.initialize();
  console.log('✅ Storage initialized\n');

  // Initialize RSS fetcher
  const rssFetcher = new RSSFetcher();

  // Step 1: Ingest content
  console.log('📥 Step 1: Ingesting content...');
  for (const competitor of competitors) {
    console.log(`   Fetching from ${competitor.name}...`);

    const contents = await rssFetcher.fetchMultipleFeeds(
      competitor.feedUrls,
      competitor.name
    );

    if (contents.length > 0) {
      await storage.saveMultipleContents(contents);
      console.log(`   ✅ Saved ${contents.length} items`);
    } else {
      console.log(`   ℹ️  No content found`);
    }
  }
  console.log('');

  // Step 2: Analyze content
  console.log('🤖 Step 2: Analyzing content with AI...');

  const analyzer = new CompetitiveAnalyzer({
    model: 'anthropic:claude-sonnet-4-20250514',
    temperature: 0.3,
    maxTokens: 4000
  });

  const allContent = await storage.loadAllContent();
  console.log(`   Found ${allContent.length} content items`);

  // Analyze unanalyzed content
  const toAnalyze = [];
  for (const content of allContent) {
    const existingAnalysis = await storage.loadAnalysis(content.id);
    if (!existingAnalysis) {
      toAnalyze.push(content);
    }
  }

  console.log(`   Analyzing ${toAnalyze.length} new items...`);

  if (toAnalyze.length > 0) {
    // Analyze in small batches
    const batchSize = 3;
    for (let i = 0; i < toAnalyze.length; i += batchSize) {
      const batch = toAnalyze.slice(i, i + batchSize);

      for (const content of batch) {
        try {
          const analysis = await analyzer.analyzeContent(content);
          await storage.saveAnalysis(analysis);
          console.log(`   ✅ ${content.title.substring(0, 50)}... [${analysis.threatLevel}]`);
        } catch (error) {
          console.error(`   ❌ Failed: ${error}`);
        }
      }

      // Rate limiting
      if (i + batchSize < toAnalyze.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  console.log('');

  // Step 3: Generate digest
  console.log('📊 Step 3: Generating weekly digest...');

  const generator = new DigestGenerator(storage, analyzer);
  const digest = await generator.generateWeeklyDigest();

  console.log('   ✅ Digest generated!\n');

  // Display summary
  const summary = await generator.generateDigestSummary(digest);
  console.log(summary);
  console.log('');

  // Export to markdown
  const { filePath } = await storage.exportDigestToMarkdown(digest);

  console.log(`\n📄 Markdown digest saved to: ${filePath}`);
  console.log('\n✨ Example complete!');
}

// Run the example
main().catch(console.error);
