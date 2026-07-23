import { getStore } from '@netlify/blobs';
import { getUser } from '@netlify/identity';

const STORE_NAME = 'effortless-beauty-content';
const KEY = 'treatments';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }
});

function validateDocument(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.items)) {
    return 'Treatment list is missing.';
  }
  if (value.items.length > 100) return 'Too many treatments.';

  for (const item of value.items) {
    if (!item || typeof item !== 'object') return 'Invalid treatment entry.';
    if (typeof item.id !== 'string' || !item.id.trim()) return 'Each treatment requires an internal ID.';
    if (typeof item.name !== 'string' || !item.name.trim()) return 'Each treatment requires a name.';
    if (typeof item.price !== 'string' || !item.price.trim()) return 'Each treatment requires a price.';
    if (typeof item.description !== 'string' || !item.description.trim()) return 'Each treatment requires a description.';
    if (item.name.length > 80 || item.price.length > 40 || item.description.length > 500) {
      return 'One or more treatment fields are too long.';
    }
    if (item.bookingUrl && typeof item.bookingUrl === 'string') {
      try {
        const url = new URL(item.bookingUrl);
        if (!['https:', 'http:'].includes(url.protocol)) return 'Booking links must use HTTP or HTTPS.';
      } catch {
        return 'One or more booking links are invalid.';
      }
    }
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

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'Invalid treatment data.' }, 400);
  }

  const validationError = validateDocument(data);
  if (validationError) return json({ error: validationError }, 400);

  await store.setJSON(KEY, data, {
    metadata: {
      updatedAt: new Date().toISOString(),
      updatedBy: user.email || user.id
    }
  });

  return json({ ok: true, updatedAt: new Date().toISOString() });
};
