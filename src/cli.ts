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
import { exec } from 'child_process';
import { startServer } from './web/server.js';

// ─── Styling ────────────────────────────────────────────────────────────────

const S = {
  // Colors
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  italic:  '\x1b[3m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  magenta: '\x1b[35m',
  blue:    '\x1b[34m',
  white:   '\x1b[37m',
  gray:    '\x1b[90m',
  bgCyan:  '\x1b[46m\x1b[30m',
  bgGreen: '\x1b[42m\x1b[30m',
  bgYellow:'\x1b[43m\x1b[30m',
  bgRed:   '\x1b[41m\x1b[97m',

  // Box-drawing
  bar:     '\x1b[90m│\x1b[0m',
  end:     '\x1b[90m└\x1b[0m',
  dash:    '\x1b[90m─\x1b[0m',
  corner:  '\x1b[90m┌\x1b[0m',
  tee:     '\x1b[90m├\x1b[0m',
};

function badge(text: string, color: string): string {
  return `${color} ${text} ${S.reset}`;
}

function label(key: string, value: string, color: string = S.white): string {
  return `${S.bar}  ${S.dim}${key.padEnd(14)}${S.reset}${color}${value}${S.reset}`;
}

function header(text: string): void {
  console.log(`\n${S.corner}  ${S.cyan}${S.bold}${text}${S.reset}`);
  console.log(S.bar);
}

function footer(text?: string): void {
  if (text) {
    console.log(S.bar);
    console.log(`${S.end}  ${S.dim}${text}${S.reset}\n`);
  } else {
    console.log(`${S.end}\n`);
  }
}

function success(text: string): void {
  console.log(`${S.bar}  ${S.green}✓${S.reset} ${text}`);
}

function warn(text: string): void {
  console.log(`${S.bar}  ${S.yellow}▲${S.reset} ${text}`);
}

function fail(text: string): void {
  console.log(`${S.bar}  ${S.red}✗${S.reset} ${text}`);
}

function info(text: string): void {
  console.log(`${S.bar}  ${S.cyan}●${S.reset} ${text}`);
}

function step(current: number, total: number, text: string): void {
  console.log(`\n${S.bar}  ${S.cyan}[${current}/${total}]${S.reset} ${S.bold}${text}${S.reset}`);
}

function note(text: string): void {
  console.log(`${S.bar}  ${S.dim}${text}${S.reset}`);
}

// Spinner for async operations
class Spinner {
  private frames = ['◒', '◐', '◓', '◑'];
  private interval: ReturnType<typeof setInterval> | null = null;
  private frameIndex = 0;
  private text: string;

  constructor(text: string) {
    this.text = text;
  }

  start(): void {
    process.stdout.write(`${S.bar}  ${S.cyan}${this.frames[0]}${S.reset} ${this.text}`);
    this.interval = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      process.stdout.write(`\r${S.bar}  ${S.cyan}${this.frames[this.frameIndex]}${S.reset} ${this.text}`);
    }, 100);
  }

  stop(result: string): void {
    if (this.interval) clearInterval(this.interval);
    process.stdout.write(`\r${S.bar}  ${S.green}✓${S.reset} ${this.text} ${S.dim}${result}${S.reset}\n`);
  }

  fail(result: string): void {
    if (this.interval) clearInterval(this.interval);
    process.stdout.write(`\r${S.bar}  ${S.red}✗${S.reset} ${this.text} ${S.dim}${result}${S.reset}\n`);
  }
}

function threatBadge(level: string): string {
  switch (level) {
    case 'critical': return badge('CRIT', S.bgRed);
    case 'high':     return badge('HIGH', S.bgYellow);
    case 'medium':   return badge(' MED', S.bgCyan);
    case 'low':      return badge(' LOW', S.bgGreen);
    default:         return badge(' ?? ', S.dim);
  }
}

// ─── Data Helpers ───────────────────────────────────────────────────────────

const COMPETITORS_FILE = join(process.cwd(), 'competitors.json');

interface CompetitorsData {
  competitors: CompetitorConfig[];
  myCompany?: CompanyProfile;
}

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

