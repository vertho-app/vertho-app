import { verifyOfflinePanels } from './verify-demo-offline-panels.mts';
import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { offlineEnvironment } from "../lib/demo/offline/environment.ts";
import { ARQUIVO_MIDIA, MIDIA_OFFLINE, STORAGE_PUBLICO } from "../lib/demo/offline/midia-rewrites.mjs";

const tenant = process.argv.includes("--acme") ? "acme-demo" : "escolas-acme";
const environment = offlineEnvironment(tenant);
const base = environment.base;
const mediaToRemove =
  tenant === "acme-demo"
    ? "media/urgencia-video.mp4"
    : "media/semana-1-video.mp4";
const screenshotPrefix = `.tmp/offline-${tenant}`;

// Manual canary with real public demo media. No accounts, writes or AI calls.
const directory = resolve(".tmp/offline-browser-" + Date.now());
await mkdir(directory, { recursive: true });
const explicitOrigin = process.argv
  .find((arg) => arg.startsWith("--origin="))
  ?.slice(9);
const checkIsolation = tenant === "acme-demo" && !explicitOrigin;
let server: ReturnType<typeof createServer> | undefined;
let updatePublished = false;
if (!explicitOrigin) {
  server = createServer(async (req, res) => {
    const path = new URL(req.url!, "http://localhost").pathname;
    const allowed =
      path.startsWith(base) ||
      (checkIsolation &&
        (path.startsWith("/apresentacao-offline/") || path === "/sw.js"));
    if (!allowed || path.includes("..")) {
      res.writeHead(404).end();
      return;
    }
    // Em produção quem serve `<base>midia/` é o rewrite do next.config.
    const midia = MIDIA_OFFLINE.find((m) => path.startsWith(`${m.base}midia/`));
    if (midia) {
      const arquivo = path.slice(`${midia.base}midia/`.length);
      if (!ARQUIVO_MIDIA.test(arquivo)) {
        res.writeHead(404).end();
        return;
      }
      const upstream = await fetch(`${STORAGE_PUBLICO}/${midia.storage}/${arquivo}`);
      res
        .writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") || "application/octet-stream", "Cache-Control": "no-store" })
        .end(Buffer.from(await upstream.arrayBuffer()));
      return;
    }
    try {
      let file = await readFile(resolve("public", path.slice(1)));
      if (
        updatePublished &&
        path.startsWith(base) &&
        path.endsWith("/index.html")
      )
        file = Buffer.from(
          file
            .toString()
            .replace(
              /data-version="[a-f0-9]+"/,
              'data-version="aaaaaaaaaaaaaaaa"',
            ),
        );
      if (
        updatePublished &&
        path.startsWith(base) &&
        path.endsWith("/package.json")
      ) {
        const pack = JSON.parse(file.toString());
        pack.version = "aaaaaaaaaaaaaaaa";
        const html = (
          await readFile(`public${base}index.html`, "utf8")
        ).replace(
          /data-version="[a-f0-9]+"/,
          'data-version="aaaaaaaaaaaaaaaa"',
        );
        Object.assign(
          pack.assets.find(
            (item: { path: string }) => item.path === "index.html",
          ),
          {
            bytes: Buffer.byteLength(html),
            sha256: createHash("sha256").update(html).digest("hex"),
          },
        );
        file = Buffer.from(JSON.stringify(pack));
      }
      const type = (path.endsWith(".js") || path.endsWith(".mjs"))
        ? "text/javascript"
        : path.endsWith(".css")
          ? "text/css"
          : path.endsWith(".json")
            ? "application/json"
            : path.endsWith(".woff2")
              ? "font/woff2"
              : path.endsWith(".pdf") ? "application/pdf" : path.endsWith(".png") ? "image/png" : path.endsWith(".jpg") ? "image/jpeg" : "text/html";
      res
        .writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" })
        .end(file);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((done) =>
    server!.listen(tenant === "acme-demo" ? 4187 : 4186, "127.0.0.1", done),
  );
}
const origin =
  explicitOrigin || `http://127.0.0.1:${tenant === "acme-demo" ? 4187 : 4186}`;
const url = `${origin}${base}index.html`;
const options = {
  channel: "chrome",
  headless: true,
  viewport: { width: 1440, height: 1050 },
};
let context = await chromium.launchPersistentContext(directory, options);
let page = await context.newPage();
const errors: string[] = [];
const listen = () =>
  page.on("pageerror", (error) => errors.push(error.message));
listen();
async function openPreparation(target = page) {
  if (!(await target.getByRole("dialog", { name: "Preparo offline" }).isVisible()))
    await target.getByRole("button", { name: "Preparo offline", exact: true }).click();
}
async function prepare(target = page) {
  await target.getByRole("button", { name: /Preparar apresentação/ }).click();
  await expect.poll(() => target.evaluate(async () => {
    const names = await caches.keys();
    const prefix = location.pathname.includes("offline-acme") ? "vertho-acme-offline-v1-" : "vertho-escolas-offline-v1-";
    return names.some(name => name.startsWith(prefix) && !name.endsWith("meta"));
  }).catch(() => false), { timeout: 180000 }).toBe(true);
  // The first installation can reload into the new worker-controlled document.
  await expect.poll(async () => {
    await openPreparation(target);
    return target.getByText("Pronto para apresentar offline", { exact: true }).isVisible();
  }, { timeout: 180000 }).toBe(true);
}
const go = async (path: string, role = "participant") => {
  await page.goto(`${url}#/${role}${path}`);
};
try {
  if (checkIsolation) {
    await page.goto(`${origin}/apresentacao-offline/index.html`);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await (await caches.open("offline-isolation-sentinel")).put("/sentinel", new Response("preservar"));
    });
    await prepare();
  }
  await page.goto(url);
  await prepare();
  await page.screenshot({ path: `${screenshotPrefix}-preparado.png` });
  console.log("PREPARADO", await page.getByRole("status").innerText());
  if (server) {
    updatePublished = true;
    await page.reload();
    await openPreparation();
    await page.getByRole("button", { name: "Atualizar pacote", exact: true }).click();
    await expect.poll(() => page.locator("html").getAttribute("data-version")).toBe("aaaaaaaaaaaaaaaa");
    await openPreparation();
    await expect(page.getByText("Pronto para apresentar offline", { exact: true })).toBeVisible();
    console.log("ATUALIZAÇÃO: novo pacote ativo, sem servir HTML antigo.");
  }
  await context.close();
  if (server) await new Promise<void>(done => server!.close(() => done()));
  context = await chromium.launchPersistentContext(directory, options);
  await context.setOffline(true);
  page = await context.newPage();
  listen();
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Seu próximo avanço começa hoje" })).toBeVisible();
  await openPreparation();
  await expect(page.getByText("Pronto para apresentar offline", { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/Sem conexão · Dados fictícios/)).toBeVisible();
  await page.getByRole("button", { name: "Apresentar", exact: true }).click();
  await page.screenshot({ path: `${screenshotPrefix}-home.png` });
  if (checkIsolation) {
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(r => new URL(r.scope).pathname).sort()))
      .toEqual(["/", "/apresentacao-offline-acme/", "/apresentacao-offline/"].sort());
    expect(await page.evaluate(async () => (await (await caches.open("offline-isolation-sentinel")).match("/sentinel"))?.text())).toBe("preservar");
    const school = await context.newPage();
    await school.goto(`${origin}/apresentacao-offline/index.html`);
    await expect(school.getByText("Olá, Marina", { exact: true })).toBeVisible();
    await openPreparation(school);
    await expect(school.getByText("Pronto para apresentar offline", { exact: true })).toBeVisible({ timeout: 30000 });
    await school.close();
    console.log("ISOLAMENTO: duas demos, cache externo e push preservados.");
  }
  await go('/dashboard/temporada/semana/1');
  const video = page.locator('video');
  await video.evaluate(async (el: HTMLVideoElement) => { el.muted = true; await el.play(); });
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(0.5);
  await video.evaluate((el: HTMLVideoElement) => { el.currentTime = 90; });
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(90.2);
  await video.evaluate((el: HTMLVideoElement) => el.pause());
  await page.screenshot({ path: `${screenshotPrefix}-semana-1.png` });
  await page.getByRole('button', { name: 'audio', exact: true }).click();
  await page.locator('audio').evaluate(async (el: HTMLAudioElement) => { el.muted = true; await el.play(); });
  await expect.poll(() => page.locator('audio').evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(0.5);
  for (const format of ['texto', 'case']) {
    await page.getByRole('button', { name: format, exact: true }).click();
    const src = await page.locator(`iframe[title^="${format}:"]`).getAttribute('src');
    expect(await page.evaluate(async (path: string) => {
      const response = await fetch(path);
      return { status: response.status, type: response.headers.get('content-type'), prefix: (await response.text()).slice(0, 5) };
    }, src!)).toEqual({ status: 200, type: 'application/pdf', prefix: '%PDF-' });
  }
  console.log('MÍDIAS: vídeo com busca, áudio, texto e case sem conexão.');
  await go('/dashboard/temporada/semana/2');
  // Preserve the online progression rule, including the same locked-week screen.
  await expect(page.getByRole('heading', { name: 'Semana 2 ainda não liberada' })).toBeVisible();
  await go('/dashboard/perfil-comportamental');
  await expect(page.getByText(environment.names.participant, { exact: true })).toBeVisible();
  await go('/dashboard/pdi');
  await expect(page.getByRole('heading', { name: environment.names.participant, exact: true })).toBeVisible();
  await page.getByLabel('Trocar função apresentada').selectOption('gestor');
  await expect(page.getByRole('heading', { name: 'Minha equipe', exact: true })).toBeVisible();
  await page.screenshot({ path: `${screenshotPrefix}-manager.png` });
  await page.getByLabel('Trocar função apresentada').selectOption('rh');
  await expect(page.getByText(`Olá, ${environment.names.organization.split(' ')[0]}`, { exact: true })).toBeVisible();
  await go('/dashboard/relatorios', 'organization');
  await expect(page.getByRole('button', { name: 'Documentos', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Documentos', exact: true }).click();
  await page.getByRole('button', { name: /Abrir relatório/i }).first().click();
  await expect.poll(() => page.locator('canvas').first().evaluate((c: HTMLCanvasElement) => {
    const pixels = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let ink = 0;
    for (let i = 0; i < pixels.length; i += 64) if (pixels[i + 3] > 200 && pixels[i] < 220) ink++;
    return ink;
  }).catch(() => 0), { timeout: 30000 }).toBeGreaterThan(500);
  await page.screenshot({ path: `${screenshotPrefix}-organization-pdf.png` });
  console.log('PERFIS: participante, gestor e RH; relatório PDF renderizado sem rede.');
  await verifyOfflinePanels(page, tenant);
  await page.getByLabel('Trocar função apresentada').selectOption('usuario');
  await page.getByLabel('Trocar dispositivo apresentado').selectOption('mobile');
  const phone = page.frameLocator('iframe[title="Apresentação no celular"]');
  await expect(phone.getByRole('heading', { name: 'Seu próximo avanço começa hoje' })).toBeVisible();
  await page.getByLabel('Trocar dispositivo apresentado').selectOption('desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${screenshotPrefix}-celular.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.evaluate(async ({ cachePrefix, base, mediaToRemove }) => {
    const meta = await caches.open(`${cachePrefix}meta`);
    const pack = await (await meta.match(`${base}_active`))!.json();
    await (await caches.open(pack.cacheName)).delete(`${base}${mediaToRemove}`);
  }, { cachePrefix: environment.cachePrefix, base, mediaToRemove });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Conferir pacote', exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('Falta baixar');
  await expect(page.getByText('Pronto para apresentar offline', { exact: true })).not.toBeVisible();
  console.log('PASSOU: atualização, reinício offline, UI compartilhada, três visões, mídias, PDF, celular e arquivo perdido.');
} finally {
  await context.close();
  await new Promise<void>((done) =>
    server ? server.close(() => done()) : done(),
  );
}
