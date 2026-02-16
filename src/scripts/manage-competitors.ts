import prompts from 'prompts';
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { join } from 'path';
import { CompetitorConfig } from '../types/index.js';

interface CompetitorsData {
  competitors: CompetitorConfig[];
}

const COMPETITORS_FILE = join(process.cwd(), 'competitors.json');
const EXAMPLE_FILE = join(process.cwd(), 'competitors.example.json');

function loadCompetitors(): CompetitorsData {
  if (!existsSync(COMPETITORS_FILE)) {
    console.log('📋 competitors.json not found. Creating from example...\n');
    if (existsSync(EXAMPLE_FILE)) {
      copyFileSync(EXAMPLE_FILE, COMPETITORS_FILE);
    } else {
      const defaultData: CompetitorsData = { competitors: [] };
      writeFileSync(COMPETITORS_FILE, JSON.stringify(defaultData, null, 2));
    }
  }

  const content = readFileSync(COMPETITORS_FILE, 'utf-8');
  return JSON.parse(content);
}

function saveCompetitors(data: CompetitorsData): void {
  writeFileSync(COMPETITORS_FILE, JSON.stringify(data, null, 2));
  console.log('✅ Changes saved to competitors.json\n');
}

async function listCompetitors(): Promise<void> {
  const data = loadCompetitors();

  if (data.competitors.length === 0) {
    console.log('📭 No competitors configured yet.\n');
    return;
  }

  console.log('\n📊 Current Competitors:\n');
  data.competitors.forEach((comp, index) => {
    const status = comp.enabled ? '✅' : '❌';
    console.log(`${index + 1}. ${status} ${comp.name}`);
    console.log(`   Website: ${comp.websiteUrl || 'N/A'}`);
    console.log(`   Blog: ${comp.blogUrl || 'N/A'}`);
    console.log(`   RSS Feeds: ${comp.feedUrls.length}`);
    console.log('');
  });
}

async function addCompetitor(): Promise<void> {
  console.log('\n➕ Add New Competitor\n');

  const answers = await prompts([
    {
      type: 'text',
      name: 'name',
      message: 'Competitor name:',
      validate: (value: string) => value.trim() ? true : 'Name is required'
    },
    {
      type: 'text',
      name: 'websiteUrl',
      message: 'Website URL:',
      validate: (value: string) => {
        if (!value.trim()) return 'Website URL is required';
        try {
          new URL(value);
          return true;
        } catch {
          return 'Please enter a valid URL';
        }
      }
    },
    {
      type: 'text',
      name: 'blogUrl',
      message: 'Blog URL (optional):',
      initial: ''
    },
    {
      type: 'text',
      name: 'releaseNotesUrl',
      message: 'Release notes/Changelog URL (optional):',
      initial: ''
    },
    {
      type: 'list',
      name: 'feedUrls',
      message: 'RSS feed URLs (comma-separated):',
      separator: ',',
      validate: (value: string[]) => {
        if (value.length === 0) return 'At least one RSS feed URL is required';
        for (const url of value) {
          try {
            new URL(url.trim());
          } catch {
            return `Invalid URL: ${url}`;
          }
        }
        return true;
      }
    },
    {
      type: 'confirm',
      name: 'enabled',
      message: 'Enable this competitor?',
      initial: true
    }
  ]);

  if (!answers.name) {
    console.log('❌ Cancelled\n');
    return;
  }

  const data = loadCompetitors();

  const newCompetitor: CompetitorConfig = {
    name: answers.name.trim(),
    websiteUrl: answers.websiteUrl.trim(),
    blogUrl: answers.blogUrl?.trim() || undefined,
    releaseNotesUrl: answers.releaseNotesUrl?.trim() || undefined,
    feedUrls: answers.feedUrls.map((url: string) => url.trim()),
    enabled: answers.enabled
  };

  data.competitors.push(newCompetitor);
  saveCompetitors(data);

  console.log(`✅ Added ${newCompetitor.name}\n`);
}

async function removeCompetitor(): Promise<void> {
  const data = loadCompetitors();

  if (data.competitors.length === 0) {
    console.log('📭 No competitors to remove.\n');
    return;
  }

  const { competitorIndex } = await prompts({
    type: 'select',
    name: 'competitorIndex',
    message: 'Select competitor to remove:',
    choices: data.competitors.map((comp, index) => ({
      title: `${comp.name} (${comp.enabled ? 'enabled' : 'disabled'})`,
      value: index
    }))
  });

  if (competitorIndex === undefined) {
    console.log('❌ Cancelled\n');
    return;
  }

  const { confirm } = await prompts({
    type: 'confirm',
    name: 'confirm',
    message: `Remove ${data.competitors[competitorIndex].name}?`,
    initial: false
  });

  if (confirm) {
    const removed = data.competitors.splice(competitorIndex, 1)[0];
    saveCompetitors(data);
    console.log(`✅ Removed ${removed.name}\n`);
  } else {
    console.log('❌ Cancelled\n');
  }
}

