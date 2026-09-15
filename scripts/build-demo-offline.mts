import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { OfflineAsset } from "../lib/demo/offline/types.ts";

// No network or environment credentials at build time. Only curated fictional data.
const base = "/apresentacao-offline/";
const output = resolve("public/apresentacao-offline");
await mkdir(output, { recursive: true });
const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const dataset = await build({
  entryPoints: ["lib/demo/offline/data.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { schoolOfflineData } = await import(
  `data:text/javascript;base64,${Buffer.from(dataset.outputFiles![0].text).toString("base64")}`
);
const media: OfflineAsset[] = JSON.parse(
  await readFile("lib/demo/offline/media.json", "utf8"),
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
  loader: { ".woff2": "file" },
  assetNames: "fonts/[name]-[hash]",
  define: {
    "process.env.NODE_ENV": '"production"',
    __DEMO_DATA__: JSON.stringify(schoolOfflineData()),
  },
});
const assets: OfflineAsset[] = [];
let script = "",
  css = "";
for (const file of app.outputFiles!) {
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
assets.push(...media);
const version = hash(JSON.stringify(assets)).slice(0, 16);
const html = `<!doctype html><html lang="pt-BR" data-version="${version}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0a2035"><meta name="robots" content="noindex,nofollow"><title>Vertho · Apresentação offline escolar</title><link rel="icon" href="data:,"><link rel="stylesheet" href="${base}${css}"></head><body><div id="root"></div><noscript>Ative o JavaScript para preparar e abrir a apresentação offline.</noscript><script src="${base}${script}" defer></script></body></html>`;
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
});
console.log(
  `Demo offline escolar: ${version}, ${assets.length} arquivos, ${(assets.reduce((sum, asset) => sum + asset.bytes, 0) / 1048576).toFixed(1)} MB`,
);
