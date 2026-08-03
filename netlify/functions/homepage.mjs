import { getStore } from '@netlify/blobs';
import { getUser } from '@netlify/identity';

const STORE_NAME = 'effortless-beauty-content';
const KEY = 'homepage';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const text = (value, max, required = true) => typeof value === 'string' && (!required || value.trim()) && value.length <= max;

function validate(value) {
  if (!value || typeof value !== 'object') return 'Homepage content is missing.';
  for (const key of ['heroTitleFirst','heroTitleSecond','heroLine','heroLineEmphasis','intro','primaryButton','secondaryButton','sectionKicker','sectionHeading']) {
    if (!text(value[key], key === 'intro' || key === 'sectionHeading' ? 500 : 100)) return 'One or more homepage fields are missing or too long.';
  }
  if (!Array.isArray(value.features) || value.features.length !== 3) return 'The homepage requires three feature cards.';
  for (const feature of value.features) if (!feature || !text(feature.title, 100) || !text(feature.text, 500)) return 'One or more feature cards are incomplete.';
  return null;
}

export default async (request) => {
  const store = getStore({ name: STORE_NAME, consistency: 'strong' });
  if (request.method === 'GET') {
    const data = await store.get(KEY, { type: 'json' });
    return data === null ? json({ found: false }, 404) : json({ found: true, data });
  }
  if (request.method !== 'PUT') return json({ error: 'Method not allowed.' }, 405);
  const user = await getUser();
  if (!user) return json({ error: 'Authorised login required.' }, 401);
  let submitted;
  try { submitted = await request.json(); } catch { return json({ error: 'Invalid homepage data.' }, 400); }
  const error = validate(submitted);
  if (error) return json({ error }, 400);
  const updatedAt = new Date().toISOString();
  const data = { schemaVersion: 1, ...submitted, updatedAt };
  await store.setJSON(KEY, data, { metadata: { updatedAt, updatedBy: user.email || user.id } });
  return json({ ok: true, updatedAt, data });
};