function checkApiKey(): { configured: boolean; provider: string } {
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_key_here';
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_key_here';
  return {
    configured: hasAnthropicKey || hasOpenAIKey,
    provider: hasAnthropicKey ? 'Anthropic' : hasOpenAIKey ? 'OpenAI' : 'none',
  };
}

// ─── Status ─────────────────────────────────────────────────────────────────

async function showStatus(): Promise<void> {
  const data = loadCompetitors();
  const api = checkApiKey();
  const enabledCount = data.competitors.filter(c => c.enabled).length;

  header('Dashboard');

  // API key
  if (api.configured) {
    console.log(label('API Key', api.provider, S.green));
  } else {
    console.log(label('API Key', 'not configured', S.red));
  }

  // Company profile
  if (data.myCompany) {
    console.log(label('Profile', data.myCompany.name, S.green));
  } else {
    console.log(label('Profile', 'not set', S.dim));
  }

  // Competitors
  if (data.competitors.length > 0) {
    console.log(label('Competitors', `${data.competitors.length} tracked, ${enabledCount} enabled`));
  } else {
    console.log(label('Competitors', 'none', S.dim));
  }

  // Data stats
  const dataDir = process.env.DATA_DIR || './data';
  try {
    const contentDir = join(dataDir, 'content');
    const analysisDir = join(dataDir, 'analysis');
    const digestsDir = join(dataDir, 'digests', 'weekly');

    const contentFiles = existsSync(contentDir) ? (await fs.readdir(contentDir)).filter((f: string) => f.endsWith('.json')) : [];
    const analysisFiles = existsSync(analysisDir) ? (await fs.readdir(analysisDir)).filter((f: string) => f.endsWith('.json')) : [];
    const digestFiles = existsSync(digestsDir) ? (await fs.readdir(digestsDir)).filter((f: string) => f.endsWith('.json')) : [];

    console.log(S.bar);
    console.log(label('Content', `${contentFiles.length} articles`));
    console.log(label('Analyses', `${analysisFiles.length} complete`));
    console.log(label('Digests', `${digestFiles.length} generated`));
  } catch {
    console.log(S.bar);
    note('No data yet. Run a digest to get started.');
  }

  if (!api.configured) {
    console.log(S.bar);
    warn(`Add ${S.bold}ANTHROPIC_API_KEY${S.reset}${S.yellow} or ${S.bold}OPENAI_API_KEY${S.reset}${S.yellow} to .env${S.reset}`);
  }

  footer();
}

// ─── Competitor Management ──────────────────────────────────────────────────

async function listCompetitors(): Promise<void> {
  const data = loadCompetitors();

  if (data.competitors.length === 0) {
    header('Competitors');
    note('No competitors configured yet.');
    note(`Select ${S.reset}${S.bold}Add competitor${S.reset}${S.dim} to get started.`);
    footer();
    return;
  }

  header('Competitors');
  data.competitors.forEach((comp, index) => {
    const status = comp.enabled
      ? `${S.green}● enabled${S.reset}`
      : `${S.dim}○ disabled${S.reset}`;
    console.log(`${S.bar}  ${S.bold}${index + 1}. ${comp.name}${S.reset}  ${status}`);
    console.log(`${S.bar}     ${S.dim}${comp.websiteUrl || 'no url'}${S.reset}  ${S.dim}${comp.feedUrls.length} feed${comp.feedUrls.length !== 1 ? 's' : ''}${S.reset}`);
  });
  footer();
}

async function addCompetitor(): Promise<void> {
  header('Add Competitor');
  console.log(S.bar);

  const { mode } = await prompts({
    type: 'select',
    name: 'mode',
    message: 'How do you want to add the competitor?',
    choices: [
      { title: 'Auto-discover from domain', description: 'Finds RSS feeds automatically', value: 'auto' },
      { title: 'Enter details manually', description: 'Provide feed URLs yourself', value: 'manual' },
    ]
  });

  if (mode === undefined) { footer(); return; }

  if (mode === 'auto') {
    await addCompetitorAuto();
  } else {
    await addCompetitorManual();
  }
  footer();
}

