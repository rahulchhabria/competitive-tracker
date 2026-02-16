# Competitive Tracker

AI-powered competitive intelligence that actually works. Just add a company domain, click a button, and get instant insights.

## What It Does

Track your competitors' blog posts and announcements automatically. AI analyzes everything and tells you what matters.

- **Dead simple**: Add competitor domain → Generate digest → Done
- **Auto-discovery**: Finds RSS feeds and blogs automatically
- **AI analysis**: Claude analyzes threat levels and strategic implications
- **One click**: Full pipeline runs from the browser
- **100% local**: Your data stays on your machine

## Quick Start

### 1. Install

```bash
git clone <your-repo>
cd competitive-tracker
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

Open http://localhost:3000

### 4. Use It

1. Click **"+ Add Competitor"**
2. Enter company name and domain (e.g., "Linear" + "linear.app")
3. Click **"Generate Digest"**
4. Watch it work

That's it. You now have AI-powered competitive intelligence.

## What You Get

For each competitor update, the AI provides:

- **Summary** - What happened in plain English
- **Threat Level** - CRITICAL, HIGH, MEDIUM, or LOW
- **Key Insights** - Why it matters strategically
- **Product Impact** - Which areas of your product are affected
- **Recommended Actions** - What you should do about it

All organized in a clean digest report.

## How It Works

1. **Auto-Discovery**: Enter a domain → tool finds RSS feeds and blog URLs
2. **Smart Filtering**: Only grabs content from last 6 months
3. **AI Analysis**: Claude analyzes each article for competitive threats
4. **Digest Generation**: Combines everything into actionable reports

Everything happens in one click from the browser.

## Features

- ✅ **Web Interface** - No command line needed
- ✅ **Auto-Discovery** - Finds RSS feeds automatically
- ✅ **Real-time Progress** - Watch ingestion and analysis live
- ✅ **AI-Powered** - Claude or GPT analyzes everything
- ✅ **Threat Assessment** - Automatic categorization
- ✅ **Local Storage** - All data on your machine
- ✅ **Recent Content Only** - Last 6 months (no old spam)

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

## CLI Tools (Optional)

Prefer command line? You can use:

```bash
# Add competitors interactively
npm run manage

# Manual pipeline
npm run ingest   # Fetch content
npm run analyze  # Run AI analysis
npm run digest   # Generate report
```

But the web UI is easier.

## Troubleshooting

### "No API Key Configured"

- Add your key to `.env`
- Restart the server
- Make sure there are no quotes around the key

### "Could not find RSS feeds"

- Try a different competitor
- Some sites don't have RSS feeds
- Check the domain is correct (no http://, just the domain)

### Server Won't Start

- Make sure port 3000 is available
- Run `npm install` to ensure dependencies are installed
- Check for errors in the terminal

## Automation

Want weekly digests automatically?

```bash
# Run every Monday at 9 AM
crontab -e

# Add this line:
0 9 * * 1 cd /path/to/competitive-tracker && npm start && sleep 5 && curl -X POST http://localhost:3000/api/run-digest
```

## Data Storage

Everything stored locally in `data/`:

```
data/
├── content/       # Raw articles
├── analysis/      # AI analysis results
└── digests/       # Generated reports
```

## Security

- ✅ All data stored locally
- ✅ API keys in local `.env` file
- ✅ No external services (except AI APIs)
- ✅ `.env` automatically git-ignored

## Architecture

```
competitive-tracker/
├── public/              # Web UI
│   ├── index.html      # Main interface
│   ├── style.css       # Styles
│   └── script.js       # Frontend logic
├── src/
│   ├── server/         # Express API
│   ├── ingestion/      # RSS fetcher (6-month filter)
│   ├── analysis/       # AI analyzer
│   ├── digest/         # Report generator
│   ├── storage/        # File storage
│   └── utils/          # Auto-discovery & helpers
└── data/               # Your data (git-ignored)
```

## Contributing

Ideas welcome:

- Additional content sources (Twitter, LinkedIn)
- Email delivery
- Slack/Discord integration
- More AI providers
- Database storage option

## License

MIT

## Built With

- [Vercel AI SDK](https://ai-sdk.dev/) - AI abstraction
- [Express](https://expressjs.com/) - Web server
- [RSS Parser](https://github.com/rbren/rss-parser) - Feed parsing
- [Cheerio](https://cheerio.js.org/) - Web scraping

---

**Questions?** Open an issue on GitHub.

**Ready to start?** Run `npm start` and open http://localhost:3000
