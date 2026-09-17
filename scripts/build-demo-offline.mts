import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import { offlineAdapters } from '../lib/demo/offline/build-adapters.ts';
import type { OfflineAsset } from "../lib/demo/offline/types.ts";
import {
  offlineEnvironment,
  type OfflineTenant,
} from "../lib/demo/offline/environment.ts";

// No network or environment credentials at build time. Only curated fictional data.
const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const dataset = await build({
  stdin: {
    contents:
      'export { schoolOfflineData } from "./lib/demo/offline/data"; export { acmeOfflineData } from "./lib/demo/offline/acme-data";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { schoolOfflineData, acmeOfflineData } = await import(
  `data:text/javascript;base64,${Buffer.from(dataset.outputFiles![0].text).toString("base64")}`
);
const sharedStyles = await postcss([tailwindcss()]).process(await readFile('app/globals.css', 'utf8'), { from: resolve('app/globals.css') });
for (const tenant of ["escolas-acme", "acme-demo"] as OfflineTenant[]) {
  const environment = offlineEnvironment(tenant);
  const base = environment.base;
  const output = resolve("public", base.slice(1));
  await mkdir(output, { recursive: true });
  const media: OfflineAsset[] = JSON.parse(
    await readFile(
      tenant === "escolas-acme"
        ? "lib/demo/offline/media.json"
        : "lib/demo/offline/acme-media.json",
      "utf8",
    ),
  );
  const app = await build({
    entryPoints: ["lib/demo/offline/app.tsx"],
    bundle: true,
    minify: true,
    platform: "browser",
    format: "iife",
    target: ["es2022"],
    outdir: output,
    write: false,
    plugins: [offlineAdapters()],
    jsx: 'automatic',
    loader: { ".woff2": "file" },
    assetNames: "fonts/[name]-[hash]",
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env": '{}',
      __DEMO_DATA__: JSON.stringify(
        tenant === "escolas-acme" ? schoolOfflineData() : acmeOfflineData(),
      ),
      __OFFLINE_TENANT__: JSON.stringify(tenant),
      __OFFLINE_BASE__: JSON.stringify(base),
      __OFFLINE_MEDIA__: JSON.stringify(media.map(asset => asset.source)),
    },
  });
  const assets: OfflineAsset[] = [];
  let script = "",
    css = "";
  for (const file of app.outputFiles!) {
    if (file.path.endsWith('.css')) file.contents = Buffer.from(sharedStyles.css + '\n' + file.text);
    const sha256 = hash(file.contents);
    let path = relative(output, file.path).replaceAll("\\", "/");
    if (path.endsWith(".js")) {
      path = `app.${sha256.slice(0, 16)}.js`;
      script = path;
    }
    if (path.endsWith(".css")) {
      path = `style.${sha256.slice(0, 16)}.css`;
      css = path;
    }
    await mkdir(resolve(output, path, ".."), { recursive: true });
    await writeFile(resolve(output, path), file.contents);
    const type = path.endsWith(".js")
      ? "text/javascript"
      : path.endsWith(".css")
        ? "text/css"
        : "font/woff2";
    assets.push({
      path,
      source: base + path,
      sha256,
      bytes: file.contents.length,
      type,
      label: "Telas e fontes da apresentação",
    });
  }
  for (const [source, path, type] of [
    ['public/beto-avatar.jpg', 'assets/beto-avatar.jpg', 'image/jpeg'],
    ['public/logo-vertho.png', 'assets/logo-vertho.png', 'image/png'],
    ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'assets/pdf.worker.min.mjs', 'text/javascript'],
  ]) {
    const bytes = await readFile(source);
    await mkdir(resolve(output, path, '..'), { recursive: true });
    await writeFile(resolve(output, path), bytes);
    assets.push({ path, source: base+path, type, bytes: bytes.length, sha256: hash(bytes), label: 'Recursos da aplicação' });
  }
  for (const file of (await readdir(resolve('lib/demo/offline/documents', tenant))).filter(name => name.endsWith('.pdf')).sort()) {
    const path = `documents/${file}`;
    const bytes = await readFile(resolve('lib/demo/offline/documents', tenant, file));
    await mkdir(resolve(output, 'documents'), { recursive: true });
    await writeFile(resolve(output, path), bytes);
    assets.push({ path, source: base+path, type: 'application/pdf', bytes: bytes.length, sha256: hash(bytes), label: 'Relatórios da demonstração' });
  }
  assets.push(...media);
  const version = hash(JSON.stringify(assets)).slice(0, 16);
  const html = `<!doctype html><html lang="pt-BR" data-version="${version}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0a2035"><meta name="robots" content="noindex,nofollow"><title>Vertho · ${environment.title}</title><link rel="icon" href="data:,"><link rel="stylesheet" href="${base}${css}"></head><body><div id="root"></div><noscript>Ative o JavaScript para preparar e abrir a apresentação offline.</noscript><script src="${base}${script}" defer></script></body></html>`;
  await writeFile(resolve(output, "index.html"), html);
  assets.push({
    path: "index.html",
    source: base + "index.html",
    bytes: Buffer.byteLength(html),
    sha256: hash(html),
    type: "text/html; charset=utf-8",
    label: "Tela inicial",
  });
  await writeFile(
    resolve(output, "package.json"),
    JSON.stringify({ version, assets }),
  );
  await build({
    entryPoints: ["lib/demo/offline/worker.ts"],
    bundle: true,
    minify: true,
    platform: "browser",
    format: "iife",
    target: ["es2022"],
    outfile: resolve(output, "sw.js"),
    define: { __OFFLINE_TENANT__: JSON.stringify(tenant) },
  });
  console.log(
    `Demo offline ${tenant}: ${version}, ${assets.length} arquivos, ${(assets.reduce((sum, asset) => sum + asset.bytes, 0) / 1048576).toFixed(1)} MB`,
  );
}
