import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { CompetitorConfig, CompanyProfile, CompanyProfileSchema } from '../types/index.js';
import { RSSFetcher } from '../ingestion/rss-fetcher.js';
import { FileStorage } from '../storage/file-storage.js';
import { CompetitiveAnalyzer } from '../analysis/analyzer.js';
import { DigestGenerator } from '../digest/digest-generator.js';
import { loadConfig } from '../utils/config.js';
import { FeedDiscovery } from '../utils/feed-discovery.js';
import { CompanyDiscovery } from '../utils/company-discovery.js';
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
  myCompany?: CompanyProfile;
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
        error: 'no_feeds_found',
        message: `No RSS feeds found for ${domain}`,
        suggestion: 'Many companies have stopped providing RSS feeds. Try these options:',
        options: [
          'Check if they have a blog or changelog page and manually find the RSS feed URL',
          'Try a different competitor that provides RSS feeds',
          'Manually edit competitors.json to add custom feed URLs'
        ],
        details: {
          websiteUrl: discovered.websiteUrl,
          blogUrl: discovered.blogUrl,
          checkedUrls: discovered.feedUrls // Will be empty but shows what we tried
        }
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

// Company Profile endpoints

// Get company profile
app.get('/api/company-profile', (req, res) => {
  try {
    const data = loadCompetitors();
    res.json(data.myCompany || null);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load company profile' });
  }
});

// Auto-discover and create company profile
app.post('/api/company-profile', async (req, res) => {
  try {
    const { name, domain } = req.body;

    // Validate
    if (!name || !domain) {
      return res.status(400).json({ error: 'Name and domain are required' });
    }

    console.log(`Discovering company info for ${name} at ${domain}...`);

    // Auto-discover company information
    const discovery = new CompanyDiscovery();
    const discovered = await discovery.discoverCompanyInfo(domain, name);

    console.log('Discovery complete:', discovered);

    // Save the discovered profile
    const data = loadCompetitors();
    data.myCompany = discovered;
    saveCompetitors(data);

    res.json(discovered);
  } catch (error) {
    console.error('Error discovering company profile:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to discover company profile';
    res.status(500).json({ error: errorMessage });
  }
});

// Update company profile (manual edit)
app.put('/api/company-profile', (req, res) => {
  try {
    // Validate the profile data
    const validationResult = CompanyProfileSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid company profile data',
        details: validationResult.error.issues
      });
    }

    const data = loadCompetitors();
    data.myCompany = validationResult.data;
    saveCompetitors(data);
    res.json(data.myCompany);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save company profile' });
  }
});

