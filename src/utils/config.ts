import { Config, CompetitorConfig, CompanyProfile } from '../types/index.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function loadConfig(): Config {
  const { competitors, myCompany, settings } = loadCompetitorsFile();
  return {
    competitors,
    myCompany,
    dataDir: process.env.DATA_DIR || './data',
    model: process.env.DEFAULT_MODEL || 'anthropic:claude-sonnet-4-20250514',
    temperature: parseFloat(process.env.ANALYSIS_TEMPERATURE || '0.3'),
    maxTokens: parseInt(process.env.MAX_TOKENS || '4000'),
    digestFrequency: (process.env.DIGEST_FREQUENCY as any) || 'weekly',
    digestOutputDir: settings?.digestOutputDir || process.env.DIGEST_OUTPUT_DIR,
  };
}

function loadCompetitorsFile(): { competitors: CompetitorConfig[]; myCompany?: CompanyProfile; settings?: { digestOutputDir?: string } } {
  const competitorsPath = join(process.cwd(), 'competitors.json');
  const examplePath = join(process.cwd(), 'competitors.example.json');

  let filePath = competitorsPath;

  // If competitors.json doesn't exist, use the example file
  if (!existsSync(competitorsPath)) {
    console.warn('⚠️  competitors.json not found. Using competitors.example.json as fallback.');
    console.warn('   Copy competitors.example.json to competitors.json and customize it for your needs.');
    filePath = examplePath;
  }

  try {
    const fileContent = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(fileContent);
    return {
      competitors: data.competitors || [],
      myCompany: data.myCompany || undefined,
      settings: data.settings || undefined,
    };
  } catch (error) {
    console.error('Error loading competitors configuration:', error);
    throw new Error(`Failed to load competitors from ${filePath}`);
  }
}

export function validateConfig(config: Config): void {
  if (!config.competitors || config.competitors.length === 0) {
    throw new Error('No competitors configured');
  }

  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error('No API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY');
  }
}
