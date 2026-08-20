const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const IG_APP_ID = '936619743392459';

function curl(args, { bodyMax = 10 * 1024 * 1024 } = {}) {
  const buf = execFileSync('curl', args, {
    maxBuffer: bodyMax,
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 25000,
  });
  return buf.toString('utf8');
}

function createCookieJar() {
  const f = path.join(os.tmpdir(), `zyro_cj_${Math.random().toString(36).slice(2)}.txt`);
  return f;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=0, no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const u = (req.query.u || '').toString().trim().replace(/^@/, '');
  if (!u || !/^[A-Za-z0-9._]{1,30}$/.test(u)) {
    return res.status(400).json({ ok: false, error: 'Invalid username' });
  }

  let cj;
  try {
    cj = createCookieJar();
    // Step 1: warm up the session with homepage to pick up cookies
    curl([
      '-sL', '--max-time', '20', '--compressed',
      '-A', UA,
      '-H', 'Accept-Language: en-US,en;q=0.9',
      '-H', 'Upgrade-Insecure-Requests: 1',
      '-H', 'Sec-Fetch-Dest: document',
      '-H', 'Sec-Fetch-Mode: navigate',
      '-H', 'Sec-Fetch-Site: none',
      '-H', 'Sec-Fetch-User: ?1',
      '-c', cj, '-b', cj,
      'https://www.instagram.com/'
    ], { bodyMax: 2 * 1024 * 1024 });

    // Step 2: web_profile_info API
    const apiURL = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(u)}`;
    const body = curl([
      '-sL', '--max-time', '25', '--compressed',
      '-A', UA,
      '-H', 'Accept: */*',
      '-H', 'Accept-Language: en-US,en;q=0.9',
      '-H', `Referer: https://www.instagram.com/${encodeURIComponent(u)}/`,
      '-H', `X-IG-App-ID: ${IG_APP_ID}`,
      '-H', 'X-ASBD-ID: 129477',
      '-H', 'X-IG-WWW-Claim: 0',
      '-H', 'X-Requested-With: XMLHttpRequest',
      '-H', 'Sec-Fetch-Dest: empty',
      '-H', 'Sec-Fetch-Mode: cors',
      '-H', 'Sec-Fetch-Site: same-origin',
      '-c', cj, '-b', cj,
      '-w', '\n__ZYRO_STATUS__:%{http_code}',
      apiURL
    ], { bodyMax: 10 * 1024 * 1024 });

    const m = body.match(/\n__ZYRO_STATUS__:(\d+)$/);
    const status = m ? parseInt(m[1], 10) : 0;
    const json = body.replace(/\n__ZYRO_STATUS__:\d+\s*$/, '');

    if (status === 404) {
      return res.json({ ok: false, error: `@${u} — username not found on Instagram.` });
    }
    if (status === 429 || status === 403) {
      return res.json({ ok: false, error: `Instagram is temporarily rate-limiting requests (HTTP ${status}). Wait 1-2 minutes and try again.` });
    }
    if (status !== 200) {
      return res.json({ ok: false, error: `Instagram returned HTTP ${status || 'error'}.` });
    }

    let data;
    try { data = JSON.parse(json); } catch (e) {
      return res.json({ ok: false, error: 'Invalid JSON from Instagram.' });
    }
    if (!data?.data?.user) {
      return res.json({ ok: false, error: data.message || 'Could not load profile — account may not exist or Instagram is blocking access.' });
    }

    const user = data.data.user;
    const out = {
      ok: true,
      username: user.username,
      fullName: user.full_name,
      profilePic: user.profile_pic_url_hd || user.profile_pic_url,
      bio: user.biography,
      followerCount: user.edge_followed_by?.count,
      followingCount: user.edge_follow?.count,
      postCount: user.edge_owner_to_timeline_media?.count,
      verified: !!user.is_verified,
      private: !!user.is_private,
      images: {},
    };

    if (out.private) {
      out.note = '🔒 Account is private — follow them first to extract posts.';
    } else {
      const edges = user.edge_owner_to_timeline_media?.edges || [];
      for (const e of edges) {
        const n = e.node;
        if (!n) continue;
        if (n.display_url) out.images[n.id] = n.display_url;
        if (n.edge_sidecar_to_children?.edges) {
          for (const c of n.edge_sidecar_to_children.edges) {
            const cn = c.node;
            if (cn?.display_url && !cn.is_video) {
              out.images[cn.id || (n.id + '_' + Math.random().toString(36).slice(2, 6))] = cn.display_url;
            }
          }
        }
      }
    }

    res.json(out);
  } catch (e) {
    const msg = (e.stderr ? e.stderr.toString() : '') || e.message || 'unknown';
    if (msg.includes('ETIMEDOUT') || msg.includes('timeout')) {
      return res.json({ ok: false, error: 'Request to Instagram timed out. Try again.' });
    }
    res.json({ ok: false, error: 'Error: ' + msg.slice(0, 300) });
  } finally {
    try { if (cj) fs.unlinkSync(cj); } catch(e) {}
  }
};
