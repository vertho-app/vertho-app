import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RECEPCAO_SESSAO, VENDAS_SESSAO } from '@/lib/status';
import { NAV_ITEMS } from '@/app/admin/_shell/nav-items';

/**
 * R-96 (04/10/2026): a tela "Treinos parados" e as telas do atendimento usam
 * chaves novas de i18n. `npm run i18n:check` prova que os 4 locales têm as MESMAS
 * chaves, mas não que o código só pede chaves que EXISTEM: o next-intl lança
 * MISSING_MESSAGE em runtime, e a tela admin cairia inteira. Aqui as duas pontas:
 * toda chave que a tela pede existe nos 4 locales, e toda chave do bloco novo é
 * pedida por alguém (config sem consumidor é promessa sem comportamento).
 */
const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'] as const;
const mensagens = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, 'utf-8'))]),
) as Record<(typeof LOCALES)[number], any>;

const pagina = readFileSync('app/admin/treinos-parados/page.tsx', 'utf-8');

function folhas(obj: any, prefixo = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? folhas(v, `${prefixo}${k}.`) : [`${prefixo}${k}`],
  );
}
const existe = (locale: (typeof LOCALES)[number], namespace: string, chave: string) =>
  chave.split('.').reduce((no: any, parte) => (no == null ? no : no[parte]), mensagens[locale][namespace]) != null;

/** Os argumentos de cada `t(...)` do arquivo: literais ('a.b') e modelos (`errors.${x}`). */
function chavesPedidas(fonte: string) {
  const literais = new Set<string>();
  const familias = new Set<string>();
  for (const m of fonte.matchAll(/(?<![\w.])t\(/g)) {
    let nivel = 0;
    let i = m.index! + 1;
    const ini = i;
    for (; i < fonte.length; i++) {
      if (fonte[i] === '(') nivel++;
      if (fonte[i] === ')' && --nivel === 0) break;
    }
    const args = fonte.slice(ini, i);
    for (const l of args.matchAll(/'([A-Za-z][\w.]*)'/g)) literais.add(l[1]);
    for (const f of args.matchAll(/`([\w.]*)\$\{/g)) familias.add(f[1]);
  }
  return { literais, familias };
}

describe('tela Treinos parados: i18n', () => {
  const { literais, familias } = chavesPedidas(pagina);

  it('o leitor de chaves enxerga a tela (denominador)', () => {
    expect(literais.size).toBeGreaterThan(25);
    expect([...familias].sort()).toEqual(['errors.', 'simulators.', 'status.']);
  });

  it.each(LOCALES)('%s: toda chave pedida existe', (locale) => {
    const faltando = [...literais].filter((k) => !existe(locale, 'AdminStalledTrainings', k));
    expect(faltando).toEqual([]);
  });

  it.each(LOCALES)('%s: as famílias dinâmicas cobrem todo valor possível', (locale) => {
    const codigos = [...pagina.match(/CODIGOS_CONHECIDOS = \[([\s\S]*?)\] as const/)![1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
    // Todo código que a ação pode devolver tem texto (o resto cai em errors.generic).
    expect(codigos.sort()).toEqual(
      ['entrada_invalida', 'erro', 'falha', 'motivo_obrigatorio', 'mudou', 'nao_elegivel', 'nao_encontrada', 'recente', 'em_processamento'].sort(),
    );
    for (const c of [...codigos, 'generic']) expect(existe(locale, 'AdminStalledTrainings', `errors.${c}`), `errors.${c}`).toBe(true);
    for (const s of ['vendas', 'atendimento']) expect(existe(locale, 'AdminStalledTrainings', `simulators.${s}`), `simulators.${s}`).toBe(true);
    // Os estados que a lista traz: os que o tratamento cobre nos dois simuladores.
    for (const s of [VENDAS_SESSAO.EM_ANDAMENTO, RECEPCAO_SESSAO.EM_ANDAMENTO, RECEPCAO_SESSAO.AGUARDANDO_AVALIACAO])
      expect(existe(locale, 'AdminStalledTrainings', `status.${s}`), `status.${s}`).toBe(true);
  });

  it.each(LOCALES)('%s: nenhuma chave do bloco novo fica sem consumidor', (locale) => {
    const usadas = (k: string) => literais.has(k) || [...familias].some((f) => k.startsWith(f));
    const orfas = folhas(mensagens[locale].AdminStalledTrainings).filter((k) => !usadas(k));
    expect(orfas).toEqual([]);
  });

  it.each(LOCALES)('%s: o item de menu e o rótulo da auditoria existem', (locale) => {
    const item = NAV_ITEMS.find((i) => i.key === 'treinos-parados');
    expect(item).toBeDefined();
    expect(mensagens[locale].AdminDashboard.nav.labels[item!.labelKey]).toBeTruthy();
    expect(mensagens[locale].AdminDashboard.nav.subs[item!.subKey]).toBeTruthy();
    expect(mensagens[locale].AdminAudit.actions.simulador_sessao_encerrar_sem_devolutiva).toBeTruthy();
  });

  it('o menu leva à tela e é leitura para qualquer admin (o botão é que exige a permissão)', () => {
    const item = NAV_ITEMS.find((i) => i.key === 'treinos-parados')!;
    expect(item.hrefFn()).toBe('/admin/treinos-parados');
    expect(item.hrefFn('abc')).toBe('/admin/treinos-parados?empresa=abc');
    expect(item.permission).toBeUndefined();
    expect(pagina).toContain("podeVer('simulador.sessoes.manage')");
  });
});

describe('atendimento: chaves novas da conversa encerrada pela equipe', () => {
  const fontes = {
    treino: readFileSync('components/recepcao/treino.tsx', 'utf-8'),
    gestao: readFileSync('components/recepcao/gestao.tsx', 'utf-8'),
  };

  it('as telas pedem as chaves e elas existem nos 4 locales', () => {
    expect(fontes.treino).toContain("t('closedNoReport')");
    expect(fontes.treino).toContain("t('closedBySupport')");
    expect(fontes.gestao).toContain("t('closedNoReport')");
    for (const l of LOCALES)
      for (const k of ['closedNoReport', 'closedBySupport'])
        expect(existe(l, 'SimuladorAtendimento', k), `${l}: ${k}`).toBe(true);
  });

  it('a tela tira a conversa encerrada pela equipe do modo "responder" e do "Retomar"', () => {
    // Guard estático (a imagem é o veredito final, depois do deploy): o campo de
    // resposta e o "Encerrar e avaliar" só existem em `emConversa`.
    expect(fontes.treino).toMatch(/const emConversa = sessao && !relatorio && !encerradaPelaEquipe;/);
    expect(fontes.treino).toContain('const encerradaPelaEquipe = sessao?.status === RECEPCAO_SESSAO.INTERROMPIDA;');
    expect(fontes.treino).toMatch(/item\.status === RECEPCAO_SESSAO\.INTERROMPIDA\s*\?\s*t\('closedNoReport'\)/);
    // Para o RH e o gestor, "interrompida" não pode aparecer como "Em andamento".
    expect(fontes.gestao).toMatch(/s\.status === RECEPCAO_SESSAO\.INTERROMPIDA\s*\?\s*t\('closedNoReport'\)/);
  });
});
