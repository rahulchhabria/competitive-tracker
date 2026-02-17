# Rival

AI-powered competitive intelligence from your terminal. Add a company domain, generate a digest, and get actionable insights.

## What It Does

Track your competitors' blog posts and announcements automatically. AI analyzes everything and tells you what matters.

- **CLI-first**: Interactive menus, no browser needed
- **Auto-discovery**: Finds RSS feeds and blogs automatically
- **AI analysis**: Claude analyzes threat levels and strategic implications
- **Full pipeline**: Ingest, analyze, and generate reports in one command
- **100% local**: Your data stays on your machine

## Quick Start

### 1. Install

```bash
git clone <your-repo>
cd rival
npm install
```

### 2. Add Your API Key

Get a Claude API key from [Anthropic](https://console.anthropic.com/) (recommended) or use [OpenAI](https://platform.openai.com/).

```bash
cp .env.example .env
# Edit .env and add: ANTHROPIC_API_KEY=your_key_here
```

### 3. Start

```bash
npm start
```

This launches the interactive CLI. You'll see a menu:

```
? What would you like to do?
> Status overview
  Manage competitors
  Company profile
  Generate digest (full pipeline)
  Generate team digests
  Ingest content only
  Analyze content only
  View past digests
  Exit
```

### 4. Use It

1. Select **Manage competitors** > **Add competitor**
2. Choose **Auto-discover from domain**
3. Enter company name and domain (e.g. "Linear" + "linear.app")
4. Select **Generate digest** from the main menu
5. Pick current week, last week, or a custom date range

That's it. The tool ingests content, analyzes it with AI, and generates a report.

## What You Get

For each competitor update, the AI provides:

- **Summary** - What happened in plain English
- **Threat Level** - CRITICAL, HIGH, MEDIUM, or LOW
- **Key Insights** - Why it matters strategically
- **Product Impact** - Which areas of your product are affected
- **Recommended Actions** - What you should do about it

All organized in a markdown digest report.

## CLI Commands

The interactive menu is the primary interface. You can also run individual steps directly:

```bash
# Interactive CLI (recommended)
npm start

# Individual pipeline steps
npm run ingest        # Fetch content from competitor feeds
npm run analyze       # Run AI analysis on unanalyzed content
npm run digest        # Generate weekly digest report
npm run team-digests  # Generate team-specific digests (marketing, sales, product)
```

## How It Works

1. **Auto-Discovery**: Enter a domain, the tool finds RSS feeds and blog URLs
2. **Smart Filtering**: Only grabs content from last 6 months
3. **AI Analysis**: Claude analyzes each article for competitive threats
4. **Digest Generation**: Combines everything into actionable reports

## Configuration

### Environment Variables

Edit `.env` to customize:

```env
# Required: Your API key
ANTHROPIC_API_KEY=your_key_here

# Optional: Model selection
DEFAULT_MODEL=anthropic:claude-sonnet-4-20250514

# Optional: Analysis settings
ANALYSIS_TEMPERATURE=0.3
MAX_TOKENS=4000

# Optional: Where to save digest reports
DIGEST_OUTPUT_DIR=~/Documents/Competitive Digests
```

### Using OpenAI Instead

```env
OPENAI_API_KEY=your_openai_key_here
DEFAULT_MODEL=openai:gpt-4-turbo
```

## Cost

Very affordable for personal or team use:

- **Claude**: ~$1-2/month for 100 articles (recommended)
- **GPT-4**: ~$3-5/month for 100 articles

## Automation

Want weekly digests automatically?

```bash
# Run every Monday at 9 AM
crontab -e

# Add this line:
0 9 * * 1 cd /path/to/rival && npm run digest -- --last-week --markdown
```

## Data Storage

Everything stored locally in `data/`:

```
data/
├── content/       # Raw articles (JSON)
├── analysis/      # AI analysis results (JSON)
└── digests/       # Generated reports (JSON + Markdown)
```

## Architecture

```
rival/
├── src/
│   ├── cli.ts             # Interactive CLI entry point
│   ├── ingestion/         # RSS fetcher (6-month filter)
│   ├── analysis/          # AI analyzer (Claude/GPT)
│   ├── digest/            # Report generator
│   ├── storage/           # File-based storage
│   ├── scripts/           # Individual pipeline scripts
│   └── utils/             # Auto-discovery & helpers
└── data/                  # Your data (git-ignored)
```

## License

MIT

## Built With

- [Vercel AI SDK](https://ai-sdk.dev/) - AI abstraction
- [RSS Parser](https://github.com/rbren/rss-parser) - Feed parsing
- [Cheerio](https://cheerio.js.org/) - Web scraping
- [Prompts](https://github.com/terkelg/prompts) - Interactive CLI
