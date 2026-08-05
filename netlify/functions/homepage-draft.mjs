import { getStore } from '@netlify/blobs';
import { getUser } from '@netlify/identity';

const STORE_NAME = 'effortless-beauty-content';
const KEY = 'homepage-draft';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }
});

const isText = (value, max, required = true) => {
  if (value == null || value === '') return !required;
  return typeof value === 'string' && value.length <= max;
};

function validateHomepage(value) {
  if (!value || typeof value !== 'object') return 'Homepage draft is missing.';
  const fields = [
    ['heroTitleFirst', 60],
    ['heroTitleSecond', 60],
    ['heroLine', 100],
    ['heroLineEmphasis', 100],
    ['intro', 500],
    ['primaryButton', 40],
    ['secondaryButton', 40],
    ['sectionKicker', 80],
    ['sectionHeading', 180]
  ];
  for (const [field, max] of fields) {
    if (!isText(value[field], max)) return `Homepage field ${field} is invalid.`;
  }
  if (!Array.isArray(value.features) || value.features.length !== 3) {
    return 'Homepage draft must contain exactly three feature cards.';
  }
  for (const feature of value.features) {
    if (!feature || typeof feature !== 'object') return 'A feature card is invalid.';
    if (!isText(feature.title, 80) || !isText(feature.text, 300)) return 'A feature card is incomplete or too long.';
  }
  return null;
}

export default async (request) => {
  const user = await getUser();
  if (!user) return json({ error: 'Authorised login required.' }, 401);

  const store = getStore({ name: STORE_NAME, consistency: 'strong' });

  if (request.method === 'GET') {
    const data = await store.get(KEY, { type: 'json' });
    if (data === null) return json({ found: false }, 404);
    return json({ found: true, data });
  }

  if (request.method !== 'PUT') return json({ error: 'Method not allowed.' }, 405);

  let submitted;
  try {
    submitted = await request.json();
  } catch {
    return json({ error: 'Invalid homepage draft.' }, 400);
  }

  const content = submitted?.content;
  const validationError = validateHomepage(content);
  if (validationError) return json({ error: validationError }, 400);

  const savedAt = new Date().toISOString();
  const data = {
    schemaVersion: 1,
    savedAt,
    content
  };

  await store.setJSON(KEY, data, {
    metadata: {
      savedAt,
      savedBy: user.email || user.id,
      purpose: 'unpublished-homepage-draft'
    }
  });

  return json({ ok: true, savedAt, data });
};
