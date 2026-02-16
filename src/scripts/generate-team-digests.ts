#!/usr/bin/env node

import 'dotenv/config';
import { TeamDigestGenerator } from '../digest/team-digest-generator.js';
import { CompetitiveAnalyzer } from '../analysis/analyzer.js';
import { FileStorage } from '../storage/file-storage.js';
import { loadConfig, validateConfig } from '../utils/config.js';
import { CancellationToken, setupSignalHandlers, CancellationError } from '../utils/cancellation.js';

async function main() {
  console.log('📊 Generating team-specific competitive digests...\n');
  console.log('💡 Press Ctrl+C to cancel at any time\n');

  // Setup cancellation support
  const cancellationToken = new CancellationToken();
  setupSignalHandlers(cancellationToken);

  try {
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

    const generator = new TeamDigestGenerator(storage, analyzer, cancellationToken);

    // Generate digests for current week
    await generator.generateTeamDigests(0);

    console.log('\n✨ Team digests generated successfully!');
    console.log('\nGenerated files:');
    console.log('  - data/digests/marketing/digest_YYYY-MM-DD.md');
    console.log('  - data/digests/sales/digest_YYYY-MM-DD.md');
    console.log('  - data/digests/product/digest_YYYY-MM-DD.md');
  } catch (error) {
    if (error instanceof CancellationError) {
      console.log('\n\n⚠️  Team digest generation cancelled by user.');
      console.log('✓ Partially completed work has been saved.');
      process.exit(130); // Standard exit code for SIGINT
    }
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
