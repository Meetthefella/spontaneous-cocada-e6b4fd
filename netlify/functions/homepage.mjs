import { getStore } from '@netlify/blobs';
import { getUser } from '@netlify/identity';

const STORE_NAME = 'effortless-beauty-content';
const PUBLISHED_KEY = 'homepage';
const DRAFT_KEY = 'homepage-draft';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }
});

const isText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

function validateHomepage(value) {
  if (!value || typeof value !== 'object') return 'Homepage content is missing.';
  const fields = [
    ['heroTitleFirst', 60], ['heroTitleSecond', 60], ['heroLine', 100],
    ['heroLineEmphasis', 100], ['intro', 500], ['primaryButton', 40],
    ['secondaryButton', 40], ['sectionKicker', 80], ['sectionHeading', 180]
  ];
  for (const [field, max] of fields) {
    if (!isText(value[field], max)) return `Homepage field ${field} is incomplete or too long.`;
  }
  if (!Array.isArray(value.features) || value.features.length !== 3) {
    return 'Homepage must contain exactly three feature cards.';
  }
  for (const feature of value.features) {
    if (!feature || typeof feature !== 'object' || !isText(feature.title, 80) || !isText(feature.text, 300)) {
      return 'A feature card is incomplete or too long.';
    }
  }
  return null;
}

export default async (request) => {
  const store = getStore({ name: STORE_NAME, consistency: 'strong' });

  if (request.method === 'GET') {
    const data = await store.get(PUBLISHED_KEY, { type: 'json' });
    if (data === null) return json({ found: false }, 404);
    return json({ found: true, data });
  }

  if (request.method !== 'PUT') return json({ error: 'Method not allowed.' }, 405);

  const user = await getUser();
  if (!user) return json({ error: 'Authorised login required.' }, 401);

  let submitted;
  try {
    submitted = await request.json();
  } catch {
    return json({ error: 'Invalid homepage content.' }, 400);
  }

  const content = submitted?.content ?? submitted;
  const validationError = validateHomepage(content);
  if (validationError) return json({ error: validationError }, 400);

  const updatedAt = new Date().toISOString();
  const data = { ...content, schemaVersion: 1, updatedAt };

  await store.setJSON(PUBLISHED_KEY, data, {
    metadata: {
      updatedAt,
      publishedBy: user.email || user.id,
      purpose: 'published-homepage'
    }
  });
  const verified = await store.get(PUBLISHED_KEY, { type: 'json' });
  if (!verified || verified.updatedAt !== updatedAt) return json({ error: 'Published homepage could not be verified.' }, 503);
  await store.delete(DRAFT_KEY).catch(() => {});

  return json({ ok: true, updatedAt, data: verified });
};
