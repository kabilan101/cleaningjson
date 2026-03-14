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
  const url = `https://www.igashop.com.au/search?q=${encodeURIComponent(term)}`;
  await page.goto(url, { waitUntil: "load" });
  await setTimeout(1000);

  try {
    await page.waitForSelector("button[data-modal-close]", { timeout: 3000 });
    await page.click("button[data-modal-close]");
    await page.waitForSelector("button[data-modal-close]", { hidden: true });
  } catch {
  }

  const items = [];
  const seen = new Set();

  let lastCount = 0;
  let stableCounter = 0;

  while (true) {
    await page.waitForSelector('[data-add-to-cart-button="true"]', { timeout: 10000 });

    const productButtons = await page.$$('[data-add-to-cart-button="true"]');
    for (const btn of productButtons) {
      let title = "",
        quantity = "",
        price = "",
        image = "",
        href = "";

      const cardSel = '[data-product-card]';

      try {
        title = await page.evaluate((el, sel) => {
          const card = el.closest(sel);
          const titleEl = card?.querySelector('a[data-variant="link"] span.line-clamp-3');
          return titleEl?.textContent.trim() ?? "";
        }, btn, cardSel);
      } catch {}

      try {
        quantity = await page.evaluate((el, sel) => {
          const card = el.closest(sel);
          const qtyEl = card?.querySelector('a[data-variant="link"] span:nth-of-type(2)');
          return qtyEl?.textContent.trim() ?? "";
        }, btn, cardSel);
      } catch {}

      try {
        price = await page.evaluate((el, sel) => {
          const card = el.closest(sel);
          const priceEl = card?.querySelector('span.font-bold.leading-none');
          return priceEl?.textContent.trim() ?? "";
        }, btn, cardSel);
      } catch {}

      try {
        image = await page.evaluate((el, sel) => {
          const card = el.closest(sel);
          const imgEl = card?.querySelector('img');
          return imgEl?.getAttribute('src') ?? "";
        }, btn, cardSel);
      } catch {}

      try {
        href = await page.evaluate((el, sel) => {
          const card = el.closest(sel);
          const linkEl = card?.querySelector('a[data-variant="link"]');
          return linkEl?.getAttribute('href') ?? "";
        }, btn, cardSel);
      } catch {}

      const normalizedTitle = normalize(title);
      const key = `${href}|${normalizedTitle}`;
      if (seen.has(key)) continue;
      seen.add(key);

      items.push({
        term,
        title,
        quantity,
        price,
        image,
        href,
        url: href ? `https://www.igashop.com.au${href}` : "",
      });
    }

    const nextBtn = await page.$('a[data-pagination-next]');
    if (nextBtn) {
      const disabled = await page.evaluate(el =>
        el.getAttribute('aria-disabled') === 'true', nextBtn
      );
      if (disabled) break;

      await Promise.all([
        nextBtn.click(),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
      ]);
      continue;
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
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: false,
    userDataDir: "./tmp",
    args: ["--enable-features=NetworkService,NetworkServiceInProcess"],
  });
  const page = await browser.newPage();

  const context = browser.defaultBrowserContext();
  await context.overridePermissions("https://www.igashop.com.au", ["geolocation"]);
  await page.setGeolocation({ latitude: -33.8688, longitude: 151.2093 });

  const outPath = "iga-product.json";
  const terms = await loadProductsList("products.txt");
  const allItems = [];

  for (const term of terms) {
    console.log("Searching for:", term);
    const results = await scrapeSearchResults(page, term);
    console.log(`  found ${results.length} matching products`);
    allItems.push(...results);
  }

  let existingItems = [];
  try {
    const existingData = await fs.readFile(outPath, "utf8");
    existingItems = JSON.parse(existingData);
  } catch {
  }

  existingItems.push(...allItems);

  await fs.writeFile(outPath, JSON.stringify(existingItems, null, 2), "utf8");
  console.log(`Appended ${allItems.length} items to ${outPath} (total: ${existingItems.length})`);

  await browser.close();
})();
