import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { offlineEnvironment } from "../lib/demo/offline/environment.ts";

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
      const type = path.endsWith(".js")
        ? "text/javascript"
        : path.endsWith(".css")
          ? "text/css"
          : path.endsWith(".json")
            ? "application/json"
            : path.endsWith(".woff2")
              ? "font/woff2"
              : "text/html";
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
try {
  if (checkIsolation) {
    await page.goto(`${origin}/apresentacao-offline/index.html`);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await (
        await caches.open("offline-isolation-sentinel")
      ).put("/sentinel", new Response("preservar"));
    });
    await page.getByRole("button", { name: /Preparar apresentação/ }).click();
    await expect(
      page.getByText("Pronto para apresentar offline", { exact: true }),
    ).toBeVisible({ timeout: 180000 });
  }
  await page.goto(url);
  await page.getByRole("button", { name: /Preparar apresentação/ }).click();
  await expect(
    page.getByText("Pronto para apresentar offline", { exact: true }),
  ).toBeVisible({ timeout: 180000 });
  await page.screenshot({
    path: `${screenshotPrefix}-preparado.png`,
    fullPage: true,
  });
  console.log("PREPARADO", await page.getByRole("status").innerText());
  if (server) {
    updatePublished = true;
    await page.reload();
    await page
      .getByRole("button", { name: "Atualizar pacote", exact: true })
      .click();
    await expect
      .poll(() => page.locator("html").getAttribute("data-version"))
      .toBe("aaaaaaaaaaaaaaaa");
    await expect(
      page.getByText("Pronto para apresentar offline", { exact: true }),
    ).toBeVisible();
    console.log(
      "ATUALIZAÇÃO: novo pacote substituiu o anterior, sem receber shell velho do cache.",
    );
  }
  await context.close();
  // Stop the origin entirely: a service worker update check from the browser
  // itself must not accidentally mask an app dependency in the offline test.
  if (server) await new Promise<void>((done) => server!.close(() => done()));
  context = await chromium.launchPersistentContext(directory, options);
  await context.setOffline(true);
  page = await context.newPage();
  listen();
  await page.goto(url);
  await expect(
    page.getByText("Pronto para apresentar offline", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("Sem conexão", { exact: true })).toBeVisible();
  if (checkIsolation) {
    const scopes = await page.evaluate(async () =>
      (await navigator.serviceWorker.getRegistrations())
        .map((registration) => new URL(registration.scope).pathname)
        .sort(),
    );
    expect(scopes).toEqual(
      ["/", "/apresentacao-offline-acme/", "/apresentacao-offline/"].sort(),
    );
    expect(
      await page.evaluate(async () =>
        (
          await (
            await caches.open("offline-isolation-sentinel")
          ).match("/sentinel")
        )?.text(),
      ),
    ).toBe("preservar");
    const school = await context.newPage();
    await school.goto(`${origin}/apresentacao-offline/index.html`);
    await expect(
      school.getByText("Pronto para apresentar offline", { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      school.getByText("Marina Rocha", { exact: true }),
    ).toBeVisible();
    await expect(
      school.getByText("Rede de Escolas ACME", { exact: true }),
    ).toBeVisible();
    await school.close();
    console.log(
      "ISOLAMENTO: escola e ACME coexistem offline; cache externo e worker de push preservados.",
    );
  }
  for (const number of [1, 2]) {
    await page.getByRole("button", { name: /Minha jornada/ }).click();
    await page
      .getByRole("button", { name: new RegExp(`SEMANA ${number} DE 7`) })
      .click();
    const video = page.locator("video");
    await video.evaluate(async (el: HTMLVideoElement) => {
      el.muted = true;
      await el.play();
    });
    await expect
      .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
      .toBeGreaterThan(0.5);
    await video.evaluate((el: HTMLVideoElement) => {
      el.currentTime = 90;
    });
    await expect
      .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
      .toBeGreaterThan(90.2);
    await video.evaluate((el: HTMLVideoElement) => el.pause());
    await page.screenshot({
      path: `${screenshotPrefix}-semana-${number}.png`,
      fullPage: false,
    });
    await page.getByRole("tab", { name: "Áudio", exact: true }).click();
    await page.locator("audio").evaluate(async (el: HTMLAudioElement) => {
      el.muted = true;
      await el.play();
    });
    await expect
      .poll(() =>
        page
          .locator("audio")
          .evaluate((el: HTMLAudioElement) => el.currentTime),
      )
      .toBeGreaterThan(0.5);
    for (const format of ["Texto", "Case"]) {
      await page.getByRole("tab", { name: format, exact: true }).click();
      const src = await page.locator("iframe").getAttribute("src");
      const pdf = await page.evaluate(async (path: string) => {
        const response = await fetch(path);
        return {
          status: response.status,
          type: response.headers.get("content-type"),
          prefix: (await response.text()).slice(0, 5),
        };
      }, src!);
      expect(pdf).toEqual({
        status: 200,
        type: "application/pdf",
        prefix: "%PDF-",
      });
    }
    console.log("SEMANA", number, "vídeo com busca + áudio + texto + case OK");
  }
  await page.getByRole("button", { name: "Meu perfil", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Seu perfil", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Meu desenvolvimento", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Plano de desenvolvimento",
      exact: true,
    }),
  ).toBeVisible();
  for (const role of ["manager", "organization"]) {
    await page.getByLabel("Visão apresentada").selectOption(role);
    await page.getByRole("button", { name: "Equipe", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: environment.names.participant,
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name:
          role === "organization"
            ? environment.organizationReportButton
            : "Relatório da equipe",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Visão geral", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `${screenshotPrefix}-${role}.png`,
      fullPage: false,
    });
  }
  await page
    .getByRole("button", { name: "Reiniciar demonstração", exact: true })
    .click();
  await expect(page.getByLabel("Visão apresentada")).toHaveValue("participant");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `${screenshotPrefix}-celular.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  // Loss of one file invalidates readiness instead of silently streaming online.
  await page.evaluate(
    async ({ cachePrefix, base, mediaToRemove }) => {
      const meta = await caches.open(`${cachePrefix}meta`);
      const pack = await (await meta.match(`${base}_active`))!.json();
      await (
        await caches.open(pack.cacheName)
      ).delete(`${base}${mediaToRemove}`);
    },
    { cachePrefix: environment.cachePrefix, base, mediaToRemove },
  );
  await page
    .getByRole("button", { name: "Conferir pacote", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Falta baixar");
  await expect(
    page.getByText("Pronto para apresentar offline", { exact: true }),
  ).not.toBeVisible();
  console.log(
    "PASSOU: navegador reiniciado offline, três perfis, mídias, relatórios, responsividade e arquivo perdido. Erros JS:",
    errors.length,
  );
} finally {
  await context.close();
  await new Promise<void>((done) =>
    server ? server.close(() => done()) : done(),
  );
}
