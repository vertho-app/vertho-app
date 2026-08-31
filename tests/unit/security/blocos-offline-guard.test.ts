// Guard: os blocos declarados em `lib/blocos-offline.ts` estão REALMENTE fechados.
//
// 🔴 POR QUE ESTE GUARD (31/08/2026): desligar os 5 blocos exigiu mockar
// `@/lib/blocos-offline` em 3 arquivos de teste que exercitam gate de tenant e
// régua de reenvio — sem o mock, `assertBlocoOnline` lançaria antes do código
// sob teste e eles morreriam no gate errado. O efeito colateral é que a suíte,
// depois disso, passa a acreditar que tudo está LIGADO: nenhum teste observava
// o desligamento de verdade. Este arquivo é o contrapeso — é o único lugar onde
// o estado off-line é afirmado, e ele NÃO mocka nada.
//
// O que se prova aqui é o que a decisão de 31/08 comprou: a porta fechada (tela
// e action) e a ausência de convite para ela (menu, links, cron agendado).
import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { describe, it, expect } from 'vitest';
import { BLOCOS_OFFLINE, blocoEstaOffline, assertBlocoOnline, BlocoOfflineError } from '@/lib/blocos-offline';

/** Layout (ou page) que fecha a superfície de cada bloco. */
const PORTAS: Record<string, string[]> = {
  pulso: [
    'app/admin/empresas/[empresaId]/pulso/layout.tsx',
    'app/dashboard/pulso/layout.tsx',
  ],
  selecao: [
    'app/admin/empresas/[empresaId]/selecao/layout.tsx',
    'app/admin/empresas/[empresaId]/extracao-cargo/layout.tsx',
  ],
  radarempresas: ['app/admin/vertho/radarempresas/layout.tsx'],
  radarbett: ['app/radarbett/layout.tsx', 'app/radar/bett/layout.tsx'],
  conarh: ['app/conarh/layout.tsx'],
};

/** Actions que precisam recusar na entrada (endpoint HTTP, a tela não protege). */
const ACTIONS: Record<string, string[]> = {
  pulso: [
    'actions/pulse/admin.ts', 'actions/pulse/envio.ts', 'actions/pulse/responder.ts',
    'actions/pulse/signals.ts', 'actions/pulse/export.ts', 'actions/pulse/classify.ts',
    'actions/pulse/dashboard.ts',
  ],
  selecao: ['actions/selecao.ts', 'actions/cargo-extracao.ts'],
  radarempresas: [
    'actions/radarempresas/busca.ts', 'actions/radarempresas/listas.ts',
    'actions/radarempresas/scoring.ts',
  ],
  radarbett: ['app/admin/radar/funnel-bett/actions.ts'],
};

const ROTAS_API_CONARH = [
  'app/api/conarh/artefato/route.ts', 'app/api/conarh/fila/route.ts',
  'app/api/conarh/painel/route.ts', 'app/api/conarh/reenviar-t0/route.ts',
];

