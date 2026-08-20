# ⚡ ZYROX — Instagram Gallery Extractor

**POC tool** — extracts publicly-visible Instagram post images from any profile and renders them in a beautiful neon claymorphism gallery. Includes a web UI (deployable to Vercel in one click) and a CLI version.

## 🌐 Web (Vercel)

Open the live URL, type a username, click **Extract**. Full-res images appear instantly in a responsive gallery with one-click download + lightbox.

## 💻 CLI

```bash
pip install requests beautifulsoup4
python3 zyro-insta.py
```

A local HTTP server auto-starts on `http://localhost:8080` and opens the gallery.

## 📦 Deploy to Vercel

```bash
npx vercel --prod
```

No environment variables required. The `api/fetch.js` serverless function proxies Instagram requests server-side (bypasses browser CORS).

## ⚠️ Notes

- This is a **proof-of-concept**. Instagram rate-limits and blocks automated scraping; if you get empty results, retry after a few minutes.
- Works best against **public** profiles. Private profiles will return empty (Instagram does not expose their media to unauthenticated guests).
- No credentials, tokens, or login required.
- Use responsibly and only on content you have the right to access.

## ⚡ ZYROX
