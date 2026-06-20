import puppeteer from "@cloudflare/puppeteer";

const SUCCESS_PHRASES = [
  "uw reactie is doorgestuurd",
  "your response has been forwarded",
  "reactie is verstuurd",
  "reactie doorgestuurd",
  "contact is doorgestuurd",
  "response has been forwarded",
  "jouw reactie is doorgestuurd",
  "we hebben uw reactie",
];

export default {
  async fetch(request, env) {
    // Auth
    const auth = request.headers.get("Authorization");
    if (!env.WORKER_SECRET || auth !== `Bearer ${env.WORKER_SECRET}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (request.method !== "POST") {
      return Response.json({ error: "POST only" }, { status: 405 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { url, cookies } = body;

    if (!url || !url.includes("pararius.nl")) {
      return Response.json({ error: "Missing or invalid url" }, { status: 400 });
    }

    let browser;
    try {
      browser = await puppeteer.launch(env.MYBROWSER);
      const page = await browser.newPage();

      // Realistic Chrome UA — matches what Cloudflare expects
      await page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
      );

      // Set extra headers to look like a real browser navigation
      await page.setExtraHTTPHeaders({
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      });

      // Inject session cookies if provided (optional — improves success rate)
      if (cookies) {
        const cookiePairs = cookies.split(";").map((c) => c.trim()).filter(Boolean);
        const parsed = cookiePairs.map((pair) => {
          const idx = pair.indexOf("=");
          return {
            name: pair.slice(0, idx).trim(),
            value: pair.slice(idx + 1).trim(),
          };
        });

        // Set for both pararius.nl and pararius.com domains
        for (const domain of [".pararius.nl", ".pararius.com", "www.pararius.nl", "www.pararius.com"]) {
          await page.setCookie(...parsed.map((c) => ({ ...c, domain, path: "/" })));
        }
      }

      // Navigate — follows all redirects including Cloudflare JS challenge
      const response = await page.goto(url, {
        waitUntil: "networkidle0",
        timeout: 30000,
      });

      const finalUrl = page.url();
      const content = await page.content();
      const lower = content.toLowerCase();

      const success = SUCCESS_PHRASES.some((phrase) => lower.includes(phrase));
      const statusCode = response?.status() ?? null;

      return Response.json({
        success,
        finalUrl,
        statusCode,
        message: success
          ? "Reaction registered — confirmation text found on page"
          : `No confirmation found. Final URL: ${finalUrl}`,
      });
    } catch (err) {
      return Response.json(
        { success: false, error: err.message, message: "Worker error" },
        { status: 500 }
      );
    } finally {
      if (browser) await browser.close();
    }
  },
};