async function addCompetitorAuto(): Promise<void> {
  const answers = await prompts([
    {
      type: 'text',
      name: 'name',
      message: 'Competitor name',
      validate: (v: string) => v.trim() ? true : 'Name is required'
    },
    {
      type: 'text',
      name: 'domain',
      message: 'Domain (e.g. linear.app)',
      validate: (v: string) => v.trim() ? true : 'Domain is required'
    }
  ]);

  if (!answers.name || !answers.domain) return;

  const spinner = new Spinner(`Discovering feeds for ${S.bold}${answers.domain}${S.reset}`);
  spinner.start();

  const discovery = new FeedDiscovery();
  const discovered = await discovery.discoverFeeds(answers.domain);

  if (discovered.feedUrls.length === 0) {
    spinner.fail('no feeds found');
    note('Try adding the competitor manually with known feed URLs.');
    return;
  }

  spinner.stop(`${discovered.feedUrls.length} feed${discovered.feedUrls.length !== 1 ? 's' : ''} found`);
  discovered.feedUrls.forEach(url => note(`  ${url}`));
  console.log(S.bar);

  const { confirm } = await prompts({
    type: 'confirm',
    name: 'confirm',
    message: `Add ${answers.name}?`,
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
  success(`Added ${S.bold}${answers.name}${S.reset}`);
}

async function addCompetitorManual(): Promise<void> {
  const answers = await prompts([
    {
      type: 'text',
      name: 'name',
      message: 'Competitor name',
      validate: (v: string) => v.trim() ? true : 'Name is required'
    },
    {
      type: 'text',
      name: 'websiteUrl',
      message: 'Website URL',
      validate: (v: string) => {
        if (!v.trim()) return 'URL is required';
        try { new URL(v); return true; } catch { return 'Invalid URL'; }
      }
    },
    {
      type: 'text',
      name: 'blogUrl',
      message: 'Blog URL (optional)',
      initial: ''
    },
    {
      type: 'list',
      name: 'feedUrls',
      message: 'RSS feed URLs (comma-separated)',
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
  success(`Added ${S.bold}${answers.name}${S.reset}`);
}

async function editCompetitor(): Promise<void> {
  const data = loadCompetitors();
  if (data.competitors.length === 0) {
    header('Edit Competitor');
    note('No competitors to edit.');
    footer();
    return;
  }

  const { index } = await prompts({
    type: 'select',
    name: 'index',
    message: 'Select competitor to edit',
    choices: data.competitors.map((c, i) => ({
      title: `${c.name}`,
      description: c.enabled ? 'enabled' : 'disabled',
      value: i
    }))
  });

  if (index === undefined) return;

  const comp = data.competitors[index];
  const answers = await prompts([
    { type: 'text', name: 'name', message: 'Name', initial: comp.name },
    { type: 'text', name: 'websiteUrl', message: 'Website URL', initial: comp.websiteUrl || '' },
    { type: 'text', name: 'blogUrl', message: 'Blog URL', initial: comp.blogUrl || '' },
    {
      type: 'list',
      name: 'feedUrls',
      message: 'RSS feed URLs (comma-separated)',
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
  success(`Updated ${S.bold}${answers.name}${S.reset}`);
}

async function toggleCompetitor(): Promise<void> {
  const data = loadCompetitors();
  if (data.competitors.length === 0) return;

  const { index } = await prompts({
    type: 'select',
    name: 'index',
    message: 'Select competitor to toggle',
    choices: data.competitors.map((c, i) => ({
      title: c.name,
      description: c.enabled ? '● enabled' : '○ disabled',
      value: i
    }))
  });

  if (index === undefined) return;

  data.competitors[index].enabled = !data.competitors[index].enabled;
  saveCompetitors(data);
  const status = data.competitors[index].enabled ? 'enabled' : 'disabled';
  success(`${S.bold}${data.competitors[index].name}${S.reset} is now ${status}`);
}

async function removeCompetitor(): Promise<void> {
  const data = loadCompetitors();
  if (data.competitors.length === 0) return;

  const { index } = await prompts({
    type: 'select',
    name: 'index',
    message: 'Select competitor to remove',
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
  success(`Removed ${S.bold}${removed.name}${S.reset}`);
}

async function competitorsMenu(): Promise<void> {
  let running = true;
  while (running) {
    const { action } = await prompts({
      type: 'select',
      name: 'action',
      message: 'Competitors',
      choices: [
        { title: 'List all', value: 'list' },
        { title: 'Add competitor', value: 'add' },
        { title: 'Edit competitor', value: 'edit' },
        { title: 'Enable/disable', value: 'toggle' },
        { title: 'Remove', value: 'remove' },
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

// ─── Company Profile ────────────────────────────────────────────────────────

async function companyProfileMenu(): Promise<void> {
  const data = loadCompetitors();

  if (data.myCompany) {
    header('Company Profile');
    console.log(label('Name', data.myCompany.name, S.bold));
    console.log(label('Description', data.myCompany.description || S.dim + 'not set'));
    console.log(label('Products', data.myCompany.products?.join(', ') || S.dim + 'not set'));
    console.log(label('Market', data.myCompany.targetMarket || S.dim + 'not set'));
    console.log(label('Strengths', data.myCompany.differentiators?.join(', ') || S.dim + 'not set'));
    footer();
  } else {
    header('Company Profile');
    note('No profile set. Setting one helps the AI tailor');
    note('analysis to your specific competitive position.');
    footer();
  }

  const { action } = await prompts({
    type: 'select',
    name: 'action',
    message: 'Company profile',
    choices: [
      { title: 'Auto-discover from domain', description: 'AI extracts info from your website', value: 'discover' },
      { title: 'Set manually', value: 'manual' },
      ...(data.myCompany ? [{ title: 'Remove profile', value: 'remove' }] : []),
      { title: 'Back', value: 'back' }
    ]
  });

  if (action === 'discover') {
    const answers = await prompts([
      { type: 'text', name: 'name', message: 'Your company name', validate: (v: string) => v.trim() ? true : 'Required' },
      { type: 'text', name: 'domain', message: 'Your domain (e.g. yourcompany.com)', validate: (v: string) => v.trim() ? true : 'Required' }
    ]);
    if (!answers.name) return;

    const spinner = new Spinner(`Analyzing ${S.bold}${answers.domain}${S.reset}`);
    spinner.start();

    const discovery = new CompanyDiscovery();
    const discovered = await discovery.discoverCompanyInfo(answers.domain, answers.name);
    spinner.stop('done');

    header('Discovered Profile');
    console.log(label('Description', discovered.description || 'N/A'));
    console.log(label('Products', discovered.products?.join(', ') || 'N/A'));
    console.log(label('Market', discovered.targetMarket || 'N/A'));
    console.log(label('Strengths', discovered.differentiators?.join(', ') || 'N/A'));
    footer();

    const { confirm } = await prompts({ type: 'confirm', name: 'confirm', message: 'Save this profile?', initial: true });
    if (confirm) {
      data.myCompany = discovered;
      saveCompetitors(data);
      success('Profile saved');
    }
  } else if (action === 'manual') {
    const answers = await prompts([
      { type: 'text', name: 'name', message: 'Company name', initial: data.myCompany?.name || '', validate: (v: string) => v.trim() ? true : 'Required' },
      { type: 'text', name: 'description', message: 'Description', initial: data.myCompany?.description || '' },
      { type: 'list', name: 'products', message: 'Products (comma-separated)', initial: data.myCompany?.products?.join(', ') || '', separator: ',' },
      { type: 'text', name: 'targetMarket', message: 'Target market', initial: data.myCompany?.targetMarket || '' },
      { type: 'list', name: 'differentiators', message: 'Differentiators (comma-separated)', initial: data.myCompany?.differentiators?.join(', ') || '', separator: ',' }
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
    success('Profile saved');
  } else if (action === 'remove') {
    delete data.myCompany;
    saveCompetitors(data);
    success('Profile removed');
  }
}

// ─── Ingest ─────────────────────────────────────────────────────────────────

async function runIngest(): Promise<number> {
  step(1, 3, 'Ingest');

  const config = loadConfig();
  const storage = new FileStorage(config.dataDir);
  await storage.initialize();

  const rssFetcher = new RSSFetcher();
  let totalIngested = 0;
  const enabledCompetitors = config.competitors.filter(c => c.enabled);

  for (const competitor of enabledCompetitors) {
    const spinner = new Spinner(`Fetching ${S.bold}${competitor.name}${S.reset}`);
    spinner.start();

    let competitorIngested = 0;

    for (const feedUrl of competitor.feedUrls) {
      try {
        const contents = await rssFetcher.fetchFeed(feedUrl, competitor.name);
        const unique = deduplicateByUrl(contents);

        const existing = await storage.loadContentByCompetitor(competitor.name);
        const existingUrls = new Set(existing.map(c => c.url));
        const newContents = unique.filter(c => !existingUrls.has(c.url));

        if (newContents.length > 0) {
          await storage.saveMultipleContents(newContents);
          competitorIngested += newContents.length;
          totalIngested += newContents.length;
        }
      } catch (error) {
        // continue to next feed
      }
    }

    if (competitorIngested > 0) {
      spinner.stop(`${competitorIngested} new article${competitorIngested !== 1 ? 's' : ''}`);
    } else {
      spinner.stop('up to date');
    }
  }

  if (totalIngested > 0) {
    success(`${S.bold}${totalIngested}${S.reset} new article${totalIngested !== 1 ? 's' : ''} ingested`);
  } else {
    note('No new content found');
  }

  return totalIngested;
}

// ─── Analyze ────────────────────────────────────────────────────────────────

async function runAnalyze(): Promise<number> {
  step(2, 3, 'Analyze');

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
  const unanalyzed = [];
  for (const content of allContent) {
    const has = await storage.analysisExists(content.id);
    if (!has) unanalyzed.push(content);
  }

  if (unanalyzed.length === 0) {
    note(`All ${allContent.length} articles already analyzed`);
    return 0;
  }

  info(`${unanalyzed.length} article${unanalyzed.length !== 1 ? 's' : ''} to analyze`);

  let analyzed = 0;
  let failed = 0;

  for (const content of unanalyzed) {
    const title = content.title.length > 50
      ? content.title.substring(0, 50) + '...'
      : content.title;
    const spinner = new Spinner(`${S.dim}${title}${S.reset}`);
    spinner.start();

    try {
      const analysis = await analyzer.analyzeContent(content);
      await storage.saveAnalysis(analysis);
      spinner.stop(threatBadge(analysis.threatLevel));
      analyzed++;

      if (analyzed < unanalyzed.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      spinner.fail('error');
      failed++;
    }
  }

  if (analyzed > 0) success(`${S.bold}${analyzed}${S.reset} article${analyzed !== 1 ? 's' : ''} analyzed`);
  if (failed > 0) warn(`${failed} failed`);

  return analyzed;
}

// ─── Generate Digest ────────────────────────────────────────────────────────

async function runDigest(): Promise<void> {
  const { weekChoice } = await prompts({
    type: 'select',
    name: 'weekChoice',
    message: 'Generate digest for',
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
      const dates = await prompts([
        { type: 'text', name: 'start', message: 'Start date (YYYY-MM-DD)', validate: (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) ? true : 'Use YYYY-MM-DD format' },
        { type: 'text', name: 'end', message: 'End date (YYYY-MM-DD)', validate: (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) ? true : 'Use YYYY-MM-DD format' }
      ]);
      if (!dates.start) return;

      header(`Digest ${S.dim}${dates.start} → ${dates.end}${S.reset}`);
      note('Press Ctrl+C to cancel');
      console.log(S.bar);

      await runIngest();

      let allContents = await storage.loadAllContent();
      const filterStart = new Date(dates.start);
      const filterEnd = new Date(dates.end);
      filterEnd.setHours(23, 59, 59, 999);

      allContents = allContents.filter(c => {
        const d = new Date(c.publishedAt);
        return d >= filterStart && d <= filterEnd;
      });

      info(`${allContents.length} articles in date range`);

      const unanalyzed = [];
      for (const content of allContents) {
        const has = await storage.analysisExists(content.id);
        if (!has) unanalyzed.push(content);
      }

      if (unanalyzed.length > 0) {
        await runAnalyze();
      }

      step(3, 3, 'Generate');
      const spinner = new Spinner('Composing digest');
      spinner.start();

      const generator = new DigestGenerator(storage, analyzer, cancellationToken);
      const digest = await generator.generateWeeklyDigest(0);
      const { filePath } = await storage.exportDigestToMarkdown(digest);
      spinner.stop('done');

      printDigestSummary(digest);
      console.log(S.bar);
      success(`Saved to ${S.bold}${filePath}${S.reset}`);
      footer();
    } else {
      const label = weekChoice === 0 ? 'this week' : 'last week';
      header(`Digest ${S.dim}${label}${S.reset}`);
      note('Press Ctrl+C to cancel');
      console.log(S.bar);

      await runIngest();

      cancellationToken.throwIfCancelled();

      await runAnalyze();

      cancellationToken.throwIfCancelled();

      step(3, 3, 'Generate');
      const spinner = new Spinner('Composing digest');
      spinner.start();

      const generator = new DigestGenerator(storage, analyzer, cancellationToken);
      const digest = await generator.generateWeeklyDigest(weekChoice);
      const { filePath } = await storage.exportDigestToMarkdown(digest);
      spinner.stop('done');

      printDigestSummary(digest);
      console.log(S.bar);
      success(`Saved to ${S.bold}${filePath}${S.reset}`);
      footer();
    }
  } catch (error) {
    if (error instanceof CancellationError) {
      console.log('');
      warn('Cancelled. Partial work has been saved.');
      footer();
    } else {
      fail(error instanceof Error ? error.message : String(error));
      footer();
    }
  }
}

function printDigestSummary(digest: import('./types/index.js').WeeklyDigest): void {
  const critical = digest.criticalThreats.length;
  const high = digest.entries.filter(e => e.analysis.threatLevel === 'high').length;
  const medium = digest.entries.filter(e => e.analysis.threatLevel === 'medium').length;
  const low = digest.entries.filter(e => e.analysis.threatLevel === 'low').length;

  console.log(S.bar);
  console.log(`${S.bar}  ${S.bold}Results${S.reset}`);
  console.log(`${S.bar}  ${S.dim}${digest.entries.length} updates across ${new Set(digest.entries.map(e => e.competitor)).size} competitors${S.reset}`);
  console.log(S.bar);

  if (critical > 0) console.log(`${S.bar}  ${threatBadge('critical')} ${critical} critical`);
  if (high > 0)     console.log(`${S.bar}  ${threatBadge('high')} ${high} high`);
  if (medium > 0)   console.log(`${S.bar}  ${threatBadge('medium')} ${medium} medium`);
  if (low > 0)      console.log(`${S.bar}  ${threatBadge('low')} ${low} low`);

  if (digest.topTrends.length > 0) {
    console.log(S.bar);
    console.log(`${S.bar}  ${S.bold}Trends${S.reset}`);
    digest.topTrends.forEach(trend => {
      console.log(`${S.bar}  ${S.dim}→${S.reset} ${trend}`);
    });
  }
}

// ─── Team Digests ───────────────────────────────────────────────────────────

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

    header('Team Digests');
    note('Press Ctrl+C to cancel');
    console.log(S.bar);

    const teams = ['marketing', 'sales', 'product'];
    const spinner = new Spinner('Generating team-specific digests');
    spinner.start();

    const generator = new TeamDigestGenerator(storage, analyzer, cancellationToken);
    await generator.generateTeamDigests(0);

    spinner.stop(`${teams.length} digests generated`);
    teams.forEach(team => {
      note(`  data/digests/${team}/`);
    });

    footer();
  } catch (error) {
    if (error instanceof CancellationError) {
      warn('Cancelled. Partial work has been saved.');
      footer();
    } else {
      fail(error instanceof Error ? error.message : String(error));
      footer();
    }
  }
}

// ─── View Digests ───────────────────────────────────────────────────────────

async function viewDigests(): Promise<void> {
  const dataDir = process.env.DATA_DIR || './data';
  const digestsDir = join(dataDir, 'digests', 'weekly');

  try {
    const files = (await fs.readdir(digestsDir))
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse();

    if (files.length === 0) {
      header('Digests');
      note('No digests found. Generate one first.');
      footer();
      return;
    }

    const { file } = await prompts({
      type: 'select',
      name: 'file',
      message: 'Select a digest to view',
      choices: files.map(f => ({
        title: f.replace('digest_', 'Week of ').replace('.md', ''),
        value: f
      }))
    });

    if (!file) return;

    const content = await fs.readFile(join(digestsDir, file), 'utf-8');
    console.log(`\n${content}`);

    const fullPath = join(process.cwd(), digestsDir, file);
    console.log(`${S.dim}${fullPath}${S.reset}\n`);
  } catch {
    header('Digests');
    note('No digests directory found. Generate a digest first.');
    footer();
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

function showSplash(): void {
  console.log(`
${S.cyan}${S.bold}  ____  _            _
 |  _ \\(_)_   ____ _| |
 | |_) | \\ \\ / / _\` | |
 |  _ <| |\\ V / (_| | |
 |_| \\_\\_| \\_/ \\__,_|_|${S.reset}  ${S.dim}v2.0.0${S.reset}
`);
}

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start'
    : 'xdg-open';
  exec(`${cmd} ${url}`);
}

async function launchUI(): Promise<void> {
  const port = parseInt(process.env.PORT || '3000', 10);

  showSplash();
  header('Web Dashboard');
  info(`Starting server on port ${S.bold}${port}${S.reset}`);
  success(`${S.bold}http://localhost:${port}${S.reset}`);
  console.log(S.bar);
  note('Press Ctrl+C to stop');
  footer();

  openBrowser(`http://localhost:${port}`);
  await startServer(port);
}

async function main(): Promise<void> {
  // Handle --ui flag
  const args = process.argv.slice(2);
  if (args.includes('--ui') || args.includes('-ui')) {
    return launchUI();
  }

  showSplash();

  const api = checkApiKey();
  if (!api.configured) {
    console.log(`  ${S.yellow}▲${S.reset} No API key configured`);
    console.log(`  ${S.dim}Add ANTHROPIC_API_KEY or OPENAI_API_KEY to .env${S.reset}\n`);
  }

  let running = true;

  while (running) {
    const { action } = await prompts({
      type: 'select',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { title: 'Dashboard', description: 'View status and stats', value: 'status' },
        { title: 'Generate digest', description: 'Run the full pipeline', value: 'digest' },
        { title: 'View past digests', description: 'Read generated reports', value: 'view' },
        { title: 'Competitors', description: 'Add, edit, or remove competitors', value: 'competitors' },
        { title: 'Company profile', description: 'Set your company context', value: 'profile' },
        { title: 'Team digests', description: 'Marketing, sales, product reports', value: 'team-digests' },
        { title: `${S.dim}Ingest only${S.reset}`, description: 'Fetch content without analyzing', value: 'ingest' },
        { title: `${S.dim}Analyze only${S.reset}`, description: 'Analyze without generating digest', value: 'analyze' },
        { title: `${S.dim}Exit${S.reset}`, value: 'exit' }
      ]
    });

    switch (action) {
      case 'status': await showStatus(); break;
      case 'competitors': await competitorsMenu(); break;
      case 'profile': await companyProfileMenu(); break;
      case 'digest': await runDigest(); break;
      case 'team-digests': await runTeamDigests(); break;
      case 'ingest':
        header('Ingest');
        note('Press Ctrl+C to cancel');
        console.log(S.bar);
        await runIngest();
        footer();
        break;
      case 'analyze':
        header('Analyze');
        note('Press Ctrl+C to cancel');
        console.log(S.bar);
        await runAnalyze();
        footer();
        break;
      case 'view': await viewDigests(); break;
      case 'exit':
        running = false;
        break;
      default:
        running = false;
    }
  }
}

main().catch(console.error);
