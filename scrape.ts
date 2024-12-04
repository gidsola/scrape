import urlParser, { fileURLToPath } from "url";
import axios from "axios";
import fs from "fs/promises";
import path from "path";
import puppeteer, { Page } from "puppeteer";
import * as cheerio from "cheerio";

interface Link {
  href: string;
  text: string;
};

interface IndexItem {
  tagName: string;
  text: string;
  links: Link[];
};

interface PageContent {
  Topic: string;
  Content: string;
};

async function initialParse(url: string): Promise<string | Error> {
  try {
    const
      browser = await puppeteer.launch({
        headless: true,
        defaultViewport: null,
        devtools: false,
        userDataDir: "./tmp",
        //ignoreHTTPSErrors: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-software-rasterizer",
          //"--single-process",
          "--no-zygote",
          "--disable-features=IsolateOrigins,site-per-process",
        ],
      }),
      page = await browser.newPage();

    await page.setJavaScriptEnabled(true);
    await page.setViewport({
      width: 1200,
      height: 800
    });

    page
      .on("dialog", async (dialog) => {
        await dialog.dismiss();
      })
      .on("popup", async (popup) => {
        if (!popup) return
        await popup.close();
      });

    await page.goto(url);
    await autoScroll(page);
    const content = await page.content();
    await browser.close();

    return content;
  } catch (e: any) {
    if (e instanceof Error) return e;
    else return new Error(e);
  }
};

async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const
        distance = 100,
        timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight - window.innerHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
    });
  });
};

async function parseWebsite(url: string): Promise<IndexItem[] | Error> {
  console.log("Parsing URL:", url);

  const response = await initialParse(url);
  if (response instanceof Error)
    return response;

  const
    $ = cheerio.load(response),
    index: IndexItem[] = [];

  $("*").each((i, element) => {
    const
      tagName = element.nodeType === 1 ? element.name : "",
      text = $(element).text().trim(),
      links: Link[] = [];

    if (tagName === "a") {
      const href = $(element).attr("href");
      if (href && text) links.push({ href, text });
    };
    index.push({ tagName, text, links });
  });

  return index;
};

async function parsePageContent(url: string): Promise<string | Error> {
  try {
    const
      response = await axios.get(url),
      $ = cheerio.load(response.data);

    return $("body").html() || "";
  } catch (e: any) {
    if (e instanceof Error) return e;
    else return new Error(e);
  }
};

async function parsePages(url: string, links: Link[]): Promise<PageContent[] | Error> {
  try {
    const pageContent: PageContent[] = [];
    for (const link of links) {
      const
        absoluteUrl = urlParser.resolve(url, link.href),
        baseDomain = new URL(url).hostname;

      if (absoluteUrl.includes(baseDomain)) {
        const content = await parsePageContent(absoluteUrl);
        if (content instanceof Error) continue;

        const
          $ = cheerio.load(content),
          article = $("article").text(),
          p = $("p").text(),
          span = $("span").text(),
          longest = [article, p, span].reduce((a, b) => a.length > b.length ? a : b, ''),
          cleanText = longest.replace(/\s+/g, ' ');

        pageContent.push({ 'Topic': link.text, 'Content': cleanText });
      } else {
        console.log("Storing External Link:", absoluteUrl);
        pageContent.push({ 'Topic': link.text, 'Content': link.href });
      }
    }

    const uniqueContent = [...new Map(pageContent.map(item => [item['Content'], item])).values()];
    pageContent.length = 0;
    pageContent.push(...uniqueContent);

    const
      _dirname = path.dirname(fileURLToPath(import.meta.url)),
      exists = await fs.access(path.join(_dirname, "gathered")).then(() => true).catch(() => false);

    if (!exists) await fs.mkdir(path.join(_dirname, "gathered"), { recursive: true });

    const pageContentPath = path.join(_dirname, `gathered/${new URL(url).hostname}.json`);
    await fs.writeFile(pageContentPath, JSON.stringify(pageContent, null, 2));

    return pageContent;
  } catch (e: any) {
    if (e instanceof Error) return e;
    else return new Error(e);
  }
};

export async function learnUrl(domain?: string): Promise<PageContent[] | Error> {
  const url = domain !== undefined ? domain : null;
  if (url === null)
    return new Error("No URL provided.");

  console.log("Learning URL:", url);

  const index = await parseWebsite(url);
  if (index instanceof Error)
    return index;

  const localLinks = index.flatMap((item) => item.links) || [];
  const returned = await parsePages(url, localLinks);

  if (returned instanceof Error)
    return returned;

  console.log("Returned", returned);
  return returned;
};





//const ready = await prepareFromWebsite('drive', "https://www.website.here");
//const ready = await prepareFromGooglePDF('drive', "https://drive.google.com/file/");

// const question = 'Present the document in a conversational manner. Be sure to be concise and informative.';
// const useColl = 'drive';

// async function dostuff() {
// const result = await textualProximitySearch(useColl, question, 20);

// const knowledge = [];

// for await (const object of result.objects) {
//   Object.entries(object.properties).forEach(([key, value]) => {
//     knowledge.push(key.toString() + "=" + value.toString() + " ");
//   });
// };
// console.log("Knowledge", knowledge);
// const ai = await PlainMistralChatCompletion(question, knowledge.join(''));

// console.log("AI Response", ai.choices[0].message.content);
// };