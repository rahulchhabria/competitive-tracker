import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { CompetitorConfig } from '../types/index.js';
import { RSSFetcher } from '../ingestion/rss-fetcher.js';
import { FileStorage } from '../storage/file-storage.js';
import { CompetitiveAnalyzer } from '../analysis/analyzer.js';
import { DigestGenerator } from '../digest/digest-generator.js';
import { loadConfig } from '../utils/config.js';
import { FeedDiscovery } from '../utils/feed-discovery.js';
import { CancellationToken, CancellationError } from '../utils/cancellation.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, '../../public')));

const COMPETITORS_FILE = join(process.cwd(), 'competitors.json');

interface CompetitorsData {
  competitors: CompetitorConfig[];
}

// Ensure competitors.json exists
function ensureCompetitorsFile(): void {
  if (!existsSync(COMPETITORS_FILE)) {
    const defaultData: CompetitorsData = { competitors: [] };
    writeFileSync(COMPETITORS_FILE, JSON.stringify(defaultData, null, 2));
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

// API Routes

// Get all competitors
app.get('/api/competitors', (req, res) => {
  try {
    const data = loadCompetitors();
    res.json(data.competitors);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load competitors' });
  }
});

// Add competitor with auto-discovery
app.post('/api/competitors', async (req, res) => {
  try {
    const { name, domain } = req.body;

    // Validate
    if (!name || !domain) {
      return res.status(400).json({ error: 'Name and domain are required' });
    }

    // Auto-discover feeds and URLs
    const discovery = new FeedDiscovery();
    const discovered = await discovery.discoverFeeds(domain);

    // Check if we found any feeds
    if (discovered.feedUrls.length === 0) {
      return res.status(400).json({
        error: 'Could not find any RSS feeds for this domain. Please check the domain and try again.'
      });
    }

    const data = loadCompetitors();
    const newCompetitor: CompetitorConfig = {
      name,
      websiteUrl: discovered.websiteUrl,
      blogUrl: discovered.blogUrl,
      releaseNotesUrl: discovered.releaseNotesUrl,
      feedUrls: discovered.feedUrls,
      enabled: true
    };

    data.competitors.push(newCompetitor);
    saveCompetitors(data);
    res.json(newCompetitor);
  } catch (error) {
    console.error('Error adding competitor:', error);
    res.status(500).json({ error: 'Failed to add competitor' });
  }
});

// Update competitor
app.put('/api/competitors/:index', (req, res) => {
  try {
    const data = loadCompetitors();
    const index = parseInt(req.params.index);

    if (index < 0 || index >= data.competitors.length) {
      return res.status(404).json({ error: 'Competitor not found' });
    }

    data.competitors[index] = req.body;
    saveCompetitors(data);
    res.json(data.competitors[index]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update competitor' });
  }
});

// Delete competitor
app.delete('/api/competitors/:index', (req, res) => {
  try {
    const data = loadCompetitors();
    const index = parseInt(req.params.index);

    if (index < 0 || index >= data.competitors.length) {
      return res.status(404).json({ error: 'Competitor not found' });
    }

    const removed = data.competitors.splice(index, 1)[0];
    saveCompetitors(data);
    res.json(removed);
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete competitor' });
  }
});

// Check if API key is configured
app.get('/api/config/check', (req, res) => {
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_key_here';
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_key_here';

  res.json({
    hasApiKey: hasAnthropicKey || hasOpenAIKey,
    provider: hasAnthropicKey ? 'anthropic' : hasOpenAIKey ? 'openai' : null
  });
});

// Run the full pipeline: ingest -> analyze -> digest
let isRunning = false;
let currentCancellationToken: CancellationToken | null = null;
let runProgress = {
  stage: '',
  message: '',
  progress: 0,
  logs: [] as string[],
  cancellable: true
};

app.post('/api/run-digest', async (req, res) => {
  if (isRunning) {
    return res.status(409).json({ error: 'A digest is already being generated' });
  }

  isRunning = true;
  currentCancellationToken = new CancellationToken();
  runProgress = {
    stage: 'starting',
    message: 'Starting digest generation...',
    progress: 0,
    logs: [],
    cancellable: true
  };

  res.json({ message: 'Digest generation started' });

  try {
    // Initialize
    const config = loadConfig();
    const storage = new FileStorage(config.dataDir);
    await storage.initialize();

    // Stage 1: Ingest
    runProgress.stage = 'ingesting';
    runProgress.message = 'Fetching competitor content...';
    runProgress.progress = 10;
    runProgress.logs.push('🔍 Starting content ingestion...');

    const rssFetcher = new RSSFetcher();
    let totalIngested = 0;

    for (const competitor of config.competitors.filter(c => c.enabled)) {
      runProgress.logs.push(`📰 Fetching content from ${competitor.name}...`);

      for (const feedUrl of competitor.feedUrls) {
        try {
          const contents = await rssFetcher.fetchFeed(feedUrl, competitor.name);
          const newContents = [];

          for (const content of contents) {
            const exists = await storage.contentExists(content.id);
            if (!exists) {
              newContents.push(content);
            }
          }

          if (newContents.length > 0) {
            await storage.saveMultipleContents(newContents);
            totalIngested += newContents.length;
            runProgress.logs.push(`   ✅ Ingested ${newContents.length} new items`);
          } else {
            runProgress.logs.push(`   No new content found`);
          }
        } catch (error) {
          runProgress.logs.push(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    runProgress.progress = 30;
    runProgress.logs.push(`\n✨ Ingestion complete! Total new items: ${totalIngested}`);

    // Stage 2: Analyze
    runProgress.stage = 'analyzing';
    runProgress.message = 'Analyzing content with AI...';
    runProgress.progress = 40;
    runProgress.logs.push('\n🤖 Starting content analysis...');

    const analyzer = new CompetitiveAnalyzer({
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens
    });

    const allContents = await storage.loadAllContent();
    const unanalyzedContents = [];

    for (const content of allContents) {
      const hasAnalysis = await storage.analysisExists(content.id);
      if (!hasAnalysis) {
        unanalyzedContents.push(content);
      }
    }

    runProgress.logs.push(`📚 Found ${allContents.length} total content items`);
    runProgress.logs.push(`🔍 ${unanalyzedContents.length} items need analysis\n`);

    if (unanalyzedContents.length > 0) {
      const analyses = await analyzer.analyzeMultipleContents(unanalyzedContents);
      await storage.saveMultipleAnalyses(analyses);

      runProgress.logs.push(`\n✨ Analysis complete! Analyzed ${analyses.length} items`);
    } else {
      runProgress.logs.push('All content already analyzed!');
    }

    runProgress.progress = 70;

    // Stage 3: Generate Digest
    runProgress.stage = 'generating';
    runProgress.message = 'Generating digest...';
    runProgress.progress = 80;
    runProgress.logs.push('\n📊 Generating digest...');

    const generator = new DigestGenerator(storage, analyzer, currentCancellationToken);
    const digest = await generator.generateWeeklyDigest();

    await storage.saveDigest(digest);
    await storage.exportDigestToMarkdown(digest);

    const summary = await generator.generateDigestSummary(digest);

    runProgress.stage = 'complete';
    runProgress.message = 'Digest generated successfully!';
    runProgress.progress = 100;
    runProgress.logs.push('\n✨ Digest generation complete!');
    runProgress.logs.push(`\n${summary}`);

  } catch (error) {
    if (error instanceof CancellationError) {
      runProgress.stage = 'cancelled';
      runProgress.message = 'Digest generation cancelled by user';
      runProgress.logs.push('\n\n⚠️  Digest generation cancelled.');
      runProgress.logs.push('✓ Partially completed work has been saved.');
    } else {
      runProgress.stage = 'error';
      runProgress.message = error instanceof Error ? error.message : 'Unknown error';
      runProgress.progress = 0;
      runProgress.logs.push(`\n❌ Error: ${runProgress.message}`);
    }
  } finally {
    isRunning = false;
    currentCancellationToken = null;
  }
});

// Cancel the running digest
app.post('/api/run-digest/cancel', (req, res) => {
  if (!isRunning || !currentCancellationToken) {
    return res.status(400).json({ error: 'No digest is currently running' });
  }

  currentCancellationToken.cancel();
  res.json({ message: 'Cancellation requested. The digest will stop after the current operation.' });
});

// Get progress of running digest
app.get('/api/run-digest/progress', (req, res) => {
  res.json({
    isRunning,
    ...runProgress
  });
});

// Get digest markdown file
app.get('/api/digest/:date', async (req, res) => {
  try {
    const config = loadConfig();
    const digestPath = join(config.dataDir, 'digests', 'weekly', `digest_${req.params.date}.md`);

    // Check if file exists
    if (!existsSync(digestPath)) {
      return res.status(404).send('Digest not found for this date');
    }

    // Read and send markdown file
    const content = readFileSync(digestPath, 'utf-8');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(content);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load digest' });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Competitive Tracker Web UI`);
  console.log(`   Server running at http://localhost:${PORT}`);
  console.log(`\n💡 Open your browser and visit the URL above to get started!\n`);
});
