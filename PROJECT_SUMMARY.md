# Competitive Tracker - Project Summary

## Overview

A complete AI-powered competitive monitoring system built with the Vercel AI SDK. Automatically ingests competitor content (blog posts, release notes, news), analyzes it with Claude/GPT models, and generates weekly intelligence digests with threat tagging and strategic recommendations.

## Key Features

✅ **Multi-source Content Ingestion**
- RSS feed parsing
- Web scraping capabilities
- Automatic deduplication

✅ **AI-Powered Analysis** (via Vercel AI SDK)
- Structured output with Zod schemas
- Support for multiple AI providers (Anthropic Claude, OpenAI GPT)
- Automatic threat level assessment (critical/high/medium/low)
- Product area tagging
- Competitive implications analysis
- Strategic action recommendations

✅ **Weekly Digest Generation**
- Executive summaries
- Trend detection across competitors
- Product area breakdowns
- Critical threat highlights
- Markdown export for easy sharing

✅ **Flexible Storage**
- File-based JSON storage
- Date-range queries
- Content archiving
- Easy to extend to databases

✅ **Complete Automation**
- CLI scripts for all operations
- GitHub Actions workflow included
- Example configurations provided

## Project Structure

```
competitive-tracker/
├── src/
│   ├── types/              # TypeScript types & Zod schemas
│   │   └── index.ts        # Core type definitions
│   │
│   ├── ingestion/          # Content ingestion
│   │   ├── rss-fetcher.ts  # RSS feed parser
│   │   └── web-scraper.ts  # Web scraping (Cheerio)
│   │
│   ├── analysis/           # AI-powered analysis
│   │   └── analyzer.ts     # AI SDK integration (Claude/GPT)
│   │
│   ├── storage/            # Data persistence
│   │   └── file-storage.ts # File-based storage with markdown export
│   │
│   ├── digest/             # Digest generation
│   │   └── digest-generator.ts # Weekly digest logic
│   │
│   ├── utils/              # Utilities
│   │   ├── config.ts       # Configuration management
│   │   └── helpers.ts      # Helper functions
│   │
│   ├── scripts/            # CLI scripts
│   │   ├── ingest.ts       # Content ingestion script
│   │   ├── analyze.ts      # Analysis script
│   │   └── generate-digest.ts # Digest generation script
│   │
│   └── index.ts            # Main library exports
│
├── examples/               # Usage examples
│   ├── basic-usage.ts      # Complete workflow demo
│   └── custom-analysis.ts  # Custom analysis patterns
│
├── .github/workflows/      # GitHub Actions
│   └── weekly-digest.yml   # Automated weekly digest
│
├── data/                   # Generated at runtime
│   ├── content/            # Ingested content
│   ├── analysis/           # AI analysis results
│   ├── digests/            # Generated digests
│   └── archive/            # Archived content
│
├── package.json            # Dependencies & scripts
├── tsconfig.json           # TypeScript config
├── .env.example            # Environment template
├── README.md               # Full documentation
├── QUICKSTART.md           # 5-minute setup guide
└── competitors.example.json # Example configuration
```

## Technology Stack

**Core Framework:**
- **Vercel AI SDK** - Unified AI provider interface
- **TypeScript** - Type safety
- **Zod** - Schema validation & structured outputs

**AI Providers (via AI SDK):**
- Anthropic Claude (Sonnet 4)
- OpenAI GPT-4

**Data Processing:**
- **rss-parser** - RSS feed parsing
- **cheerio** - HTML parsing & web scraping
- **axios** - HTTP requests
- **date-fns** - Date manipulation

**Development:**
- **tsx** - TypeScript execution
- **Node.js 20+** - Runtime

## Key Components

### 1. Content Ingestion (`src/ingestion/`)

**RSSFetcher** - Fetches and parses RSS feeds
- Extracts title, content, metadata
- Detects content types automatically
- Handles multiple feeds per competitor

**WebScraper** - Scrapes individual web pages
- Configurable selectors
- Removes unwanted elements
- Extracts structured content

### 2. AI Analysis (`src/analysis/`)

**CompetitiveAnalyzer** - AI-powered analysis engine
- Uses Vercel AI SDK's `generateText()` with structured outputs
- Zod schemas ensure consistent analysis format
- Supports multiple AI providers
- Rate limiting and error handling

**Analysis Output:**
```typescript
{
  summary: string;              // Concise 2-3 sentence summary
  keyInsights: string[];        // Key findings
  positioningChanges: string[]; // Market positioning shifts
  newFeatures: Feature[];       // New capabilities announced
  threatLevel: 'critical' | 'high' | 'medium' | 'low';
  productAreas: ProductArea[];  // Affected areas
  competitiveImplications: string; // Strategic impact
  recommendedActions: string[]; // Suggested responses
}
```

### 3. Storage (`src/storage/`)

**FileStorage** - JSON-based data persistence
- Separate directories for content, analysis, digests
- Date-range queries
- Competitor-specific queries
- Markdown export for digests
- Archive functionality

