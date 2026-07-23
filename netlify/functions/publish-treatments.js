const FILE_PATH = 'content/treatments.json';

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed.' });
  const user = context.clientContext && context.clientContext.user;
  if (!user) return response(401, { error: 'Authorised login required.' });

  const token = process.env.GITHUB_CONTENT_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!token || !repository) return response(500, { error: 'Publishing connection is not configured.' });

  let content;
  try { content = JSON.parse(event.body || '{}'); }
  catch { return response(400, { error: 'Invalid treatment data.' }); }

  if (!content || !Array.isArray(content.items)) return response(400, { error: 'Treatment list is missing.' });
  for (const item of content.items) {
    if (!item || typeof item.name !== 'string' || !item.name.trim() || typeof item.price !== 'string' || typeof item.description !== 'string') {
      return response(400, { error: 'Each treatment requires a name, price and description.' });
    }
  }

  const apiUrl = `https://api.github.com/repos/${repository}/contents/${FILE_PATH}`;
  const headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'effortless-beauty-manager'
  };

  try {
    const current = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, { headers });
    if (!current.ok) throw new Error(`Unable to read current content (${current.status}).`);
    const currentFile = await current.json();
    const encoded = Buffer.from(`${JSON.stringify(content, null, 2)}\n`, 'utf8').toString('base64');
    const commit = await fetch(apiUrl, {
      method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Update treatments via Effortless Beauty manager (${user.email || user.id})`,
        content: encoded,
        sha: currentFile.sha,
        branch
      })
    });
    const result = await commit.json();
    if (!commit.ok) throw new Error(result.message || `GitHub update failed (${commit.status}).`);
    return response(200, { ok: true, commit: result.commit && result.commit.sha });
  } catch (error) {
    return response(502, { error: error.message || 'Publishing service failed.' });
  }
};

function response(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}
