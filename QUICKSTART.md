# Quick Start Guide

Get your competitive monitoring digest up and running in 5 minutes.

## Prerequisites

- Node.js 20+ installed
- An API key from [Anthropic](https://console.anthropic.com/) or [OpenAI](https://platform.openai.com/)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure API Key

Copy the example environment file and add your API key:

```bash
cp .env.example .env
```

Edit `.env` and add your key:

```env
ANTHROPIC_API_KEY=your_anthropic_key_here
# OR
OPENAI_API_KEY=your_openai_key_here
```

### 3. Configure Competitors

Use the interactive CLI to add competitors:

```bash
npm run manage
```

Or manually copy and edit the example file:

```bash
cp competitors.example.json competitors.json
# Then edit competitors.json with your competitors
```

### 4. Run Your First Digest

```bash
# Ingest competitor content
npm run ingest

# Analyze with AI (this may take a few minutes)
npm run analyze

# Generate weekly digest
npm run digest -- --markdown
```

### 5. View Results

Check your `data/digests/` folder for the generated markdown report!

## Finding RSS Feeds

Most company blogs have RSS feeds. Try these common patterns:

- `https://company.com/blog/rss`
- `https://company.com/blog/feed`
- `https://blog.company.com/rss`
- `https://blog.company.com/feed`

You can also use browser extensions like "RSS Feed Finder" to detect feeds on any page.

## Next Steps

- **Automate**: Set up a cron job or GitHub Action to run weekly
- **Customize**: Adjust threat levels and product areas to match your needs
- **Integrate**: Connect to Slack, email, or your internal tools
- **Explore**: Check out the examples in `examples/` for advanced usage

## Troubleshooting

### "No content ingested"
- Verify the RSS feed URLs work in a browser
- Try adding `/rss` or `/feed` to the blog URL

### "API rate limit exceeded"
- Add delays between requests (default is 2 seconds)
- Use a smaller batch size in the analyzer

### "Module not found" errors
- Run `npm run build` to compile TypeScript
- Make sure all dependencies are installed

## Support

- Check the main [README.md](./README.md) for detailed documentation
- Review [examples/](./examples/) for code samples
- Report issues on GitHub

## What's Happening Behind the Scenes?

1. **Ingest**: Fetches RSS feeds from competitors, extracts content, and saves to `data/content/`
2. **Analyze**: Uses AI (Claude/GPT) to analyze each piece of content, assessing threat levels and extracting insights
3. **Digest**: Combines analyses into a weekly report with executive summary, trends, and recommendations

All data is stored locally in JSON files under the `data/` directory.

---

**Ready to track your competition?** Start with `npm run ingest` and go from there!