// Delete company profile
app.delete('/api/company-profile', (req, res) => {
  try {
    const data = loadCompetitors();
    const deletedProfile = data.myCompany;
    delete data.myCompany;
    saveCompetitors(data);
    res.json(deletedProfile || null);
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete company profile' });
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
  cancellable: true,
  startTime: null as Date | null,
  estimatedMinutesRemaining: null as number | null,
  estimatedCompletionTime: null as string | null,
  digestDate: null as string | null
};

function updateTimeEstimate(currentProgress: number) {
  if (!runProgress.startTime || currentProgress === 0) return;

  const elapsed = (Date.now() - runProgress.startTime.getTime()) / 1000; // seconds
  const progressFraction = currentProgress / 100;
  const estimatedTotalSeconds = elapsed / progressFraction;
  const estimatedSecondsRemaining = estimatedTotalSeconds - elapsed;

  if (estimatedSecondsRemaining > 0) {
    runProgress.estimatedMinutesRemaining = Math.ceil(estimatedSecondsRemaining / 60);

    const completionTime = new Date(Date.now() + estimatedSecondsRemaining * 1000);
    runProgress.estimatedCompletionTime = completionTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }
}

app.post('/api/run-digest', async (req, res) => {
  if (isRunning) {
    return res.status(409).json({ error: 'A digest is already being generated' });
  }

  // Get date range from request body
  const { startDate, endDate } = req.body;

  isRunning = true;
  currentCancellationToken = new CancellationToken();
  const startTime = new Date();
  runProgress = {
    stage: 'starting',
    message: 'Starting digest generation...',
    progress: 0,
    logs: [],
    cancellable: true,
    startTime,
    estimatedMinutesRemaining: null,
    estimatedCompletionTime: null,
    digestDate: null
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
          const msg = error instanceof Error ? error.message : 'Unknown error';
          runProgress.logs.push(`   ❌ Failed to fetch feed ${feedUrl}: ${msg}`);
        }
      }
    }

    runProgress.progress = 30;
    runProgress.logs.push(`\n✨ Ingestion complete! Total new items: ${totalIngested}`);

    // Update time estimate
    updateTimeEstimate(30);

    // Stage 2: Analyze
    runProgress.stage = 'analyzing';
    runProgress.message = 'Analyzing content with AI...';
    runProgress.progress = 40;
    runProgress.logs.push('\n🤖 Starting content analysis...');

    // Create analyzer with progress callback
    const analyzer = new CompetitiveAnalyzer({
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      companyProfile: config.myCompany
    }, (analyzed: number, total: number) => {
      // Update progress: 40% to 70% during analysis
      const analysisProgress = (analyzed / total) * 30;
      runProgress.progress = 40 + Math.floor(analysisProgress);
      runProgress.logs[runProgress.logs.length - 1] = `⏳ Analyzing: ${analyzed}/${total} items complete (${Math.floor((analyzed/total)*100)}%)`;

      // Calculate time estimates
      if (runProgress.startTime && analyzed > 0) {
        const elapsed = (Date.now() - runProgress.startTime.getTime()) / 1000; // seconds
        const itemsPerSecond = analyzed / elapsed;
        const remainingItems = total - analyzed;
        const estimatedSecondsRemaining = remainingItems / itemsPerSecond;
        const estimatedMinutesRemaining = Math.ceil(estimatedSecondsRemaining / 60);

        runProgress.estimatedMinutesRemaining = estimatedMinutesRemaining;

        const completionTime = new Date(Date.now() + estimatedSecondsRemaining * 1000);
        runProgress.estimatedCompletionTime = completionTime.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
      }
    });

    // Filter content by date range if provided
    let allContents = await storage.loadAllContent();

    if (startDate && endDate) {
      const filterStart = new Date(startDate);
      const filterEnd = new Date(endDate);
      filterEnd.setHours(23, 59, 59, 999); // Include full end date

      allContents = allContents.filter(content => {
        const publishedAt = new Date(content.publishedAt);
        return publishedAt >= filterStart && publishedAt <= filterEnd;
      });

      runProgress.logs.push(`📅 Filtering content from ${startDate} to ${endDate}`);
    }

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
      console.log(`Starting analysis of ${unanalyzedContents.length} items...`);
      runProgress.logs.push(`⏳ Analyzing ${unanalyzedContents.length} items (this may take a few minutes)...`);

      try {
        const analyses = await analyzer.analyzeMultipleContents(unanalyzedContents);
        console.log(`Analysis complete. Got ${analyses.length} results.`);

        await storage.saveMultipleAnalyses(analyses);
        runProgress.logs.push(`\n✨ Analysis complete! Analyzed ${analyses.length} items`);
      } catch (error) {
        console.error('Error during analysis:', error);
        runProgress.logs.push(`\n❌ Analysis error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error;
      }
    } else {
      runProgress.logs.push('All content already analyzed!');
    }

    runProgress.progress = 70;
    updateTimeEstimate(70);

    // Stage 3: Generate Digest
    runProgress.stage = 'generating';
    runProgress.message = 'Generating digest...';
    runProgress.progress = 80;
    runProgress.logs.push('\n📊 Generating digest...');
    updateTimeEstimate(80);

    const generator = new DigestGenerator(storage, analyzer, currentCancellationToken);
    const digest = await generator.generateWeeklyDigest();

    // Generator already saves the JSON; write the markdown report
    await storage.exportDigestToMarkdown(digest);

    const summary = await generator.generateDigestSummary(digest);

    // Store the digest date for the frontend to use
    runProgress.digestDate = digest.weekStartDate.toISOString().split('T')[0];

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
    let digestPath = join(config.dataDir, 'digests', 'weekly', `digest_${req.params.date}.md`);

    // If file doesn't exist, try to find it by week
    if (!existsSync(digestPath)) {
      // Calculate the week start date (Monday) for the requested date
      const requestedDate = new Date(req.params.date);
      const dayOfWeek = requestedDate.getDay();
      const weekStart = new Date(requestedDate);
      weekStart.setDate(requestedDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
      const weekStartStr = weekStart.toISOString().split('T')[0];

      digestPath = join(config.dataDir, 'digests', 'weekly', `digest_${weekStartStr}.md`);

      if (!existsSync(digestPath)) {
        return res.status(404).send('Digest not found for this date');
      }
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
