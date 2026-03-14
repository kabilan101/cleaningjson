

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { setTimeout } from "node:timers/promises";
import fs from "fs/promises";

puppeteer.use(StealthPlugin());

function normalize(text) {
  return (text || "").trim().toLowerCase();
}

async function loadProductsList(path) {
  const raw = await fs.readFile(path, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function scrapeSearchResults(page, term) {
  const url = `https://www.woolworths.com.au/shop/search/products?searchTerm=${encodeURIComponent(term)}`;
  console.log(`Going to ${url}`);
  await page.goto(url, { waitUntil: "networkidle2" });
  console.log(`Page URL: ${await page.url()}`);
  console.log(`Page title: ${await page.title()}`);
  await setTimeout(3000);
  await page.screenshot({path: 'debug.png', fullPage: true});

  const items = [];
  const seen = new Set();

  try {
    await page.waitForSelector("wc-product-tile", { timeout: 20000 });
  } catch (e) {
    console.log("wc-product-tile not found, trying shared-product-tile");
    try {
      await page.waitForSelector("shared-product-tile", { timeout: 20000 });
    } catch (e2) {
      console.log("shared-product-tile not found, trying product-tile");
      await page.waitForSelector("product-tile", { timeout: 20000 });
    }
  }

  const productHandles = await page.$$("wc-product-tile") || await page.$$("shared-product-tile") || await page.$$("product-tile");

  if (productHandles.length === 0) {
    console.log("No product handles found");
    return items;
  }

  for (const productHandle of productHandles) {
    const shadowRoot = await productHandle.evaluateHandle((el) => el.shadowRoot);

    const getText = async (sel) => {
      const h = await shadowRoot.$(sel);
      return h ? h.evaluate((el) => el.textContent.trim()) : null;
    };

    let href = "";
    let title = "";
    let price = "";
    let image = "";

    try {
      href = await shadowRoot.$eval("section > div > div.product-tile-group.left > div > div > a", el => el.getAttribute("href"));
    } catch {}

    try {
      title = await getText("section .product-title-container a");
    } catch {}

    try {
      price = await getText("section .label-price-promotion .primary");
    } catch {}

    try {
      image = await page.evaluate(tile => {
        const img = tile.shadowRoot.querySelector("section > div > div.product-tile-group.left > div > div > a > img");
        return img ? img.getAttribute("src") : null;
      }, productHandle);
    } catch {}

    const normalizedTitle = normalize(title);
    if (!normalizedTitle.includes(normalize(term))) continue;

    const key = `${href}|${normalizedTitle}`;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      term,
      title,
      price,
      image,
      productId: href,
      url: href ? `https://www.woolworths.com.au${href}` : "",
    });
  }

  // Pagination logic here if needed, but for now skip to test

  return items;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: false,
    userDataDir: "./tmp",
    args: ["--enable-features=NetworkService,NetworkServiceInProcess"],
  });
  const page = await browser.newPage();

  const context = browser.defaultBrowserContext();
  await context.overridePermissions("https://www.woolworths.com.au", ["geolocation"]);
  await page.setGeolocation({ latitude: -33.8688, longitude: 151.2093 });

  const terms = await loadProductsList("products.txt");
  const allItems = [];

  for (const term of terms) {
    console.log("Searching for:", term);
    const results = await scrapeSearchResults(page, term);
    console.log(`  found ${results.length} matching products`);
    allItems.push(...results);
  }

  const outPath = "ww-product.json";
  await fs.writeFile(outPath, JSON.stringify(allItems, null, 2), "utf8");
  console.log(`Saved ${allItems.length} items to ${outPath}`);

  await browser.close();
})();
