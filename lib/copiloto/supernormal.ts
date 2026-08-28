import type { SupernormalPost, SupernormalPostDetail } from './types';

const BASE_URL = 'https://api.supernormal.com/api/v1';

function token(): string {
  const value = process.env.SUPERNORMAL_API_TOKEN?.trim();
  if (!value) throw new Error('SUPERNORMAL_NOT_CONFIGURED');
  return value;
}

async function request(path: string): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'X-API-TOKEN': token(), 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20000),
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Supernormal ${res.status}: ${detail.slice(0, 500)}`);
  }
  return res.json();
}

function postFrom(raw: any): SupernormalPost {
  return {
    id: String(raw?.id || ''),
    title: String(raw?.title || 'Reunião sem título'),
    publishedAt: String(raw?.published_at || ''),
    summary: String(raw?.summary || ''),
    seen: Boolean(raw?.seen),
  };
}

export function isSupernormalConfigured(): boolean {
  return Boolean(process.env.SUPERNORMAL_API_TOKEN?.trim());
}

export async function listSupernormalPosts(): Promise<SupernormalPost[]> {
  const data = await request('/posts?limit=20&scope=latest');
  const rows = Array.isArray(data) ? data : Array.isArray(data?.posts) ? data.posts : data ? [data] : [];
  return rows.map(postFrom).filter((post) => post.id);
}

export async function getSupernormalPost(id: string): Promise<SupernormalPostDetail> {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) throw new Error('ID de reunião inválido');
  const raw = await request(`/posts/${encodeURIComponent(id)}`);
  const transcript: SupernormalPostDetail['transcript'] = [];
  let transcriptChars = 0;
  for (const item of (Array.isArray(raw?.transcript) ? raw.transcript : []).slice(0, 5000)) {
    const content = String(item?.content || '').slice(0, 3000);
    if (!content) continue;
    transcriptChars += content.length;
    if (transcriptChars > 120000) break;
    transcript.push({
      start: Number(item?.start) || 0,
      end: Number(item?.end) || 0,
      content,
      authorName: String(item?.author_name || 'Participante').slice(0, 200),
    });
  }
  return {
    ...postFrom(raw),
    notes: (Array.isArray(raw?.notes) ? raw.notes : []).slice(0, 100).map((note: any) => ({
      body: String(note?.body || '').slice(0, 3000),
      displayName: String(note?.display_name || '').slice(0, 200),
      type: String(note?.type || '').slice(0, 100),
    })),
    transcript,
  };
}
