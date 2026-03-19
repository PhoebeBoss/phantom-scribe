import 'dotenv/config';
import express from 'express';

const app = express();
app.use(express.json());

const GITHUB_TOKEN = process.env.GITHUB_PAT || '';
const JOURNAL_REPO = process.env.JOURNAL_REPO || '';
const PORT = parseInt(process.env.PORT || '8403', 10);

interface JournalEntry {
  timestamp: string;
  title: string;
  content: string;
  tags: string[];
}

const recentEntries: JournalEntry[] = [];

async function writeToGitHub(path: string, content: string, message: string): Promise<boolean> {
  if (!GITHUB_TOKEN) { console.log('[scribe] No GitHub token — entry logged locally only'); return false; }
  try {
    const url = `https://api.github.com/repos/${JOURNAL_REPO}/contents/${path}`;
    const existing = await fetch(url, { headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github+json' } });
    let sha: string | undefined;
    if (existing.ok) { const data = await existing.json() as any; sha = data.sha; }
    const body: any = { message, content: Buffer.from(content).toString('base64'), committer: { name: 'Phoebe', email: 'phoebe@phantomcapital.ai' } };
    if (sha) body.sha = sha;
    const res = await fetch(url, { method: 'PUT', headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return res.ok;
  } catch (e) { console.error('[scribe] GitHub write failed:', e); return false; }
}

app.get('/health', (_req, res) => res.json({ status: 'alive', service: 'phantom-scribe', uptime: process.uptime() }));

app.post('/scribe/journal', async (req, res) => {
  const { title, content, tags } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });
  
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const entry: JournalEntry = { timestamp: now.toISOString(), title: title || 'untitled', content, tags: tags || [] };
  recentEntries.push(entry);
  if (recentEntries.length > 1000) recentEntries.splice(0, 500);

  const md = `# ${entry.title}\n\n*${entry.timestamp}*\n\n${entry.content}\n\n---\nTags: ${entry.tags.join(', ') || 'none'}\n`;
  const path = `journal/${date}/${Date.now()}.md`;
  const pushed = await writeToGitHub(path, md, `scribe: ${entry.title}`);

  res.json({ status: 'recorded', pushed, path, timestamp: entry.timestamp });
});

app.get('/scribe/recent', (_req, res) => res.json(recentEntries.slice(-20).reverse()));

app.get('/scribe/stats', (_req, res) => res.json({ totalEntries: recentEntries.length, uptime: process.uptime() }));

app.listen(PORT, '0.0.0.0', () => console.log(`phantom-scribe live on 0.0.0.0:${PORT}`));
