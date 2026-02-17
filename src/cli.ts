#!/usr/bin/env node

import 'dotenv/config';
import prompts from 'prompts';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { promises as fs } from 'fs';
import { join } from 'path';
import { CompetitorConfig, CompanyProfile, CompanyProfileSchema } from './types/index.js';
import { RSSFetcher } from './ingestion/rss-fetcher.js';
import { FileStorage } from './storage/file-storage.js';
import { CompetitiveAnalyzer } from './analysis/analyzer.js';
import { DigestGenerator } from './digest/digest-generator.js';
import { TeamDigestGenerator } from './digest/team-digest-generator.js';
import { loadConfig, validateConfig } from './utils/config.js';
import { FeedDiscovery } from './utils/feed-discovery.js';
import { CompanyDiscovery } from './utils/company-discovery.js';
import { deduplicateByUrl } from './utils/helpers.js';
import { CancellationToken, setupSignalHandlers, CancellationError } from './utils/cancellation.js';

const COMPETITORS_FILE = join(process.cwd(), 'competitors.json');

interface CompetitorsData {
  competitors: CompetitorConfig[];
  myCompany?: CompanyProfile;
}

// --- Data helpers ---

function ensureCompetitorsFile(): void {
  if (!existsSync(COMPETITORS_FILE)) {
    const exampleFile = join(process.cwd(), 'competitors.example.json');
    if (existsSync(exampleFile)) {
      const content = readFileSync(exampleFile, 'utf-8');
      writeFileSync(COMPETITORS_FILE, content);
    } else {
      writeFileSync(COMPETITORS_FILE, JSON.stringify({ competitors: [] }, null, 2));
    }
  }
}

function loadCompetitors(): CompetitorsData {
  ensureCompetitorsFile();
  const content = readFileSync(COMPETITORS_FILE, 'utf-8');
  return JSON.parse(content);
}

function saveCompetitors(data: CompetitorsData): void {
  writeFileSync(COMPETITORS_FILE, JSON.stringify(data, null, 2));
}

function checkApiKey(): boolean {
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_key_here';
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_key_here';
  return hasAnthropicKey || hasOpenAIKey;
}

// --- Status / Overview ---

async function showStatus(): Promise<void> {
  const data = loadCompetitors();
  const enabledCount = data.competitors.filter(c => c.enabled).length;

  console.log('\n--- Status ---\n');
  console.log(`API key configured: ${checkApiKey() ? 'Yes' : 'No'}`);
  console.log(`Company profile:    ${data.myCompany ? data.myCompany.name : 'Not set'}`);
  console.log(`Competitors:        ${data.competitors.length} total, ${enabledCount} enabled`);

  // Check data directory
  const dataDir = process.env.DATA_DIR || './data';
  try {
    const contentDir = join(dataDir, 'content');
    const analysisDir = join(dataDir, 'analysis');
    const digestsDir = join(dataDir, 'digests', 'weekly');

    const contentFiles = existsSync(contentDir) ? (await fs.readdir(contentDir)).filter(f => f.endsWith('.json')) : [];
    const analysisFiles = existsSync(analysisDir) ? (await fs.readdir(analysisDir)).filter(f => f.endsWith('.json')) : [];
    const digestFiles = existsSync(digestsDir) ? (await fs.readdir(digestsDir)).filter(f => f.endsWith('.json')) : [];

    console.log(`\nContent items:      ${contentFiles.length}`);
    console.log(`Analyses:           ${analysisFiles.length}`);
    console.log(`Digests generated:  ${digestFiles.length}`);
  } catch {
    console.log('\nNo data directory found yet. Run a digest to create one.');
  }
  console.log('');
}

// --- Competitor Management ---

async function listCompetitors(): Promise<void> {
  const data = loadCompetitors();

  if (data.competitors.length === 0) {
    console.log('\nNo competitors configured yet. Add one to get started.\n');
    return;
  }

  console.log('\n--- Competitors ---\n');
  data.competitors.forEach((comp, index) => {
    const status = comp.enabled ? 'enabled' : 'disabled';
    console.log(`${index + 1}. ${comp.name} [${status}]`);
    console.log(`   Website: ${comp.websiteUrl || 'N/A'}`);
    console.log(`   Blog:    ${comp.blogUrl || 'N/A'}`);
    console.log(`   Feeds:   ${comp.feedUrls.length}`);
    comp.feedUrls.forEach(url => console.log(`            ${url}`));
    console.log('');
  });
}

