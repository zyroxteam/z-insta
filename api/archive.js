// ZYROX — Archive.org / Wayback snapshot lookup for Instagram profiles
// Legal, public-archive only — returns any cached historical snapshots
const { execFileSync } = require('child_process');

const UA = 'Mozilla/5.0 (compatible; ZyroArchive/1.0; +https://github.com/zyroxteam)';

function curlJSON(url, timeout = 15) {
  try {
    const out = execFileSync('curl', [
      '-sL', '--max-time', String(timeout), '--compressed',
      '-A', UA,
      '-H', 'Accept: application/json',
      url
    ], { timeout: (timeout + 3) * 1000, maxBuffer: 10 * 1024 * 1024 });
    return JSON.parse(out.toString('utf8'));
  } catch(e) { return null; }
}

function curlHEAD(url, timeout = 10) {
  try {
    const out = execFileSync('curl', [
      '-sI', '--max-time', String(timeout),
      '-A', UA,
      '-o', '/dev/null',
      '-w', '%{http_code} %{url_effective}',
      url
    ], { timeout: (timeout + 3) * 1000 }).toString('utf8').trim().split(' ');
    return { status: parseInt(out[0], 10), url: out.slice(1).join(' ') };
  } catch(e) { return null; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300'); // cache 5 min
  if (req.method === 'OPTIONS') return res.status(200).end();

  const u = (req.query.u || '').toString().trim().replace(/^@/, '');
  if (!u || !/^[A-Za-z0-9._]{1,30}$/.test(u)) {
    return res.status(400).json({ ok: false, error: 'Invalid username' });
  }

  const profileURL = `https://www.instagram.com/${u}/`;
  const result = {
    ok: true,
    username: u,
    profileURL,
    waybackSnapshots: [],
    googleCacheURL: null,
    archiveTodayURL: null,
    note: null
  };

  try {
    // 1) Wayback Machine CDX — try multiple URL variants (HTTPS, HTTP, www, non-www) because
    // CDX has been flaky and Instagram URLs have been archived under many schemes over time.
    const eu = encodeURIComponent(u);
    const cdxQueries = [
      `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent('https://www.instagram.com/'+u+'/')}*&matchType=prefix&output=json&fl=timestamp,original,mimetype,statuscode&filter=statuscode:200&filter=mimetype:text/html|image/jpeg|image/png|image/webp&collapse=urlkey&limit=40`,
      `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent('http://instagram.com/'+u+'/')}*&matchType=prefix&output=json&fl=timestamp,original,mimetype,statuscode&filter=statuscode:200&filter=mimetype:text/html|image/jpeg|image/png|image/webp&collapse=urlkey&limit=40`,
      `https://web.archive.org/cdx/search/cdx?url=instagram.com/${eu}/*&output=json&fl=timestamp,original,mimetype,statuscode&filter=statuscode:200&collapse=urlkey&limit=20`
    ];
    let wb = null;
    for (const cdx of cdxQueries) {
      wb = curlJSON(cdx, 15);
      if (wb && Array.isArray(wb) && wb.length > 1) break;
    }
    if (wb && Array.isArray(wb) && wb.length > 1) {
      const ul = u.toLowerCase();
      for (let i = 1; i < wb.length; i++) {
        const row = wb[i];
        if (!row || row.length < 4) continue;
        const [ts, original, mime, status] = row;
        if (status !== '200') continue;
        const lower = original.toLowerCase();
        const isUserURL =
          (lower.includes(`instagram.com/${ul}/`) || lower.includes(`instagram.com/${ul}`)) &&
          !lower.includes('instagram.com.') && !lower.includes('instagram.co/');
        if (!isUserURL) continue;
        if (/\/(accounts|about|legal|explore|developer|static)/i.test(original)) continue;
        const isImage = mime.startsWith('image/');
        const isProfile = lower.endsWith('/' + ul) || lower.endsWith('/' + ul + '/');
        const isPost = /\/p\/[a-z0-9_-]+/i.test(original) || /\/reel\/[a-z0-9_-]+/i.test(original);
        if (!isProfile && !isPost && !isImage) continue;
        const date = `${ts.slice(0,4)}-${ts.slice(4,6)}-${ts.slice(6,8)}`;
        result.waybackSnapshots.push({
          date, isImage, mime, original,
          view: `https://web.archive.org/web/${ts}/${original}`,
          timestamp: ts,
          kind: isImage ? 'image' : (isProfile ? 'profile' : 'post')
        });
      }
      const seen = new Set();
      result.waybackSnapshots = result.waybackSnapshots.filter(s => {
        if (seen.has(s.view)) return false;
        seen.add(s.view); return true;
      });
      result.waybackSnapshots.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      result.waybackSnapshots = result.waybackSnapshots.slice(0, 25);
    }

    // 2) Always provide direct links (work even if CDX is down)
    result.waybackLatest = `https://web.archive.org/web/2/https://www.instagram.com/${eu}/`;
    result.archiveTodayURL = `https://archive.ph/newest/https://www.instagram.com/${eu}/`;
    result.googleCacheURL = `https://www.google.com/search?q=%22instagram.com%2F${eu}%22`;
  } catch (e) {
    result.note = 'Archive lookup error: ' + e.message;
  }

  res.json(result);
};