describe('blocos off-line — o registro', () => {
  it('há blocos declarados (senão este guard não prova nada)', () => {
    expect(Object.keys(BLOCOS_OFFLINE).length).toBeGreaterThan(0);
  });

  it('toda entrada declara rótulo, data e EVIDÊNCIA', () => {
    for (const [nome, reg] of Object.entries(BLOCOS_OFFLINE)) {
      expect(reg.rotulo, `${nome} sem rótulo`).toBeTruthy();
      expect(reg.desde, `${nome} sem data`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // A evidência é o que separa "desligamos porque achamos" de uma medição.
      expect(reg.evidencia.length, `${nome}: evidência curta demais para ser uma medição`).toBeGreaterThan(60);
    }
  });

  it('🔴 assertBlocoOnline LANÇA para bloco declarado', () => {
    for (const nome of Object.keys(BLOCOS_OFFLINE)) {
      expect(() => assertBlocoOnline(nome as any), `${nome} não lançou`).toThrow(BlocoOfflineError);
    }
  });

  it('🔴 não lança para bloco que NÃO está na lista (fail-open é intencional aqui)', () => {
    // Ao contrário do gate de módulo, a ausência significa LIGADO: um bloco novo
    // não pode nascer desligado porque alguém esqueceu de cadastrá-lo.
    expect(() => assertBlocoOnline('temporadas' as any)).not.toThrow();
    expect(blocoEstaOffline('temporadas')).toBe(false);
  });

  it('🔴 lookup imune a propriedade herdada', () => {
    // `in` casaria "constructor"/"toString" e desligaria blocos que não existem.
    expect(blocoEstaOffline('constructor')).toBe(false);
    expect(blocoEstaOffline('toString')).toBe(false);
  });
});

describe('blocos off-line — a porta está fechada', () => {
  it('🔴 cada bloco tem layout/page que chama notFound()', () => {
    const faltando: string[] = [];
    for (const [bloco, arquivos] of Object.entries(PORTAS)) {
      if (!blocoEstaOffline(bloco)) continue; // religado: não exigir a porta
      for (const arq of arquivos) {
        if (!existsSync(arq)) { faltando.push(`${arq} (ausente)`); continue; }
        const txt = readFileSync(arq, 'utf-8');
        if (!/notFound\(\)/.test(txt)) faltando.push(`${arq} (sem notFound)`);
      }
    }
    expect(faltando, `bloco off-line com tela ainda alcançável: ${faltando.join(', ')}`).toEqual([]);
  });

  it('🔴 toda função exportada das actions do bloco chama assertBlocoOnline', () => {
    const abertas: string[] = [];
    for (const [bloco, arquivos] of Object.entries(ACTIONS)) {
      if (!blocoEstaOffline(bloco)) continue;
      for (const arq of arquivos) {
        if (!existsSync(arq)) { abertas.push(`${arq} (ausente)`); continue; }
        const txt = readFileSync(arq, 'utf-8');
        const exports = (txt.match(/^export\s+async\s+function\s+/gm) || []).length;
        const gates = (txt.match(/assertBlocoOnline\(/g) || []).length;
        // -1 porque o import também casa o nome; conta só as chamadas no corpo.
        const chamadas = gates - (txt.includes("import { assertBlocoOnline }") ? 0 : 0);
        if (exports > 0 && chamadas < exports) {
          abertas.push(`${arq} (${exports} export(s), ${chamadas} gate(s))`);
        }
      }
    }
    expect(
      abertas,
      'Server Action de bloco off-line sem gate: num arquivo `use server` todo export '
      + 'é endpoint HTTP, então a tela em 404 não fecha nada. Arquivos: ' + abertas.join(', '),
    ).toEqual([]);
  });

  it('🔴 as rotas de API do CONARH respondem 410 antes de autenticar por chave', () => {
    if (!blocoEstaOffline('conarh')) return;
    const abertas = ROTAS_API_CONARH.filter((arq) => {
      if (!existsSync(arq)) return true;
      return !readFileSync(arq, 'utf-8').includes("blocoEstaOffline('conarh')");
    });
    expect(
      abertas,
      'rota do CONARH sem gate — elas autenticam por CHAVE, que circulou pela equipe na feira',
    ).toEqual([]);
  });
});

describe('blocos off-line — ninguém convida para a porta fechada', () => {
  it('🔴 o menu do admin não aponta para bloco off-line', () => {
    const nav = readFileSync('app/admin/_shell/nav-items.ts', 'utf-8');
    // só as linhas de item ativo (ignora comentário, que é onde o motivo mora)
    const ativas = nav.split('\n').filter((l) => /^\s*\{\s*key:/.test(l));
    const ofensores = ativas.filter((l) =>
      /\/pulso|\/radarempresas|\/selecao|\/radarbett|\/conarh/.test(l));
    expect(
      ofensores,
      'entrada de menu para bloco off-line: leva o operador a uma tela 404',
    ).toEqual([]);
  });

  it('🔴 nenhum cron agendado dispara bloco off-line', () => {
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf-8'));
    const paths: string[] = (vercel.crons || []).map((c: any) => c.path);
    const ofensores = paths.filter((p) => /conarh|pulse|pulso/i.test(p));
    expect(
      ofensores,
      'cron agendado para bloco off-line — era assim que a régua do CONARH seguia '
      + 'disparando WhatsApp 48× por dia depois do fim da feira',
    ).toEqual([]);
  });

  it('🔴 nenhum arquivo VERSIONADO ainda linka para as telas fechadas', () => {
    let versionados: string[];
    try {
      versionados = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
        .split('\0').filter(Boolean);
    } catch { return; } // fora de repo git: guard não se aplica
    const alvos = versionados.filter((f) =>
      /\.(ts|tsx)$/.test(f)
      && !f.startsWith('tests/')
      // `scripts/` fica fora: este guard é sobre NAVEGAÇÃO do produto — "a
      // pessoa clica e cai num 404". Script de workspace é rodado à mão por
      // quem já sabe o que está fazendo, não é uma porta oferecida a ninguém.
      // (Mesmo recorte dos outros guards da base; `scripts/_*.ts` inclusive já
      // é gitignored, e o que restou rastreado é estoque antigo.)
      && !f.startsWith('scripts/')
      && !f.includes('blocos-offline'));

    const ofensores: string[] = [];
    for (const f of alvos) {
      let txt: string;
      try { txt = readFileSync(f, 'utf-8'); } catch { continue; }
      // Um link é uma string de rota fora de comentário. Tira as linhas
      // comentadas primeiro: é lá que o motivo da remoção fica registrado.
      const linhas = txt.split('\n').filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l));
      const corpo = linhas.join('\n');
      // as próprias telas do bloco podem se referenciar (rota dinâmica interna)
      if (/^app\/(conarh|radarbett)\//.test(f)) continue;
      if (/app\/admin\/vertho\/radarempresas\//.test(f)) continue;
      if (/pulso|selecao|extracao-cargo/.test(f)) continue;

      if (/(href|push)\(?\s*[:=]?\s*['"`][^'"`]*\/(radarbett|conarh)\b/.test(corpo)
        || /['"`]\/admin\/vertho\/radarempresas/.test(corpo)) {
        ofensores.push(f);
      }
    }
    expect(
      ofensores,
      'link para tela de bloco off-line — a pessoa clica e cai num 404: ' + ofensores.join(', '),
    ).toEqual([]);
  });
});