async function addCompetitor(): Promise<void> {
  console.log('\n--- Add Competitor ---\n');

  const { mode } = await prompts({
    type: 'select',
    name: 'mode',
    message: 'How do you want to add the competitor?',
    choices: [
      { title: 'Auto-discover from domain (recommended)', value: 'auto' },
      { title: 'Enter details manually', value: 'manual' },
    ]
  });

  if (mode === undefined) return;

  if (mode === 'auto') {
    await addCompetitorAuto();
  } else {
    await addCompetitorManual();
  }
}

async function addCompetitorAuto(): Promise<void> {
  const answers = await prompts([
    {
      type: 'text',
      name: 'name',
      message: 'Competitor name:',
      validate: (v: string) => v.trim() ? true : 'Name is required'
    },
    {
      type: 'text',
      name: 'domain',
      message: 'Domain (e.g. linear.app):',
      validate: (v: string) => v.trim() ? true : 'Domain is required'
    }
  ]);

  if (!answers.name || !answers.domain) return;

  console.log(`\nDiscovering feeds for ${answers.domain}...`);

  const discovery = new FeedDiscovery();
  const discovered = await discovery.discoverFeeds(answers.domain);

  if (discovered.feedUrls.length === 0) {
    console.log(`\nNo RSS feeds found for ${answers.domain}.`);
    console.log('You can try adding the competitor manually with known feed URLs.\n');
    return;
  }

  console.log(`\nFound ${discovered.feedUrls.length} feed(s):`);
  discovered.feedUrls.forEach(url => console.log(`  ${url}`));

  const { confirm } = await prompts({
    type: 'confirm',
    name: 'confirm',
    message: `Add ${answers.name} with ${discovered.feedUrls.length} feed(s)?`,
    initial: true
  });

  if (!confirm) return;

  const data = loadCompetitors();
  data.competitors.push({
    name: answers.name.trim(),
    websiteUrl: discovered.websiteUrl,
    blogUrl: discovered.blogUrl,
    releaseNotesUrl: discovered.releaseNotesUrl,
    feedUrls: discovered.feedUrls,
    enabled: true
  });
  saveCompetitors(data);
  console.log(`\nAdded ${answers.name}.\n`);
}

async function addCompetitorManual(): Promise<void> {
  const answers = await prompts([
    {
      type: 'text',
      name: 'name',
      message: 'Competitor name:',
      validate: (v: string) => v.trim() ? true : 'Name is required'
    },
    {
      type: 'text',
      name: 'websiteUrl',
      message: 'Website URL:',
      validate: (v: string) => {
        if (!v.trim()) return 'URL is required';
        try { new URL(v); return true; } catch { return 'Invalid URL'; }
      }
    },
    {
      type: 'text',
      name: 'blogUrl',
      message: 'Blog URL (optional):',
      initial: ''
    },
    {
      type: 'list',
      name: 'feedUrls',
      message: 'RSS feed URLs (comma-separated):',
      separator: ',',
      validate: (v: string[]) => {
        if (v.length === 0) return 'At least one feed URL is required';
        for (const url of v) {
          try { new URL(url.trim()); } catch { return `Invalid URL: ${url}`; }
        }
        return true;
      }
    }
  ]);

  if (!answers.name) return;

  const data = loadCompetitors();
  data.competitors.push({
    name: answers.name.trim(),
    websiteUrl: answers.websiteUrl.trim(),
    blogUrl: answers.blogUrl?.trim() || undefined,
    feedUrls: answers.feedUrls.map((u: string) => u.trim()),
    enabled: true
  });
  saveCompetitors(data);
  console.log(`\nAdded ${answers.name}.\n`);
}

