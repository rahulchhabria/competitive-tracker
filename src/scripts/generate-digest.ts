#!/usr/bin/env node

import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { DigestGenerator } from '../digest/digest-generator.js';
import { CompetitiveAnalyzer } from '../analysis/analyzer.js';
import { FileStorage } from '../storage/file-storage.js';
import { loadConfig, validateConfig } from '../utils/config.js';
import { CancellationToken, setupSignalHandlers, CancellationError } from '../utils/cancellation.js';

async function main() {
  console.log('📊 Generating weekly competitive digest...\n');
  console.log('💡 Press Ctrl+C to cancel at any time\n');

  // Setup cancellation support
  const cancellationToken = new CancellationToken();
  setupSignalHandlers(cancellationToken);

  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const weekOffset = args.includes('--last-week') ? 1 : 0;
    const exportMarkdown = args.includes('--markdown') || args.includes('-md');

    // Load configuration
    const config = loadConfig();
    validateConfig(config);

    // Initialize components
    const storage = new FileStorage(config.dataDir);
    await storage.initialize();

    const analyzer = new CompetitiveAnalyzer({
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });

    const generator = new DigestGenerator(storage, analyzer, cancellationToken);

    // Generate digest
    console.log(`Generating digest for week ${weekOffset === 0 ? '(current)' : '(last week)'}...\n`);
    const digest = await generator.generateWeeklyDigest(weekOffset);

    // Display summary
    const summary = await generator.generateDigestSummary(digest);
    console.log(summary);
    console.log('\n');

    // Export to markdown if requested
    if (exportMarkdown) {
      const { filePath } = await storage.exportDigestToMarkdown(digest);
      console.log(`\n📄 Markdown digest exported to: ${filePath}`);
    }

    console.log('\n✨ Digest generation complete!');
  } catch (error) {
    if (error instanceof CancellationError) {
      console.log('\n\n⚠️  Digest generation cancelled by user.');
      console.log('✓ Partially completed work has been saved.');
      process.exit(130); // Standard exit code for SIGINT
    }
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
