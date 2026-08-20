const https = require('https');
const http = require('http');

const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

function fetchURL(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        ...headers,
      },
      timeout: 15000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchURL(res.headers.location, headers));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', c => buf += c);
      res.on('end', () => resolve(buf));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function walkFor(obj, predicate, results = [], seen = new Set()) {
  if (!obj || typeof obj !== 'object') return results;
  if (seen.has(obj)) return results;
  seen.add(obj);
  if (predicate(obj)) results.push(obj);
  if (Array.isArray(obj)) {
    for (const it of obj) walkFor(it, predicate, results, seen);
  } else {
    for (const k of Object.keys(obj)) walkFor(obj[k], predicate, results, seen);
  }
  return results;
}

function extractImages(root) {
  const urls = {};
  const nodes = walkFor(root, n => n && typeof n === 'object' && n.image_versions2 && Array.isArray(n.image_versions2.candidates));
  for (const n of nodes) {
    const cands = n.image_versions2.candidates.filter(c => c && c.url);
    if (!cands.length) continue;
    cands.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    const pk = (n.pk || n.id || (Math.random().toString(36).slice(2))).toString();
    let url = cands[0].url;
    // fix escaped \/\/ sequences
    url = url.replace(/\\u0026/g, '&').replace(/\\\//g, '/');
    if (!urls[pk]) urls[pk] = url;
  }
  return urls;
}

function extractProfile(html) {
  // Try __additionalDataLoaded or window.__INITIAL_STATE__ pattern
  let data = null;
  // Look for LDS / application/ld+json for basic profile
  let profilePic = null, bio = null;

  // window.__INITIAL_STATE__ or _sharedData regex
  const m1 = html.match(/window\._sharedData\s*=\s*(\{.+?\});\s*<\/script>/s);
  if (m1) { try { data = JSON.parse(m1[1]); } catch(e){} }
  if (!data) {
    const m2 = html.match(/<script[^>]*>\s*window\.__INITIAL_STATE__\s*=\s*(\{.+?\});\s*<\/script>/s);
    if (m2) { try { data = JSON.parse(m2[2]||m2[1]); } catch(e){} }
  }

  // Also try any script type="application/json" containing timeline info
  if (!data) {
    const scripts = [...html.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)];
    for (const s of scripts) {
      try {
        const j = JSON.parse(s[1]);
        if (j && typeof j === 'object') {
          // see if it contains image_versions2
          if (JSON.stringify(j).includes('image_versions2')) { data = {raw: j}; break; }
        }
      } catch(e){}
    }
  }

  // og:image fallback for profile pic
  const og = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/);
  if (og) profilePic = og[1];
  const ogBio = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/);
  if (ogBio) bio = ogBio[1];

  let images = {};
  if (data) {
    // _sharedData structure: entry_data.ProfilePage[0].graphql.user...
    try {
      const entry = data?.entry_data?.ProfilePage?.[0]?.graphql?.user;
      if (entry) {
        profilePic = entry.profile_pic_url_hd || entry.profile_pic_url || profilePic;
        bio = entry.biography || bio;
        const edges = entry.edge_owner_to_timeline_media?.edges || [];
        for (const e of edges) {
          const node = e?.node;
          if (!node) continue;
          const url = node.display_url;
          if (url) images[node.id || String(Math.random().toString(36).slice(2))] = url;
        }
      }
    } catch(e){}

    // Newer API: walk for image_versions2 in case we got raw JSON
    const more = extractImages(data);
    Object.assign(images, more);
  }

  // Last resort: regex-scrape for display_url
  if (Object.keys(images).length === 0) {
    const urls = new Set();
    const re = /https?:\\?\/\\?\/instagram[^"']*?\.(?:jpg|jpeg|png|webp)[^"'\s<]*/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      let u = m[0].replace(/\\u0026/g,'&').replace(/\\\//g,'/');
      if (!u.includes('profile') && !u.includes('sprite') && !u.includes('logo') && (u.includes('scontent') || u.includes('cdninstagram'))) {
        urls.add(u);
      }
    }
    let i = 0;
    for (const u of urls) {
      if (i >= 24) break;
      images['img_'+(i++)] = u;
    }
  }

  return { profilePic, bio, images };
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=0, no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const u = (req.query.u || '').toString().trim().replace(/^@/, '');
  if (!u || !/^[A-Za-z0-9._]{1,30}$/.test(u)) {
    return res.status(400).json({ ok: false, error: 'Invalid username' });
  }

  try {
    const html = await fetchURL(`https://www.instagram.com/${encodeURIComponent(u)}/`);
    if (!html || html.length < 500) {
      return res.json({ ok: false, error: 'Empty response from Instagram' });
    }
    if (html.includes('login') && html.length < 5000) {
      return res.json({ ok: false, error: 'Instagram is requiring login / blocking this request. Try again later.' });
    }
    const out = extractProfile(html);
    if (!Object.keys(out.images).length) {
      return res.json({ ok: true, profilePic: out.profilePic, bio: out.bio, images: {}, note: 'No posts extracted — account likely private or Instagram blocked.' });
    }
    res.json({ ok: true, ...out });
  } catch (e) {
    res.json({ ok: false, error: 'Network error: ' + e.message });
  }
};