async function editCompetitor(): Promise<void> {
  const data = loadCompetitors();
  if (data.competitors.length === 0) {
    console.log('\nNo competitors to edit.\n');
    return;
  }

  const { index } = await prompts({
    type: 'select',
    name: 'index',
    message: 'Select competitor to edit:',
    choices: data.competitors.map((c, i) => ({
      title: `${c.name} [${c.enabled ? 'enabled' : 'disabled'}]`,
      value: i
    }))
  });

  if (index === undefined) return;

  const comp = data.competitors[index];
  const answers = await prompts([
    { type: 'text', name: 'name', message: 'Name:', initial: comp.name },
    { type: 'text', name: 'websiteUrl', message: 'Website URL:', initial: comp.websiteUrl || '' },
    { type: 'text', name: 'blogUrl', message: 'Blog URL:', initial: comp.blogUrl || '' },
    {
      type: 'list',
      name: 'feedUrls',
      message: 'RSS feed URLs (comma-separated):',
      initial: comp.feedUrls.join(', '),
      separator: ','
    }
  ]);

  if (!answers.name) return;

  data.competitors[index] = {
    name: answers.name.trim(),
    websiteUrl: answers.websiteUrl?.trim() || comp.websiteUrl,
    blogUrl: answers.blogUrl?.trim() || undefined,
    releaseNotesUrl: comp.releaseNotesUrl,
    feedUrls: answers.feedUrls.map((u: string) => u.trim()),
    enabled: comp.enabled
  };
  saveCompetitors(data);
  console.log(`\nUpdated ${answers.name}.\n`);
}

async function toggleCompetitor(): Promise<void> {
  const data = loadCompetitors();
  if (data.competitors.length === 0) {
    console.log('\nNo competitors to toggle.\n');
    return;
  }

  const { index } = await prompts({
    type: 'select',
    name: 'index',
    message: 'Select competitor to enable/disable:',
    choices: data.competitors.map((c, i) => ({
      title: `${c.enabled ? '[enabled]' : '[disabled]'} ${c.name}`,
      value: i
    }))
  });

  if (index === undefined) return;

  data.competitors[index].enabled = !data.competitors[index].enabled;
  saveCompetitors(data);
  const status = data.competitors[index].enabled ? 'enabled' : 'disabled';
  console.log(`\n${data.competitors[index].name} is now ${status}.\n`);
}

async function removeCompetitor(): Promise<void> {
  const data = loadCompetitors();
  if (data.competitors.length === 0) {
    console.log('\nNo competitors to remove.\n');
    return;
  }

  const { index } = await prompts({
    type: 'select',
    name: 'index',
    message: 'Select competitor to remove:',
    choices: data.competitors.map((c, i) => ({
      title: c.name,
      value: i
    }))
  });

  if (index === undefined) return;

  const { confirm } = await prompts({
    type: 'confirm',
    name: 'confirm',
    message: `Remove ${data.competitors[index].name}?`,
    initial: false
  });

  if (!confirm) return;

  const removed = data.competitors.splice(index, 1)[0];
  saveCompetitors(data);
  console.log(`\nRemoved ${removed.name}.\n`);
}

async function competitorsMenu(): Promise<void> {
  let running = true;
  while (running) {
    const { action } = await prompts({
      type: 'select',
      name: 'action',
      message: 'Competitors:',
      choices: [
        { title: 'List all', value: 'list' },
        { title: 'Add competitor', value: 'add' },
        { title: 'Edit competitor', value: 'edit' },
        { title: 'Enable/disable competitor', value: 'toggle' },
        { title: 'Remove competitor', value: 'remove' },
        { title: 'Back', value: 'back' }
      ]
    });

    switch (action) {
      case 'list': await listCompetitors(); break;
      case 'add': await addCompetitor(); break;
      case 'edit': await editCompetitor(); break;
      case 'toggle': await toggleCompetitor(); break;
      case 'remove': await removeCompetitor(); break;
      default: running = false;
    }
  }
}

// --- Company Profile ---

