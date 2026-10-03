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
import { abaUnificadaDisponivel, secoesDoMercado, secaoInicialDoMercado } from '@/lib/mercado-potencial/secoes';

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
    // A aba "Potencial por Cidade" do Mercado potencial lia o acervo do bloco
    // (`radarempresas_cidades_agg`) e ficou de fora do desligamento de 31/08
    // por morar em outra pasta (R-108, 03/10/2026).
    'app/admin/vertho/potencial-cidades/actions.ts',
  ],
  // `actions/lead-comercial.ts` atende as DUAS campanhas (R-104, 03/10/2026): a
  // entrada repetida faz o gate continuar exigido enquanto qualquer uma das duas
  // estiver off-line.
  radarbett: ['app/admin/radar/funnel-bett/actions.ts', 'actions/lead-comercial.ts'],
  conarh: ['actions/lead-comercial.ts'],
};

// ── Links para telas fechadas (R-108, 03/10/2026) ─────────────────────────────
// O teste de links mais abaixo nasceu procurando só radarbett, conarh e o
// Radar Empresas, e só em `href`/`push`: não procurava /pulso nem /selecao, e
// não via `hrefFn: (id) => \`...\``, que é o formato dos cards do pipeline. Foi
// assim que o card "Pulso de Desenvolvimento" seguiu levando a um 404 por um mês.
//
// Um link é uma string em POSIÇÃO de link: `href`, `hrefFn`, `push`, `replace`,
// `redirect*`, inclusive depois da seta de `hrefFn` e do `{` do JSX. String de
// rota fora dessa posição (o mapa de páginas do Beto, por exemplo) não é convite.
const LINK = /(?:\bhref\w*|\bpush|\breplace|\bredirect\w*)\s*[:=(]\s*\{?\s*(?:\([^)]*\)\s*=>\s*)?(['"`])((?:(?!\1).)*)\1/g;

/** Rota de TELA de cada bloco, como ela aparece no destino de um link. */
const ROTAS_FECHADAS: Record<string, RegExp> = {
  pulso: /\/pulso(?=$|[/?#])/,
  selecao: /\/(?:selecao|extracao-cargo)(?=$|[/?#])/,
  radarbett: /\/(?:radarbett|radar\/bett)(?=$|[/?#])/,
  conarh: /\/conarh(?=$|[/?#])/,
  radarempresas: /\/admin\/vertho\/radarempresas(?=$|[/?#])/,
};

/** O próprio bloco pode se referenciar: é a navegação interna dele, atrás da mesma porta. */
const DO_PROPRIO_BLOCO: Record<string, RegExp> = {
  pulso: /(^|\/)(pulso|pulse)\//,
  selecao: /\/(selecao|extracao-cargo)\//,
  radarbett: /^app\/(radarbett|radar\/bett)\//,
  conarh: /^app\/conarh\//,
  radarempresas: /^app\/admin\/vertho\/radarempresas\//,
};

/**
 * Links que existem DE PROPÓSITO porque o gate mora em quem alimenta a tela,
 * não no arquivo do link. Cada um diz o motivo, e o guard confere que o gate
 * continua lá (`prova`): exceção cuja premissa sumiu é link aberto sem ninguém
 * ver. A lista só encolhe: exceção sem link a cobrir também reprova.
 */
const LINKS_COM_GATE_NO_LEITOR: Array<{
  arquivo: string; bloco: string; motivo: string; gate: string; prova: (txt: string) => boolean;
}> = [
  {
    arquivo: 'app/dashboard/page.tsx',
    bloco: 'pulso',
    motivo: 'o card de pulso pendente só desenha o que `carregarPulsosPendentes` devolve, e ela devolve [] ANTES da query com o Pulso off-line',
    gate: 'lib/home/loaders.ts',
    prova: (txt) => {
      const inicio = txt.indexOf('export async function carregarPulsosPendentes');
      if (inicio < 0) return false;
      const corpo = txt.slice(inicio);
      const gate = corpo.indexOf("if (blocoEstaOffline('pulso')) return [];");
      const query = corpo.indexOf(".from('pulse_assignments')");
      return gate > 0 && query > 0 && gate < query;
    },
  },
];

/** `.ts`/`.tsx` VERSIONADOS do produto (sem `tests/` e `scripts/`); null fora de repo git. */
function arquivosDoProduto(): string[] | null {
  let versionados: string[];
  try {
    versionados = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\0').filter(Boolean);
  } catch { return null; }
  return versionados.filter((f) =>
    /\.(ts|tsx)$/.test(f) && !f.startsWith('tests/') && !f.startsWith('scripts/') && !f.includes('blocos-offline'));
}

/** Tira as linhas comentadas: é nelas que o motivo de cada remoção fica registrado. */
function semComentarios(txt: string): string {
  return txt.split('\n').filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l)).join('\n');
}

function destinosDeLink(txt: string): Array<{ trecho: string; destino: string }> {
  return [...semComentarios(txt).matchAll(LINK)].map((m) => ({ trecho: m[0], destino: m[2] }));
}

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

  it('🔴 a mídia do estande do CONARH não volta ao public/ (o 404 da tela não fecha arquivo estático)', () => {
    // `public/` é servido sem passar pelo layout: com o bloco off-line desde
    // 31/08, /conarh respondia 404 e /conarh/media/relatorio-rh.pdf respondia
    // 200 (medido em produção, 03/10/2026). A mídia saiu do repositório (R-108);
    // religar o CONARH é tirar a entrada do registro E restaurá-la do histórico.
    if (!blocoEstaOffline('conarh')) return;
    let versionados: string[];
    try {
      versionados = execFileSync('git', ['ls-files', '-z', '--', 'public/conarh/'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
        .split('\0').filter(Boolean);
    } catch { return; } // fora de repo git: guard não se aplica
    expect(versionados, 'arquivo de bloco off-line em public/ abre por URL direta: ' + versionados.slice(0, 5).join(', ')).toEqual([]);
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

  it('🔴 nenhum link, inclusive `hrefFn`, para tela de Pulso, Seleção ou outro bloco off-line', () => {
    const alvos = arquivosDoProduto();
    if (!alvos) return; // fora de repo git: guard não se aplica
    expect(alvos.length, 'a varredura precisa ver o produto, senão não prova nada').toBeGreaterThan(500);

    const ofensores: string[] = [];
    for (const f of alvos) {
      let txt: string;
      try { txt = readFileSync(f, 'utf-8'); } catch { continue; }
      for (const { trecho, destino } of destinosDeLink(txt)) {
        for (const [bloco, rota] of Object.entries(ROTAS_FECHADAS)) {
          if (!blocoEstaOffline(bloco) || !rota.test(destino)) continue;
          if (DO_PROPRIO_BLOCO[bloco].test(f)) continue;
          if (LINKS_COM_GATE_NO_LEITOR.some((e) => e.arquivo === f && e.bloco === bloco)) continue;
          ofensores.push(`${f} (${bloco}): ${trecho.slice(0, 90)}`);
        }
      }
    }
    expect(
      ofensores,
      'link para tela de bloco off-line: a pessoa clica e cai num 404. Tire o link, ou gate '
      + 'pelo registro e declare a exceção com a prova do gate. Links:\n' + ofensores.join('\n'),
    ).toEqual([]);
  });

  it('🔴 cada exceção de link tem o gate no leitor, e ainda é necessária', () => {
    for (const e of LINKS_COM_GATE_NO_LEITOR) {
      expect(e.prova(readFileSync(e.gate, 'utf-8')), `${e.arquivo}: o gate em ${e.gate} sumiu (${e.motivo})`).toBe(true);
      const aindaLinka = destinosDeLink(readFileSync(e.arquivo, 'utf-8')).some((l) => ROTAS_FECHADAS[e.bloco].test(l.destino));
      expect(aindaLinka, `${e.arquivo} não linka mais para ${e.bloco}: tire a exceção`).toBe(true);
    }
  });

  it('🔴 a aba "Potencial por Cidade" (acervo do Radar Empresas) some com o bloco off-line', () => {
    if (!blocoEstaOffline('radarempresas')) return;
    expect(abaUnificadaDisponivel()).toBe(false);
    expect(secoesDoMercado()).toEqual(['mercado']);
    // Link salvo e o redirect da rota antiga abrem o mercado de escolas.
    expect(secaoInicialDoMercado('unificado')).toBe('mercado');

    // A tela decide pela régua, e quem CONVIDA para a aba consulta a mesma régua.
    const workspace = readFileSync('app/admin/vertho/mercado-potencial/page.tsx', 'utf-8');
    expect(workspace).toContain('secaoInicialDoMercado(');
    expect(workspace).toContain('secoesDoMercado(');
    const alvos = arquivosDoProduto();
    if (!alvos) return;
    // A rota antiga só redireciona para o workspace, que resolve a aba pela régua.
    const REDIRECT_DA_ROTA_ANTIGA = 'app/admin/vertho/potencial-cidades/page.tsx';
    const semRegua = alvos.filter((f) => {
      if (f === REDIRECT_DA_ROTA_ANTIGA) return false;
      const txt = readFileSync(f, 'utf-8');
      const convida = destinosDeLink(txt).some((l) => /mercado-potencial\?tab=unificado/.test(l.destino));
      return convida && !txt.includes('abaUnificadaDisponivel()');
    });
    expect(semRegua, 'atalho para a aba Unificado sem consultar abaUnificadaDisponivel(): ' + semRegua.join(', ')).toEqual([]);
  });
});
