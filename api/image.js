// ZYROX Instagram Image Proxy — bypasses Instagram CDN hotlink/CORS protection
// Usage: /api/image?url=<encoded instagram cdn url>
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Whitelist: only proxy Instagram CDN URLs to prevent abuse
const ALLOWED_HOSTS = [
  /^scontent[-\w]*\.cdninstagram\.com$/i,
  /^scontent[-\w]*\.instagram\.com$/i,
  /^instagram[-\w]*\.fbcdn\.net$/i,
  /^scontent[-\w]*\.fbcdn\.net$/i,
];

function isAllowed(u){
  try{
    const host = new URL(u).hostname;
    return ALLOWED_HOSTS.some(p => p.test(host));
  }catch(e){ return false; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const imageUrl = (req.query.url || '').toString();
  if (!imageUrl || !isAllowed(imageUrl)) {
    return res.status(400).send('Invalid or disallowed URL');
  }

  let tmpFile = null;
  try {
    tmpFile = path.join(os.tmpdir(), `zyro_img_${Date.now()}_${Math.random().toString(36).slice(2)}.bin`);

    // Fetch the image via curl to the temp file
    execFileSync('curl', [
      '-sL', '--max-time', '20', '--compressed',
      '-A', UA,
      '-H', 'Accept: image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      '-H', 'Accept-Language: en-US,en;q=0.9',
      '-H', 'Referer: https://www.instagram.com/',
      '-H', 'Sec-Fetch-Dest: image',
      '-H', 'Sec-Fetch-Mode: no-cors',
      '-H', 'Sec-Fetch-Site: cross-site',
      '-o', tmpFile,
      imageUrl
    ], { timeout: 25000 });

    const stat = fs.statSync(tmpFile);
    if (stat.size < 100) {
      throw new Error(`Image too small (${stat.size}B) — likely blocked`);
    }

    // Detect content type from magic bytes
    let contentType = 'image/jpeg';
    const header = Buffer.alloc(16);
    const fd = fs.openSync(tmpFile, 'r');
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);
    if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) contentType = 'image/png';
    else if (header[0] === 0xFF && header[1] === 0xD8) contentType = 'image/jpeg';
    else if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) contentType = 'image/gif';
    else if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46) contentType = 'image/webp';
    else if (header.slice(4,12).toString() === 'ftypavif' || header.slice(4,12).toString() === 'ftypavis') contentType = 'image/avif';

    const wantDownload = req.query.download === '1';
    const ext = contentType.split('/')[1] || 'jpg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, immutable');
    res.setHeader('Content-Disposition', `${wantDownload?'attachment':'inline'}; filename="zyro_${Date.now()}.${ext}"`);

    const stream = fs.createReadStream(tmpFile);
    stream.pipe(res);
    stream.on('end', () => { try { fs.unlinkSync(tmpFile); } catch(e){} });
    stream.on('error', () => { try { fs.unlinkSync(tmpFile); } catch(e){} res.end(); });

  } catch(e) {
    if (tmpFile) try { fs.unlinkSync(tmpFile); } catch(ee){}
    res.status(502).setHeader('Content-Type', 'text/plain').send('Image fetch failed: ' + (e.message||'unknown'));
  }
};