async function companyProfileMenu(): Promise<void> {
  const data = loadCompetitors();

  if (data.myCompany) {
    console.log('\n--- Company Profile ---\n');
    console.log(`Name:            ${data.myCompany.name}`);
    console.log(`Description:     ${data.myCompany.description || 'N/A'}`);
    console.log(`Products:        ${data.myCompany.products?.join(', ') || 'N/A'}`);
    console.log(`Target market:   ${data.myCompany.targetMarket || 'N/A'}`);
    console.log(`Differentiators: ${data.myCompany.differentiators?.join(', ') || 'N/A'}`);
    console.log('');
  } else {
    console.log('\nNo company profile set. This helps the AI tailor analysis to your competitive position.\n');
  }

  const { action } = await prompts({
    type: 'select',
    name: 'action',
    message: 'Company profile:',
    choices: [
      { title: 'Auto-discover from domain', value: 'discover' },
      { title: 'Set manually', value: 'manual' },
      ...(data.myCompany ? [{ title: 'Remove profile', value: 'remove' }] : []),
      { title: 'Back', value: 'back' }
    ]
  });

  if (action === 'discover') {
    const answers = await prompts([
      { type: 'text', name: 'name', message: 'Your company name:', validate: (v: string) => v.trim() ? true : 'Required' },
      { type: 'text', name: 'domain', message: 'Your domain (e.g. yourcompany.com):', validate: (v: string) => v.trim() ? true : 'Required' }
    ]);
    if (!answers.name) return;

    console.log('\nDiscovering company info...');
    const discovery = new CompanyDiscovery();
    const discovered = await discovery.discoverCompanyInfo(answers.domain, answers.name);

    console.log(`\nDiscovered:`);
    console.log(`  Description:     ${discovered.description || 'N/A'}`);
    console.log(`  Products:        ${discovered.products?.join(', ') || 'N/A'}`);
    console.log(`  Target market:   ${discovered.targetMarket || 'N/A'}`);
    console.log(`  Differentiators: ${discovered.differentiators?.join(', ') || 'N/A'}`);

    const { confirm } = await prompts({ type: 'confirm', name: 'confirm', message: 'Save this profile?', initial: true });
    if (confirm) {
      data.myCompany = discovered;
      saveCompetitors(data);
      console.log('\nProfile saved.\n');
    }
  } else if (action === 'manual') {
    const answers = await prompts([
      { type: 'text', name: 'name', message: 'Company name:', initial: data.myCompany?.name || '', validate: (v: string) => v.trim() ? true : 'Required' },
      { type: 'text', name: 'description', message: 'Description:', initial: data.myCompany?.description || '' },
      { type: 'list', name: 'products', message: 'Products (comma-separated):', initial: data.myCompany?.products?.join(', ') || '', separator: ',' },
      { type: 'text', name: 'targetMarket', message: 'Target market:', initial: data.myCompany?.targetMarket || '' },
      { type: 'list', name: 'differentiators', message: 'Differentiators (comma-separated):', initial: data.myCompany?.differentiators?.join(', ') || '', separator: ',' }
    ]);

    if (!answers.name) return;

    data.myCompany = {
      name: answers.name.trim(),
      description: answers.description?.trim() || undefined,
      products: answers.products?.map((p: string) => p.trim()).filter(Boolean) || undefined,
      targetMarket: answers.targetMarket?.trim() || undefined,
      differentiators: answers.differentiators?.map((d: string) => d.trim()).filter(Boolean) || undefined
    };
    saveCompetitors(data);
    console.log('\nProfile saved.\n');
  } else if (action === 'remove') {
    delete data.myCompany;
    saveCompetitors(data);
    console.log('\nProfile removed.\n');
  }
}

// --- Ingest ---

