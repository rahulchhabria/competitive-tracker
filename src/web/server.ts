import http from 'http';
import { promises as fs } from 'fs';
import { join, extname } from 'path';
import { existsSync, readFileSync } from 'fs';
import { FileStorage } from '../storage/file-storage.js';
import { buildDashboardHTML } from './dashboard.js';

const COMPETITORS_FILE = join(process.cwd(), 'competitors.json');

function loadCompetitorsFile() {
  if (!existsSync(COMPETITORS_FILE)) return { competitors: [] };
  return JSON.parse(readFileSync(COMPETITORS_FILE, 'utf-8'));
}

export async function startServer(port: number = 3000): Promise<void> {
  const dataDir = process.env.DATA_DIR || './data';
  const storage = new FileStorage(dataDir);
  await storage.initialize();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    const pathname = url.pathname;

    // CORS headers for local dev
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
      if (pathname === '/api/status') {
        const data = loadCompetitorsFile();
        const enabledCount = data.competitors.filter((c: any) => c.enabled).length;

        const contentDir = join(dataDir, 'content');
        const analysisDir = join(dataDir, 'analysis');
        const digestsDir = join(dataDir, 'digests', 'weekly');

        const contentFiles = existsSync(contentDir) ? (await fs.readdir(contentDir)).filter(f => f.endsWith('.json')) : [];
        const analysisFiles = existsSync(analysisDir) ? (await fs.readdir(analysisDir)).filter(f => f.endsWith('.json')) : [];
        const digestFiles = existsSync(digestsDir) ? (await fs.readdir(digestsDir)).filter(f => f.endsWith('.json')) : [];

        const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_key_here';
        const hasOpenAIKey = !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_key_here';

        json(res, {
          apiKey: { configured: hasAnthropicKey || hasOpenAIKey, provider: hasAnthropicKey ? 'Anthropic' : hasOpenAIKey ? 'OpenAI' : 'none' },
          profile: data.myCompany || null,
          competitors: { total: data.competitors.length, enabled: enabledCount },
          content: contentFiles.length,
          analyses: analysisFiles.length,
          digests: digestFiles.length,
        });

      } else if (pathname === '/api/competitors') {
        const data = loadCompetitorsFile();
        json(res, data.competitors);

      } else if (pathname === '/api/content') {
        const allContent = await storage.loadAllContent();
        // Sort by published date descending, limit to 100
        const sorted = allContent
          .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
          .slice(0, 100);
        json(res, sorted);

      } else if (pathname === '/api/analyses') {
        const allAnalyses = await storage.loadAllAnalyses();
        json(res, allAnalyses);

      } else if (pathname === '/api/digests') {
        const digestsDir = join(dataDir, 'digests', 'weekly');
        try {
          const files = (await fs.readdir(digestsDir)).filter(f => f.endsWith('.md')).sort().reverse();
          const digests = files.map(f => ({
            filename: f,
            label: f.replace('digest_', '').replace('.md', ''),
          }));
          json(res, digests);
        } catch {
          json(res, []);
        }

      } else if (pathname.startsWith('/api/digests/')) {
        const filename = decodeURIComponent(pathname.split('/api/digests/')[1]);
        const digestsDir = join(dataDir, 'digests', 'weekly');
        const filePath = join(digestsDir, filename);

        // Prevent path traversal
        if (!filePath.startsWith(digestsDir)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        try {
          const content = await fs.readFile(filePath, 'utf-8');
          if (filename.endsWith('.json')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
          } else {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          }
          res.end(content);
        } catch {
          res.writeHead(404);
          res.end('Not found');
        }

      } else if (pathname === '/api/threat-summary') {
        const allAnalyses = await storage.loadAllAnalyses();
        const summary = { critical: 0, high: 0, medium: 0, low: 0, total: allAnalyses.length };
        for (const a of allAnalyses) {
          if (a.threatLevel in summary) {
            (summary as any)[a.threatLevel]++;
          }
        }
        json(res, summary);

      } else if (pathname === '/' || pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(buildDashboardHTML());

      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    } catch (err) {
      console.error('Server error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });

  server.listen(port, () => {
    // Splash handled by caller
  });

  // Keep the process alive
  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      server.close();
      resolve();
    });
    process.on('SIGTERM', () => {
      server.close();
      resolve();
    });
  });
}

function json(res: http.ServerResponse, data: any): void {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
