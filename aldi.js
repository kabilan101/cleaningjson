import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { setTimeout } from "node:timers/promises";
import fs from "fs/promises";

puppeteer.use(StealthPlugin());

function normalize(text) {
  return (text || "").trim().toLowerCase();
}

async function loadExisting(path) {
  try {
    const raw = await fs.readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeResults(path, items) {
  await fs.writeFile(path, JSON.stringify(items, null, 2), "utf8");
}

function findProductCards() {
  const selectors = [
    "[data-testid=product-card]",
    ".product-card",
    ".product-tile",
    ".product-tiles__item",
    "a[href*='/products/']",
  ];
  for (const sel of selectors) {
    const list = document.querySelectorAll(sel);
    if (list.length > 0) return Array.from(list);
  }
  return [];
}

function extractText(el, selectors) {
  for (const sel of selectors) {
    const found = el.querySelector(sel);
    if (found && found.textContent?.trim()) return found.textContent.trim();
  }
  return "";
}

async function loadProductsList(path) {
  const raw = await fs.readFile(path, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function scrapeSearchResults(page, term) {
  const url = `https://www.aldi.com.au/results?q=${encodeURIComponent(term)}`;
  console.log(`Going to ${url}`);
  await page.goto(url, { waitUntil: "load" });
  console.log(`Page URL: ${await page.url()}`);
  console.log(`Page title: ${await page.title()}`);
  await setTimeout(2000);
  await page.screenshot({ path: 'aldi_debug.png', fullPage: true });

  const items = [];
  const seen = new Set();

  let lastCount = 0;
  let stableCounter = 0;

  while (true) {
    let productHandles = [];
    const selectors = ['[data-testid="product-card"]', '.product-card', '.product-tile', '.product-item', 'article', 'div.product'];
    for (const sel of selectors) {
      productHandles = await page.$$(sel);
      if (productHandles.length > 0) {
        console.log(`Found ${productHandles.length} products using selector: ${sel}`);
        break;
      }
    }

    if (productHandles.length === 0) {
      console.log(`No product handles found for term: ${term}`);
      break;
    }

    for (const producthandle of productHandles) {
      let title = "";
      let price = "";
      let image = "";
      let productId = "";

      try {
        title = await page.evaluate(
          (el) => {
            const candidates = el.querySelectorAll("h1, h2, h3, h4, .product-title, .product-name, .title, .name");
            for (const cand of candidates) {
              const text = cand.textContent?.trim();
              if (text) return text;
            }
            return "";
          },
          producthandle
        );
      } catch {}

      try {
        price = await page.evaluate(
          (el) => {
            const candidates = el.querySelectorAll(".price, .product-price, .cost, span, div");
            for (const cand of candidates) {
              const text = cand.textContent?.trim();
              if (text && /^\$?\d/.test(text)) return text;
            }
            return "";
          },
          producthandle
        );
      } catch {}

      try {
        image = await page.evaluate(
          (el) => el.querySelector("img")?.getAttribute("src") || el.querySelector("img")?.getAttribute("data-src") || "",
          producthandle
        );
      } catch {}

      try {
        productId = await page.evaluate(
          (el) => el.querySelector("a")?.getAttribute("href") || el.closest("a")?.getAttribute("href") || "",
          producthandle
        );
      } catch {}

      console.log(`Extracted: title="${title}", price="${price}", image="${image ? 'yes' : 'no'}", url="${productId}"`);

      const normalizedTitle = normalize(title);

      const key = `${productId}|${normalizedTitle}`;
      if (seen.has(key)) continue;
      seen.add(key);

      items.push({
        term,
        title,
        price,
        image,
        productId,
        url: productId ? `https://www.aldi.com.au${productId}` : "",
      });
    }

    const currentCount = items.length;
    if (currentCount === lastCount) {
      stableCounter += 1;
    } else {
      stableCounter = 0;
      lastCount = currentCount;
    }

    if (stableCounter >= 3) break;

    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await setTimeout(1500);
  }

  return items;
}

(async () => {
  const outPath = "aldi-product.json";
  const existing = await loadExisting(outPath);
  const seenKeys = new Set(existing.map((item) => `${item.url}|${item.title}`));

  const browser = await puppeteer.launch({
    headless: false,
    args: ["--enable-features=NetworkService,NetworkServiceInProcess"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const terms = await loadProductsList("products.txt");
  const allItems = [...existing];

  for (const term of terms) {
    console.log(`Searching for: ${term}`);
    try {
      const results = await scrapeSearchResults(page, term);
      let added = 0;
      for (const item of results) {
        const itemWithTerm = { term, ...item };
        const key = `${itemWithTerm.url}|${itemWithTerm.title}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          allItems.push(itemWithTerm);
          added += 1;
        }
      }
      console.log(`  found ${results.length} products, added ${added} new`);

      await writeResults(outPath, allItems);
      console.log(`  saved ${allItems.length} total items to ${outPath}`);

      await setTimeout(800);
    } catch (err) {
      console.error(`Error searching term '${term}':`, err);
    }
  }

  await browser.close();
  console.log(`Done. Total items: ${allItems.length}`);
})();
