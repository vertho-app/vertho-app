import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BASE,
  ACTIVE_KEY,
  CACHE_PREFIX,
  META_CACHE,
  byteRange,
  digest,
  installedPackage,
  preparePackage,
  validatePackage,
  verifyPackage,
} from "@/lib/demo/offline/cache";
import { schoolOfflineData } from "@/lib/demo/offline/data";
import { acmeOfflineData } from "@/lib/demo/offline/acme-data";
import { offlineEnvironment } from "@/lib/demo/offline/environment";
import schoolMedia from "@/lib/demo/offline/media.json";
import acmeMedia from "@/lib/demo/offline/acme-media.json";
import videosJornadaEscolar from "@/lib/demo/escolas-videos-jornada.json";
import fixtureEscolas from "@/lib/demo/escolas-demo-fixture.json";
import type { OfflinePackage } from "@/lib/demo/offline/types";

describe("Apresentação offline: mídia e limites", () => {
  it("mantém os pacotes em escopos e caches distintos, preservando o endereço escolar", () => {
    const school = offlineEnvironment("escolas-acme");
    const acme = offlineEnvironment("acme-demo");
    expect(school.base).toBe("/apresentacao-offline/");
    expect(school.cachePrefix).toBe("vertho-escolas-offline-v1-");
    expect(acme.base.startsWith(school.base)).toBe(false);
    expect(school.base.startsWith(acme.base)).toBe(false);
    expect(acme.cachePrefix.startsWith(school.cachePrefix)).toBe(false);
    expect(acme.roles.organization).toBe("RH");
    expect(acme.names.participant).toBe("Bruna Costa");
  });
  it("projeta as 30 pessoas fictícias da ACME e deduplica o conteúdo compartilhado pelas semanas", () => {
    const data = acmeOfflineData();
    expect(data.people).toHaveLength(30);
    expect(data.totalWeeks).toBe(7);
    expect(
      data.people.find((p) => p.key === "bruna")?.assessments.length,
    ).toBeGreaterThan(0);
    expect(data.people.find((p) => p.key === "ana")?.profileAvailable).toBe(
      false,
    );
    expect(data.people.find((p) => p.key === "vanessa")?.profileAvailable).toBe(
      false,
    );
    expect(data.people.some((p) => p.manager === "Carla Menezes")).toBe(true);
    expect(data.weeks.map((w) => w.title)).toEqual([
      "Criação de senso de urgência",
      "Criação de senso de urgência",
    ]);
    expect(
      new Set(data.weeks.flatMap((w) => w.formats.map((f) => f.path))).size,
    ).toBe(4);
    expect(data.coordination.resumo_executivo).toBeTruthy();
    expect(data.direction.resumo_executivo).toBeTruthy();
    const serialized = JSON.stringify(data);
    for (const value of [
      "Marina Rocha",
      "Renata Coelho",
      "Cláudia Amorim",
      "@vertho.ai",
      "colaborador_id",
      "access_token",
      '"respostas":',
    ])
      expect(serialized.includes(value), value).toBe(false);
  });
  it("todos os formatos das duas demos possuem arquivo verificado no próprio manifesto", () => {
    for (const [data, media] of [
      [schoolOfflineData(), schoolMedia],
      [acmeOfflineData(), acmeMedia],
    ] as const) {
      for (const week of data.weeks) {
        expect(week.formats.map((f) => f.key).sort()).toEqual([
          "audio",
          "case",
          "texto",
          "video",
        ]);
        for (const format of week.formats) {
          const asset = media.find((a) => a.path === format.path);
          expect(asset, format.path).toBeDefined();
          expect(asset!.bytes).toBeGreaterThan(1000);
          expect(asset!.sha256).toMatch(/^[a-f0-9]{64}$/);
        }
      }
    }
    expect(acmeMedia).toHaveLength(4);
    expect(
      acmeMedia.some((a) => schoolMedia.some((b) => b.source === a.source)),
    ).toBe(false);
  });
  it("a escolar empacota o vídeo e o podcast nominais da Marina, não o deck nem o MP3-base", () => {
    // 17/09/2026: o manifesto apontava para o deck da célula e para o áudio
    // sem saudação, e a apresentação da professora saía sem "Olá, Marina".
    const genericos = new Set<string>([
      ...videosJornadaEscolar.map((v) => v.bunnyVideoId),
      ...(fixtureEscolas as any).personaArtifacts["marina.demo@vertho.ai"].trilha.row.temporada_plano
        .map((w: any) => w.conteudo?.formatos_disponiveis?.audio?.url)
        .filter(Boolean),
    ]);
    const midias = schoolMedia.filter((a) => /-(video|audio)\./.test(a.path));
    expect(midias).toHaveLength(4);
    for (const asset of midias) {
      expect([...genericos].some((g) => asset.source.includes(g)), asset.path).toBe(false);
      // Cópia imutável: o reset move o podcast personalizado para o UUID novo.
      expect(asset.source, asset.path).toContain(`/demo-offline/escolas/${asset.sha256}.`);
    }
  });
  it("atende início, busca, fim e intervalos inválidos de vídeo", () => {
    expect(byteRange("bytes=0-1", 100)).toEqual({ start: 0, end: 1 });
    expect(byteRange("bytes=40-", 100)).toEqual({ start: 40, end: 99 });
    expect(byteRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(byteRange("bytes=90-150", 100)).toEqual({ start: 90, end: 99 });
    for (const value of [
      "bytes=100-",
      "bytes=30-20",
      "bytes=-0",
      "bytes=-",
      "bytes=0-1,3-4",
      "invalid",
    ])
      expect(byteRange(value, 100)).toBeNull();
  });
  it("projeta só dados demonstrativos, sem sessões, respostas ou contatos", () => {
    const data = schoolOfflineData();
    expect(data.weeks.map((w) => w.number)).toEqual([1, 2]);
    expect(data.weeks.every((w) => w.formats.length === 4)).toBe(true);
    expect(
      data.people.some((p) => p.key === "marina" && p.assessments.length > 0),
    ).toBe(true);
    expect(data.coordination.resumo_executivo).toBeTruthy();
    expect(data.direction.resumo_executivo).toBeTruthy();
    const serialized = JSON.stringify(data);
    for (const forbidden of [
      "@vertho.ai",
      "colaborador_id",
      "gestor_email",
      "access_token",
      "refresh_token",
      '"respostas":',
      "service_role",
    ])
      expect(
        serialized.includes(forbidden),
        `campo proibido: ${forbidden}`,
      ).toBe(false);
  });
});

// Real Response bodies and hashes; only the browser's storage transport is replaced.
describe("Download atômico do pacote", () => {
  let stores: Map<string, Map<string, Response>>;
  beforeEach(() => {
    stores = new Map();
    vi.stubGlobal("location", { origin: "https://demo.example" });
    vi.stubGlobal("navigator", {
      storage: { estimate: async () => ({ quota: 10000000, usage: 0 }) },
    });
    vi.stubGlobal("caches", {
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
      open: async (name: string) => {
        if (!stores.has(name)) stores.set(name, new Map());
        const store = stores.get(name)!;
        return {
          match: async (key: string) => store.get(key)?.clone(),
          put: async (key: string, response: Response) => {
            store.set(key, response.clone());
          },
        };
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ready")),
    );
  });
  afterEach(() => vi.unstubAllGlobals());
  async function pack(version = "1111111111111111"): Promise<OfflinePackage> {
    const sha256 = await digest(new TextEncoder().encode("ready").buffer);
    return {
      version,
      assets: [
        "index.html",
        "app.js",
        "style.css",
        "video.mp4",
        "audio.mp3",
      ].map((path) => ({
        path,
        source: BASE + path,
        bytes: 5,
        sha256,
        type: "text/plain",
        label: path,
      })),
    };
  }
  const prepare = (p: OfflinePackage, signal = new AbortController().signal) =>
    preparePackage(p, signal, () => {});
  it("só ativa depois de todos os arquivos verificados e detecta perda posterior", async () => {
    const result = await prepare(await pack());
    expect((await installedPackage())?.cacheName).toBe(result.cacheName);
    await verifyPackage(result);
    stores.get(result.cacheName)!.delete(BASE + "video.mp4");
    await expect(verifyPackage(result)).rejects.toThrow("Falta baixar");
  });
  it("preserva o pacote anterior se um download novo vier truncado", async () => {
    const old = await prepare(await pack());
    const next = await pack("2222222222222222");
    next.assets[4] = {
      ...next.assets[4],
      sha256: await digest(new TextEncoder().encode("fresh").buffer),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("fre")),
    );
    await expect(prepare(next)).rejects.toThrow("Download incompleto");
    expect((await installedPackage())?.cacheName).toBe(old.cacheName);
    await verifyPackage(old);
    expect([...stores.keys()].filter((key) => key !== META_CACHE)).toEqual([
      old.cacheName,
    ]);
  });
  it("não declara pronto após cancelamento ou quota insuficiente", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(prepare(await pack(), controller.signal)).rejects.toThrow();
    expect(await installedPackage()).toBeNull();
    vi.stubGlobal("navigator", {
      storage: { estimate: async () => ({ quota: 10, usage: 0 }) },
    });
    await expect(prepare(await pack())).rejects.toThrow("espaço suficiente");
    expect(stores.get(META_CACHE)?.has(ACTIVE_KEY)).toBe(false);
  });
  it("rejeita caminhos fora do escopo e origens arbitrárias", async () => {
    const p = await pack();
    p.assets[1].path = "../sw.js";
    expect(() => validatePackage(p)).toThrow("Arquivo inválido");
    const remote = await pack();
    remote.assets[1].source = "https://evil.example/file";
    expect(() => validatePackage(remote)).toThrow("Origem");
    expect(CACHE_PREFIX).not.toBe("");
  });
});