async function runIngest(): Promise<number> {
  console.log('\nFetching competitor content...\n');

  const config = loadConfig();
  const storage = new FileStorage(config.dataDir);
  await storage.initialize();

  const rssFetcher = new RSSFetcher();
  let totalIngested = 0;

  for (const competitor of config.competitors.filter(c => c.enabled)) {
    console.log(`Fetching from ${competitor.name}...`);

    for (const feedUrl of competitor.feedUrls) {
      try {
        const contents = await rssFetcher.fetchFeed(feedUrl, competitor.name);
        const unique = deduplicateByUrl(contents);

        const existing = await storage.loadContentByCompetitor(competitor.name);
        const existingUrls = new Set(existing.map(c => c.url));
        const newContents = unique.filter(c => !existingUrls.has(c.url));

        if (newContents.length > 0) {
          await storage.saveMultipleContents(newContents);
          totalIngested += newContents.length;
          console.log(`  ${newContents.length} new items ingested`);
          newContents.slice(0, 3).forEach(c => console.log(`    - ${c.title}`));
          if (newContents.length > 3) console.log(`    ... and ${newContents.length - 3} more`);
        } else {
          console.log('  No new content');
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.log(`  Failed: ${msg}`);
      }
    }
  }

  console.log(`\nIngestion complete. ${totalIngested} new items.\n`);
  return totalIngested;
}

// --- Analyze ---

async function runAnalyze(): Promise<number> {
  console.log('\nAnalyzing content with AI...\n');

  const config = loadConfig();
  const storage = new FileStorage(config.dataDir);
  await storage.initialize();

  const analyzer = new CompetitiveAnalyzer({
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    companyProfile: config.myCompany
  });

  const allContent = await storage.loadAllContent();
  console.log(`${allContent.length} total content items`);

  const unanalyzed = [];
  for (const content of allContent) {
    const has = await storage.analysisExists(content.id);
    if (!has) unanalyzed.push(content);
  }

  console.log(`${unanalyzed.length} items need analysis\n`);

  if (unanalyzed.length === 0) {
    console.log('All content already analyzed.\n');
    return 0;
  }

  let analyzed = 0;
  let failed = 0;

  for (const content of unanalyzed) {
    try {
      process.stdout.write(`Analyzing: ${content.title.substring(0, 60)}... `);
      const analysis = await analyzer.analyzeContent(content);
      await storage.saveAnalysis(analysis);
      console.log(`[${analysis.threatLevel.toUpperCase()}]`);
      analyzed++;

      if (analyzed < unanalyzed.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.log('[FAILED]');
      failed++;
    }
  }

  console.log(`\nAnalysis complete. ${analyzed} succeeded, ${failed} failed.\n`);
  return analyzed;
}

// --- Generate Digest ---

async function runDigest(): Promise<void> {
  const { weekChoice } = await prompts({
    type: 'select',
    name: 'weekChoice',
    message: 'Generate digest for:',
    choices: [
      { title: 'Current week', value: 0 },
      { title: 'Last week', value: 1 },
      { title: 'Custom date range', value: -1 }
    ]
  });

  if (weekChoice === undefined) return;

  const cancellationToken = new CancellationToken();
  setupSignalHandlers(cancellationToken);

  try {
    const config = loadConfig();
    validateConfig(config);

    const storage = new FileStorage(config.dataDir);
    await storage.initialize();

    const analyzer = new CompetitiveAnalyzer({
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      companyProfile: config.myCompany
    });

    if (weekChoice === -1) {
      // Custom date range: ingest + analyze + generate
      const dates = await prompts([
        { type: 'text', name: 'start', message: 'Start date (YYYY-MM-DD):', validate: (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) ? true : 'Use YYYY-MM-DD format' },
        { type: 'text', name: 'end', message: 'End date (YYYY-MM-DD):', validate: (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) ? true : 'Use YYYY-MM-DD format' }
      ]);
      if (!dates.start) return;

      console.log(`\nGenerating digest for ${dates.start} to ${dates.end}...\n`);

      // Ingest first
      await runIngest();

      // Filter and analyze
      let allContents = await storage.loadAllContent();
      const filterStart = new Date(dates.start);
      const filterEnd = new Date(dates.end);
      filterEnd.setHours(23, 59, 59, 999);

      allContents = allContents.filter(c => {
        const d = new Date(c.publishedAt);
        return d >= filterStart && d <= filterEnd;
      });

      console.log(`${allContents.length} items in date range`);

      const unanalyzed = [];
      for (const content of allContents) {
        const has = await storage.analysisExists(content.id);
        if (!has) unanalyzed.push(content);
      }

      if (unanalyzed.length > 0) {
        console.log(`Analyzing ${unanalyzed.length} items...\n`);
        const analyses = await analyzer.analyzeMultipleContents(unanalyzed);
        await storage.saveMultipleAnalyses(analyses);
      }

      // Generate
      const generator = new DigestGenerator(storage, analyzer, cancellationToken);
      const digest = await generator.generateWeeklyDigest(0);
      const { filePath } = await storage.exportDigestToMarkdown(digest);
      const summary = await generator.generateDigestSummary(digest);

      console.log(`\n${summary}`);
      console.log(`\nDigest saved to: ${filePath}\n`);
    } else {
      // Standard week-based digest
      console.log(`\nRunning full pipeline (ingest -> analyze -> digest)...\n`);
      console.log('Press Ctrl+C to cancel.\n');

      // Ingest
      await runIngest();

      cancellationToken.throwIfCancelled();

      // Analyze
      await runAnalyze();

      cancellationToken.throwIfCancelled();

      // Generate digest
      console.log('Generating digest...\n');
      const generator = new DigestGenerator(storage, analyzer, cancellationToken);
      const digest = await generator.generateWeeklyDigest(weekChoice);
      const { filePath } = await storage.exportDigestToMarkdown(digest);
      const summary = await generator.generateDigestSummary(digest);

      console.log(summary);
      console.log(`\nDigest saved to: ${filePath}\n`);
    }
  } catch (error) {
    if (error instanceof CancellationError) {
      console.log('\nCancelled. Partial work has been saved.\n');
    } else {
      console.error('\nError:', error instanceof Error ? error.message : error);
    }
  }
}

// --- Team Digests ---

async function runTeamDigests(): Promise<void> {
  const cancellationToken = new CancellationToken();
  setupSignalHandlers(cancellationToken);

  try {
    const config = loadConfig();
    validateConfig(config);

    const storage = new FileStorage(config.dataDir);
    await storage.initialize();

    const analyzer = new CompetitiveAnalyzer({
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      companyProfile: config.myCompany
    });

    console.log('\nGenerating team-specific digests...\n');
    console.log('Press Ctrl+C to cancel.\n');

    const generator = new TeamDigestGenerator(storage, analyzer, cancellationToken);
    await generator.generateTeamDigests(0);

    console.log('\nTeam digests generated.\n');
  } catch (error) {
    if (error instanceof CancellationError) {
      console.log('\nCancelled. Partial work has been saved.\n');
    } else {
      console.error('\nError:', error instanceof Error ? error.message : error);
    }
  }
}

// --- View Digests ---

async function viewDigests(): Promise<void> {
  const dataDir = process.env.DATA_DIR || './data';
  const digestsDir = join(dataDir, 'digests', 'weekly');

  try {
    const files = (await fs.readdir(digestsDir))
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse();

    if (files.length === 0) {
      console.log('\nNo digests found. Run a digest first.\n');
      return;
    }

    const { file } = await prompts({
      type: 'select',
      name: 'file',
      message: 'Select a digest to view:',
      choices: files.map(f => ({
        title: f.replace('digest_', '').replace('.md', ''),
        value: f
      }))
    });

    if (!file) return;

    const content = await fs.readFile(join(digestsDir, file), 'utf-8');
    console.log(`\n${content}`);

    // Offer to copy path
    const fullPath = join(process.cwd(), digestsDir, file);
    console.log(`\nFile: ${fullPath}\n`);
  } catch {
    console.log('\nNo digests directory found. Run a digest first.\n');
  }
}

// --- Main Menu ---

function showSplash(): void {
  const splash = `
\x1b[36m  ____  _            _
 |  _ \\(_)_   ____ _| |
 | |_) | \\ \\ / / _\` | |
 |  _ <| |\\ V / (_| | |
 |_| \\_\\_| \\_/ \\__,_|_|\x1b[0m
\x1b[2m
  AI-powered competitive intelligence from your terminal.\x1b[0m
`;
  console.log(splash);
}

async function main(): Promise<void> {
  showSplash();

  if (!checkApiKey()) {
    console.log('  \x1b[33mWarning:\x1b[0m No API key configured.');
    console.log('  Add ANTHROPIC_API_KEY or OPENAI_API_KEY to your .env file.\n');
  }

  let running = true;

  while (running) {
    const { action } = await prompts({
      type: 'select',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { title: 'Status overview', value: 'status' },
        { title: 'Manage competitors', value: 'competitors' },
        { title: 'Company profile', value: 'profile' },
        { title: 'Generate digest (full pipeline)', value: 'digest' },
        { title: 'Generate team digests', value: 'team-digests' },
        { title: 'Ingest content only', value: 'ingest' },
        { title: 'Analyze content only', value: 'analyze' },
        { title: 'View past digests', value: 'view' },
        { title: 'Exit', value: 'exit' }
      ]
    });

    switch (action) {
      case 'status': await showStatus(); break;
      case 'competitors': await competitorsMenu(); break;
      case 'profile': await companyProfileMenu(); break;
      case 'digest': await runDigest(); break;
      case 'team-digests': await runTeamDigests(); break;
      case 'ingest': await runIngest(); break;
      case 'analyze': await runAnalyze(); break;
      case 'view': await viewDigests(); break;
      case 'exit':
        running = false;
        console.log('');
        break;
      default:
        running = false;
    }
  }
}

main().catch(console.error);
