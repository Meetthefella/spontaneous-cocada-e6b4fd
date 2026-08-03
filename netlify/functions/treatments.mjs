import { getStore } from '@netlify/blobs';
import { getUser } from '@netlify/identity';

const STORE_NAME = 'effortless-beauty-content';
const KEY = 'treatments';
const MAX_ITEMS = 100;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }
});

const isText = (value, max, required = false) => {
  if (value == null || value === '') return !required;
  return typeof value === 'string' && value.length <= max;
};

function validateDocument(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.items)) {
    return 'Treatment list is missing.';
  }
  if (value.items.length > MAX_ITEMS) return 'Too many treatments.';

  const ids = new Set();
  for (const item of value.items) {
    if (!item || typeof item !== 'object') return 'Invalid treatment entry.';
    if (!isText(item.id, 80, true)) return 'Each treatment requires an internal ID.';
    if (ids.has(item.id)) return 'Treatment IDs must be unique.';
    ids.add(item.id);
    if (!['signature', 'beauty', 'coming-soon'].includes(item.category)) return 'One or more treatment categories are invalid.';
    if (!isText(item.title, 80, true)) return 'Each treatment requires a title.';
    if (!isText(item.shortDescription, 500, true)) return 'Each treatment requires a short description.';
    if (!isText(item.fullDescription, 4000)) return 'One or more full descriptions are too long.';
    if (!isText(item.price, 80, true)) return 'Each treatment requires a price.';
    if (!isText(item.duration, 80, true)) return 'Each treatment requires a treatment time.';
    if (!isText(item.detailedPricing, 2000)) return 'One or more detailed pricing fields are too long.';
    if (!isText(item.followUpPricing, 2000)) return 'One or more follow-up pricing fields are too long.';
    if (typeof item.patchTest !== 'boolean' || typeof item.visible !== 'boolean') return 'Treatment settings are invalid.';
    if (item.initialPriceLinked != null && typeof item.initialPriceLinked !== 'boolean') return 'Initial-price setting is invalid.';
  }
  return null;
}

export default async (request) => {
  const store = getStore({ name: STORE_NAME, consistency: 'strong' });

  if (request.method === 'GET') {
    const data = await store.get(KEY, { type: 'json' });
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
    return json({ error: 'Invalid treatment data.' }, 400);
  }

  const validationError = validateDocument(submitted);
  if (validationError) return json({ error: validationError }, 400);

  const updatedAt = new Date().toISOString();
  const data = {
    schemaVersion: 1,
    eyebrow: typeof submitted.eyebrow === 'string' ? submitted.eyebrow : 'Treatments',
    heading: typeof submitted.heading === 'string' ? submitted.heading : 'Treatment menu',
    intro: typeof submitted.intro === 'string' ? submitted.intro : '',
    updatedAt,
    items: submitted.items
  };

  await store.setJSON(KEY, data, {
    metadata: {
      updatedAt,
      updatedBy: user.email || user.id
    }
  });

  return json({ ok: true, updatedAt, data });
};
