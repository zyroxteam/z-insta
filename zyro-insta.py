#!/usr/bin/env python3
"""
ZYROX — Instagram Gallery Extractor (POC)
CLI version — rebranded, no third-party credits/links.
"""
import os, sys, json, time, socket, threading, webbrowser
import requests
from bs4 import BeautifulSoup
from urllib.parse import unquote
from http.server import HTTPServer, SimpleHTTPRequestHandler

# ──────────────────── ZYROX Branding ────────────────────
ZYROX = "\033[96m"  # cyan
MAG   = "\033[95m"  # magenta
GRN   = "\033[92m"
YLW   = "\033[93m"
RED   = "\033[91m"
RST   = "\033[0m"
BOLD  = "\033[1m"
DIM   = "\033[2m"

BANNER = r"""
{z}{b}
   ╔═══════════════════════════════════════╗
   ║        ⚡ Z Y R O X  ⚡              ║
   ║   Instagram Gallery Extractor POC    ║
   ╚═══════════════════════════════════════╝
{r}""".format(z=ZYROX, b=BOLD, r=RST)

def _print(c, m): print(f"{c}{m}{RST}")

def get_headers():
    return {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'accept-language': 'en-GB,en;q=0.9',
        'dpr': '1',
        'sec-ch-prefers-color-scheme': 'dark',
        'sec-ch-ua': '"Google Chrome";v="124", "Not?A_Brand";v="8", "Chromium";v="124"',
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-model': '"Pixel 7"',
        'sec-ch-ua-platform': '"Android"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
        'user-agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        'viewport-width': '1000',
    }

def loading_animation():
    _print(ZYROX, "[•] Starting ZYROX Instagram Extractor\n")
    for i in range(1, 101):
        print(f"\r[•] Loading... {i}%", end="", flush=True)
        time.sleep(0.02)
    _print(GRN, "\r[✓] Loading Complete! 100%")
    print()

def fetch_instagram_profile(username):
    url = f'https://www.instagram.com/{username}/'
    _print(ZYROX, f"[*] Fetching profile: @{username}")
    try:
        r = requests.get(url, headers=get_headers(), timeout=15)
        if r.status_code != 200:
            _print(RED, f"[-] HTTP {r.status_code}")
            return None
        return r
    except Exception as e:
        _print(RED, f"[-] Error: {e}")
        return None

def decode_url(u):
    try:
        return unquote(u.encode('utf-8').decode('unicode_escape'))
    except Exception:
        return u

def extract_highest_resolution_urls(obj, urls=None, post_id=None):
    if urls is None: urls = {}
    try:
        if isinstance(obj, dict):
            if 'pk' in obj and isinstance(obj.get('pk'), str):
                post_id = obj['pk']
            if 'image_versions2' in obj:
                cands = obj['image_versions2'].get('candidates', [])
                if cands:
                    best = max(cands, key=lambda x: x.get('width',0)*x.get('height',0))
                    u = best.get('url','')
                    if u and post_id and post_id not in urls:
                        urls[post_id] = decode_url(u)
            for v in obj.values():
                extract_highest_resolution_urls(v, urls, post_id)
        elif isinstance(obj, list):
            for it in obj:
                extract_highest_resolution_urls(it, urls, post_id)
    except Exception:
        pass
    return urls

def extract_timeline_data(html):
    try:
        soup = BeautifulSoup(html, 'html.parser')
        for s in soup.find_all('script', {'type':'application/json'}):
            c = s.string
            if c and 'image_versions2' in c:
                try: return json.loads(c)
                except: continue
    except: pass
    # _sharedData fallback
    m = __import__('re').search(r'window\._sharedData\s*=\s*(\{.+?\});', html)
    if m:
        try: return json.loads(m.group(1))
        except: pass
    return None

def generate_gallery_html(post_urls, username):
    total = len(post_urls)
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ZYROX — @{username} Gallery</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:'Segoe UI',Roboto,sans-serif;background:#0a0a14;color:#e8e8ff;min-height:100vh;padding:20px;
  background-image:radial-gradient(circle at 20% 30%,rgba(0,240,255,.1),transparent 50%),radial-gradient(circle at 80% 70%,rgba(255,0,229,.1),transparent 50%)}}