### 4. Digest Generation (`src/digest/`)

**DigestGenerator** - Creates comprehensive weekly reports
- Aggregates content and analyses
- Generates executive summaries
- Identifies trends across competitors
- Groups by product area and threat level
- Creates actionable reports

## CLI Usage

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Add your ANTHROPIC_API_KEY or OPENAI_API_KEY

# Run the workflow
npm run ingest    # Fetch competitor content
npm run analyze   # Analyze with AI
npm run digest    # Generate weekly report

# Export to markdown
npm run digest -- --markdown

# Generate for last week
npm run digest -- --last-week
```

## Programmatic Usage

```typescript
import {
  RSSFetcher,
  CompetitiveAnalyzer,
  FileStorage,
  DigestGenerator
} from './src/index.js';

// Initialize
const storage = new FileStorage('./data');
await storage.initialize();

const analyzer = new CompetitiveAnalyzer({
  model: 'anthropic:claude-sonnet-4-20250514',
  temperature: 0.3
});

// Ingest
const fetcher = new RSSFetcher();
const contents = await fetcher.fetchFeed(url, 'Competitor');
await storage.saveMultipleContents(contents);

// Analyze
const analyses = await analyzer.analyzeMultipleContents(contents);
await storage.saveMultipleAnalyses(analyses);

// Generate digest
const generator = new DigestGenerator(storage, analyzer);
const digest = await generator.generateWeeklyDigest();
```

## Configuration

### Competitors (`src/utils/config.ts`)
```typescript
{
  name: 'Competitor Name',
  feedUrls: ['https://example.com/rss'],
  blogUrl: 'https://example.com/blog',
  releaseNotesUrl: 'https://example.com/changelog',
  websiteUrl: 'https://example.com',
  enabled: true
}
```

### AI Model (`.env`)
```env
# Choose provider and model
DEFAULT_MODEL=anthropic:claude-sonnet-4-20250514
# or
DEFAULT_MODEL=openai:gpt-4-turbo

# Analysis parameters
ANALYSIS_TEMPERATURE=0.3
MAX_TOKENS=4000
```

## Threat Levels

- **CRITICAL**: Major launches threatening core value prop
- **HIGH**: Important features addressing gaps
- **MEDIUM**: Incremental competitive improvements
- **LOW**: Minor updates, non-competitive content

## Product Areas

Customize in `src/types/index.ts`:
- Core, Integrations, Pricing, Marketing
- Infrastructure, Security, UX, Mobile
- API, Other

## Automation

**GitHub Actions** (`.github/workflows/weekly-digest.yml`):
- Runs every Monday at 9 AM UTC
- Ingests, analyzes, and generates digest
- Uploads as artifact
- Optional: Email/Slack notifications

**Cron Job:**
```bash
0 9 * * 1 cd /path/to/competitive-tracker && npm run ingest && npm run analyze && npm run digest -- --markdown
```

## Extensibility

### Add New Content Sources
Extend `src/ingestion/` with custom fetchers:
- Twitter/X API
- LinkedIn posts
- GitHub releases
- Product Hunt
- News APIs

### Custom Storage
Replace `FileStorage` with:
- PostgreSQL
- MongoDB
- Supabase
- Any database

### Enhanced Analysis
- Add sentiment analysis
- Extract pricing information
- Identify target customers
- Track feature parity

### Integrations
- Slack notifications
- Email digests
- Dashboard UI (React/Next.js)
- Notion database sync
- Airtable integration

## AI SDK Integration Highlights

This project showcases several AI SDK features:

1. **Structured Outputs**: Using `Output.object()` with Zod schemas
2. **Multi-provider Support**: Easy switching between Anthropic/OpenAI
3. **Type Safety**: Full TypeScript integration
4. **Error Handling**: Retry logic and graceful failures
5. **Token Management**: Configurable limits and truncation

## Example Output

**Digest Summary:**
```
📊 Competitive Digest Summary
Week: 2025-01-27 to 2025-02-02

📈 Overview:
- Total updates: 15
- Critical threats: 2
- High threats: 5

🔥 Top Trends:
1. 3 competitors showing: increased focus on AI features
2. 4 new features in AI/ML capabilities
3. 2 pricing model changes detected

🚨 Critical Threats:
- Competitor A: Launches AI-powered automation suite
- Competitor B: Announces enterprise tier with 50% discount
```

## Next Steps

1. **Customize Competitors**: Edit `src/utils/config.ts`
2. **Run First Digest**: Follow QUICKSTART.md
3. **Automate**: Set up GitHub Actions or cron
4. **Extend**: Add integrations or custom sources
5. **Scale**: Move to database storage if needed

## Resources

- [Vercel AI SDK Docs](https://ai-sdk.dev/)
- [Anthropic Claude](https://www.anthropic.com/claude)
- [OpenAI Platform](https://platform.openai.com/)

## License

MIT

---

**Built with ❤️ using the Vercel AI SDK**
