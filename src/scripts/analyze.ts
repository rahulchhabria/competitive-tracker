#!/usr/bin/env node

import 'dotenv/config';
import { CompetitiveAnalyzer } from '../analysis/analyzer.js';
import { FileStorage } from '../storage/file-storage.js';
import { loadConfig, validateConfig } from '../utils/config.js';

async function main() {
  console.log('🤖 Starting content analysis...\n');

  try {
    // Load configuration
    const config = loadConfig();
    validateConfig(config);

    // Initialize storage
    const storage = new FileStorage(config.dataDir);
    await storage.initialize();

    // Initialize analyzer
    const analyzer = new CompetitiveAnalyzer({
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });

    // Load all content
    const allContent = await storage.loadAllContent();
    console.log(`📚 Found ${allContent.length} total content items`);

    // Filter content that hasn't been analyzed yet
    const unanalyzedContent = [];
    for (const content of allContent) {
      const existingAnalysis = await storage.loadAnalysis(content.id);
      if (!existingAnalysis) {
        unanalyzedContent.push(content);
      }
    }

    console.log(`🔍 ${unanalyzedContent.length} items need analysis\n`);

    if (unanalyzedContent.length === 0) {
      console.log('✨ All content is already analyzed!');
      return;
    }

    // Analyze content
    let analyzed = 0;
    let failed = 0;

    for (const content of unanalyzedContent) {
      try {
        console.log(`Analyzing: ${content.title.substring(0, 60)}...`);

        const analysis = await analyzer.analyzeContent(content);
        await storage.saveAnalysis(analysis);

        console.log(`   ✅ Threat level: ${analysis.threatLevel?.toUpperCase() || 'UNKNOWN'}`);
        console.log(`   📊 Product areas: ${analysis.productAreas?.join(', ') || 'none'}`);
        console.log('');

        analyzed++;

        // Rate limiting - wait 2 seconds between requests
        if (analyzed < unanalyzedContent.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`   ❌ Failed to analyze: ${error}`);
        console.log('');
        failed++;
      }
    }

    console.log(`\n✨ Analysis complete!`);
    console.log(`   ✅ Analyzed: ${analyzed}`);
    if (failed > 0) {
      console.log(`   ❌ Failed: ${failed}`);
    }
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