.wrap{{max-width:1400px;margin:0 auto;background:linear-gradient(145deg,#13132a,#0a0a1a);border-radius:25px;padding:30px;box-shadow:0 20px 60px rgba(0,0,0,.6),0 0 40px rgba(0,240,255,.1);border:1px solid rgba(0,240,255,.15)}}
.hdr{{text-align:center;padding:30px;background:linear-gradient(135deg,rgba(0,240,255,.1),rgba(255,0,229,.1));border-radius:18px;margin-bottom:25px;border:1px solid rgba(0,240,255,.2)}}
.logo{{font-size:2.8em;font-weight:900;background:linear-gradient(135deg,#00f0ff,#ff00e5,#39ff14);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;letter-spacing:-1px}}
.uname{{font-size:1.3em;margin-top:10px;color:#00f0ff}}
.stat{{margin-top:15px;padding:15px;background:rgba(0,0,0,.3);border-radius:12px;border:1px solid rgba(57,255,20,.3);color:#39ff14;font-weight:700}}
.gal{{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;padding:10px}}
.card{{background:linear-gradient(145deg,#1a1a35,#0d0d20);border-radius:18px;overflow:hidden;box-shadow:0 8px 20px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.04);transition:all .3s}}
.card:hover{{transform:translateY(-6px);box-shadow:0 12px 30px rgba(0,240,255,.3),0 0 40px rgba(255,0,229,.15);border-color:rgba(0,240,255,.4)}}
.ic{{background:#000;display:flex;justify-content:center;align-items:center;min-height:350px}}
.ic img{{max-width:100%;max-height:500px;object-fit:contain;cursor:zoom-in}}
.ft{{padding:12px;display:flex;gap:8px}}
.dl{{flex:1;padding:10px;background:linear-gradient(135deg,#00f0ff,#ff00e5);color:#fff;text-decoration:none;border-radius:10px;text-align:center;font-weight:700;text-transform:uppercase;font-size:.85em;letter-spacing:1px}}
.foot{{text-align:center;margin-top:35px;padding:20px;color:#7a7ab0;letter-spacing:2px;border-top:1px solid rgba(0,240,255,.1)}}
.zy{{color:#00f0ff;font-weight:700;text-shadow:0 0 10px rgba(0,240,255,.5)}}
.lb{{display:none;position:fixed;inset:0;background:rgba(5,5,15,.95);z-index:9999;justify-content:center;align-items:center;padding:20px;cursor:zoom-out}}
.lb.on{{display:flex}}.lb img{{max-width:95%;max-height:95%;border-radius:12px;box-shadow:0 0 60px rgba(0,240,255,.4)}}
@media(max-width:600px){{.gal{{grid-template-columns:1fr}}.logo{{font-size:2em}}.wrap{{padding:15px}}}}
</style></head><body>
<div class="wrap">
<div class="hdr"><div class="logo">⚡ ZYROX</div><div class="uname">@{username}</div>
<div class="stat">✅ Extracted {total} posts · Full resolution</div></div>
<div class="gal" id="gal"></div>
<div class="foot"><span class="zy">⚡ ZYROX</span> · Instagram Gallery Extractor · POC</div>
</div>
<div class="lb" id="lb" onclick="this.classList.remove('on')"><img id="lbi" src=""></div>
<script>
const imgs={json.dumps(post_urls)};
const g=document.getElementById('gal');
Object.entries(imgs).forEach(([pid,u],i)=>{{
  const d=document.createElement('div');d.className='card';
  d.innerHTML=`<div class="ic"><img src="${{u}}" loading="lazy" onclick="document.getElementById('lbi').src='${{u}}';document.getElementById('lb').classList.add('on')"></div>
  <div class="ft"><a class="dl" href="${{u}}" target="_blank" download="${{pid}}.jpg">📥 Download</a></div>`;
  g.appendChild(d);
}});
document.addEventListener('keydown',e=>{{if(e.key==='Escape')document.getElementById('lb').classList.remove('on')}});
</script></body></html>"""

def generate_unsuccessful_html(username):
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ZYROX — @{username}</title>
<style>
body{{font-family:'Segoe UI',Roboto,sans-serif;background:#0a0a14;color:#e8e8ff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;
background-image:radial-gradient(circle at 30% 30%,rgba(255,50,50,.1),transparent 50%)}}
.box{{max-width:500px;padding:50px;background:linear-gradient(145deg,#13132a,#0a0a1a);border-radius:25px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.6);border:1px solid rgba(255,50,50,.3)}}
.logo{{font-size:2.5em;font-weight:900;background:linear-gradient(135deg,#00f0ff,#ff00e5);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}}
.err{{margin-top:25px;padding:25px;background:rgba(255,50,50,.1);border:2px solid rgba(255,50,50,.4);border-radius:15px;color:#ff6b6b;font-size:1.3em;font-weight:700}}
</style></head><body>
<div class="box"><div class="logo">⚡ ZYROX</div>
<p style="margin-top:10px;color:#7a7ab0">@{username}</p>
<div class="err">❌ Unsuccessful<br><span style="font-size:.6em;font-weight:400;display:block;margin-top:10px">No posts found, account private, or blocked</span></div>
</div></body></html>"""

def start_local_server(html_content, port=8080, successful=True):
    fn = f'zyro_gallery_{int(time.time())}.html'
    with open(fn,'w',encoding='utf-8') as f: f.write(html_content)
    class H(SimpleHTTPRequestHandler):
        def do_GET(self):
            self.path = '/' + fn
            return super().do_GET()
        def log_message(self, *a): pass
    def run():
        s = HTTPServer(('localhost', port), H)
        s.serve_forever()
    t = threading.Thread(target=run, daemon=True); t.start()
    time.sleep(1)
    url = f'http://localhost:{port}'
    _print(GRN, f"\n[✓] Server running at {url}")
    try: webbrowser.open(url)
    except: pass
    return fn

def save_results(images, username, ok=True):
    if ok:
        txt = f'zyro_{username}_urls.txt'
        with open(txt,'w',encoding='utf-8') as f:
            f.write(f"ZYROX Instagram Gallery Extractor — @{username}\n{'='*70}\nTotal: {len(images)}\n\n")
            for pid, u in images.items():
                f.write(f"POST {pid}\nURL: {u}\n{'-'*70}\n")
        _print(GRN, f"[+] URLs saved → {txt}")
        return generate_gallery_html(images, username)
    return generate_unsuccessful_html(username)

def main():
    os.system('clear' if os.name=='posix' else 'cls')
    print(BANNER)
    username = input(f"{ZYROX}[?] Enter Instagram username: {RST}").strip().lstrip('@')
    if not username:
        _print(RED, "[-] Username required"); return
    loading_animation()
    resp = fetch_instagram_profile(username)
    if not resp:
        html = save_results({}, username, False)
        start_local_server(html, successful=False)
    else:
        tl = extract_timeline_data(resp.text)
        imgs = extract_highest_resolution_urls(tl) if tl else {}
        if not imgs:
            # regex fallback
            import re
            found = set(re.findall(r'https?://(?:scontent|instagram)[^"\'<>\s]+\.(?:jpg|jpeg|png|webp)[^"\'<>\s]*', resp.text))
            for i,u in enumerate(list(found)[:24]):
                imgs[f'img_{i}'] = u.replace('\\u0026','&').replace('\\/','/')
        if imgs:
            _print(GRN, f"\n{'='*60}\n✅ SUCCESS — {len(imgs)} posts extracted\n{'='*60}\n")
            html = save_results(imgs, username, True)
        else:
            _print(RED, "\n❌ No posts extracted")
            html = save_results({}, username, False)
        start_local_server(html, successful=bool(imgs))
    try:
        while True: time.sleep(1)
    except KeyboardInterrupt:
        _print(YLW, "\n\n[!] Stopped")

if __name__ == "__main__":
    main()
