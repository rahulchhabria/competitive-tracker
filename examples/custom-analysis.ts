/**
 * Custom analysis example
 *
 * Demonstrates how to:
 * - Perform targeted analysis on specific content
 * - Filter by threat level
 * - Group by product area
 * - Generate custom reports
 */

import {
  FileStorage,
  CompetitiveAnalyzer,
  type AnalysisResult,
  type ThreatLevel
} from '../src/index.js';

async function main() {
  console.log('🎯 Custom Analysis Example\n');

  // Initialize
  const storage = new FileStorage('./data');
  await storage.initialize();

  const analyzer = new CompetitiveAnalyzer({
    model: 'anthropic:claude-sonnet-4-20250514',
    temperature: 0.3
  });

  // Load all analyses
  const analyses = await storage.loadAllAnalyses();
  console.log(`📊 Loaded ${analyses.length} analyses\n`);

  // Filter by threat level
  console.log('🚨 Critical and High Threats:');
  const highThreats = analyses.filter(
    a => a.threatLevel === 'critical' || a.threatLevel === 'high'
  );

  for (const analysis of highThreats) {
    const content = await storage.loadContent(analysis.contentId);
    if (content) {
      console.log(`\n[${analysis.threatLevel.toUpperCase()}] ${content.competitor}`);
      console.log(`   ${content.title}`);
      console.log(`   ${analysis.competitiveImplications}`);
    }
  }
  console.log('');

  // Group by product area
  console.log('\n📦 Updates by Product Area:');
  const byProductArea = new Map<string, AnalysisResult[]>();

  for (const analysis of analyses) {
    for (const area of analysis.productAreas) {
      const existing = byProductArea.get(area) || [];
      existing.push(analysis);
      byProductArea.set(area, existing);
    }
  }

  for (const [area, items] of byProductArea) {
    console.log(`\n${area.toUpperCase()}: ${items.length} updates`);

    // Show top 3
    for (const analysis of items.slice(0, 3)) {
      console.log(`   - ${analysis.summary.substring(0, 80)}...`);
    }
  }

  // Analyze specific competitor
  console.log('\n\n🎯 Competitor Deep Dive:');
  const competitor = 'Notion'; // Change to your competitor
  const competitorContent = await storage.loadContentByCompetitor(competitor);

  console.log(`\n${competitor}: ${competitorContent.length} items`);

  const competitorAnalyses = await Promise.all(
    competitorContent.map(async c => await storage.loadAnalysis(c.id))
  );

  const validAnalyses = competitorAnalyses.filter(a => a !== null);

  if (validAnalyses.length > 0) {
    const threatDistribution = {
      critical: validAnalyses.filter(a => a!.threatLevel === 'critical').length,
      high: validAnalyses.filter(a => a!.threatLevel === 'high').length,
      medium: validAnalyses.filter(a => a!.threatLevel === 'medium').length,
      low: validAnalyses.filter(a => a!.threatLevel === 'low').length,
    };

    console.log('\nThreat Distribution:');
    console.log(`   🔴 Critical: ${threatDistribution.critical}`);
    console.log(`   🟠 High: ${threatDistribution.high}`);
    console.log(`   🟡 Medium: ${threatDistribution.medium}`);
    console.log(`   🟢 Low: ${threatDistribution.low}`);
  }

  // Extract all recommended actions
  console.log('\n\n💡 All Recommended Actions:');
  const allActions = analyses.flatMap(a =>
    a.recommendedActions.map(action => ({
      action,
      threat: a.threatLevel,
      contentId: a.contentId
    }))
  );

  // Group by threat level
  for (const level of ['critical', 'high', 'medium', 'low'] as ThreatLevel[]) {
    const levelActions = allActions.filter(a => a.threat === level);
    if (levelActions.length > 0) {
      console.log(`\n${level.toUpperCase()}:`);
      levelActions.slice(0, 5).forEach(({ action }) => {
        console.log(`   • ${action}`);
      });
    }
  }

  console.log('\n\n✨ Custom analysis complete!');
}

main().catch(console.error);