async function toggleCompetitor(): Promise<void> {
  const data = loadCompetitors();

  if (data.competitors.length === 0) {
    console.log('📭 No competitors to toggle.\n');
    return;
  }

  const { competitorIndex } = await prompts({
    type: 'select',
    name: 'competitorIndex',
    message: 'Select competitor to enable/disable:',
    choices: data.competitors.map((comp, index) => ({
      title: `${comp.enabled ? '✅' : '❌'} ${comp.name}`,
      value: index
    }))
  });

  if (competitorIndex === undefined) {
    console.log('❌ Cancelled\n');
    return;
  }

  const competitor = data.competitors[competitorIndex];
  competitor.enabled = !competitor.enabled;
  saveCompetitors(data);

  const status = competitor.enabled ? 'enabled' : 'disabled';
  console.log(`✅ ${competitor.name} is now ${status}\n`);
}

async function editCompetitor(): Promise<void> {
  const data = loadCompetitors();

  if (data.competitors.length === 0) {
    console.log('📭 No competitors to edit.\n');
    return;
  }

  const { competitorIndex } = await prompts({
    type: 'select',
    name: 'competitorIndex',
    message: 'Select competitor to edit:',
    choices: data.competitors.map((comp, index) => ({
      title: comp.name,
      value: index
    }))
  });

  if (competitorIndex === undefined) {
    console.log('❌ Cancelled\n');
    return;
  }

  const competitor = data.competitors[competitorIndex];

  const answers = await prompts([
    {
      type: 'text',
      name: 'name',
      message: 'Competitor name:',
      initial: competitor.name,
      validate: (value: string) => value.trim() ? true : 'Name is required'
    },
    {
      type: 'text',
      name: 'websiteUrl',
      message: 'Website URL:',
      initial: competitor.websiteUrl || '',
      validate: (value: string) => {
        if (!value.trim()) return 'Website URL is required';
        try {
          new URL(value);
          return true;
        } catch {
          return 'Please enter a valid URL';
        }
      }
    },
    {
      type: 'text',
      name: 'blogUrl',
      message: 'Blog URL:',
      initial: competitor.blogUrl || ''
    },
    {
      type: 'text',
      name: 'releaseNotesUrl',
      message: 'Release notes URL:',
      initial: competitor.releaseNotesUrl || ''
    },
    {
      type: 'list',
      name: 'feedUrls',
      message: 'RSS feed URLs (comma-separated):',
      initial: competitor.feedUrls.join(', '),
      separator: ',',
      validate: (value: string[]) => {
        if (value.length === 0) return 'At least one RSS feed URL is required';
        for (const url of value) {
          try {
            new URL(url.trim());
          } catch {
            return `Invalid URL: ${url}`;
          }
        }
        return true;
      }
    }
  ]);

  if (!answers.name) {
    console.log('❌ Cancelled\n');
    return;
  }

  data.competitors[competitorIndex] = {
    name: answers.name.trim(),
    websiteUrl: answers.websiteUrl.trim(),
    blogUrl: answers.blogUrl?.trim() || undefined,
    releaseNotesUrl: answers.releaseNotesUrl?.trim() || undefined,
    feedUrls: answers.feedUrls.map((url: string) => url.trim()),
    enabled: competitor.enabled
  };

  saveCompetitors(data);
  console.log(`✅ Updated ${answers.name}\n`);
}

async function main(): Promise<void> {
  console.log('\n🏆 Competitive Tracker - Manage Competitors\n');

  let running = true;

  while (running) {
    const { action } = await prompts({
      type: 'select',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { title: 'List all competitors', value: 'list' },
        { title: 'Add new competitor', value: 'add' },
        { title: 'Edit competitor', value: 'edit' },
        { title: 'Enable/Disable competitor', value: 'toggle' },
        { title: 'Remove competitor', value: 'remove' },
        { title: 'Exit', value: 'exit' }
      ]
    });

    switch (action) {
      case 'list':
        await listCompetitors();
        break;
      case 'add':
        await addCompetitor();
        break;
      case 'edit':
        await editCompetitor();
        break;
      case 'toggle':
        await toggleCompetitor();
        break;
      case 'remove':
        await removeCompetitor();
        break;
      case 'exit':
        running = false;
        console.log('👋 Goodbye!\n');
        break;
      default:
        running = false;
    }
  }
}

main().catch(console.error);
