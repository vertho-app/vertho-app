/**
 * Os dados que alimentam os PDFs e as telas do pacote offline (R-136, 05/10/2026).
 *
 * O guard dos PDFs (`demo-offline-pdfs-guard.test.ts`) lê o que saiu no papel; este lê o que ENTRA:
 * o PDI da persona na Jornada de 7 semanas e sem nota decimal nem travessão, e o relatório do gestor
 * e do RH pelo mesmo construtor que a sala online recebe por último a cada reset, com a distribuição
 * por nível contada sobre as pessoas da equipe de verdade. Sem rede e sem fonte: roda no CI inteiro.
 */
import { describe, it, expect } from 'vitest';
import { acmeOfflineData } from '@/lib/demo/offline/acme-data';
import { schoolOfflineData } from '@/lib/demo/offline/data';
import { offlineEnvironment, type OfflineTenant } from '@/lib/demo/offline/environment';
import { leiturasDoElenco } from '@/lib/demo/offline/leituras';
import { nomesDosDocumentos } from '@/lib/demo/offline/documentos';
import { ACME_DEMO_FUNNEL_TARGETS } from '@/lib/demo/acme-rh-report-fixture';
import { ROSTER_ESCOLAR } from '@/lib/demo/rosters';
import type { OfflineData } from '@/lib/demo/offline/types';

/** Travessão longo e barra horizontal: o que a regra de voz proíbe como pausa. */
const TRAVESSAO = new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2015)}]`);

const AMBIENTES: Array<[OfflineTenant, () => OfflineData]> = [['acme-demo', acmeOfflineData], ['escolas-acme', schoolOfflineData]];

/** Só o texto: número e chave não entram (o percentual por nível é número e o renderizador o formata). */
function textos(valor: unknown, saida: string[] = []): string[] {
  if (typeof valor === 'string') saida.push(valor);
  else if (Array.isArray(valor)) valor.forEach((v) => textos(v, saida));
  else if (valor && typeof valor === 'object') Object.values(valor).forEach((v) => textos(v, saida));
  return saida;
}

describe.each(AMBIENTES)('dados do pacote offline: %s', (tenant, dados) => {
  const d = dados();
  const ambiente = offlineEnvironment(tenant);

  it('o PDI é o da Jornada de 7 semanas, e o mapa de semanas também (nunca 14)', () => {
    const pdi: any = d.pdi;
    expect(pdi.total_semanas).toBe(7);
    expect(pdi.programa_modo).toBe('jornada');
    expect(pdi.trilha_mapa.duracao_semanas).toBe(7);
    expect(pdi.trilha_mapa.semanas).toHaveLength(7);
    expect(Math.max(...pdi.trilha_mapa.semanas.map((s: any) => Number(s.semana)))).toBe(7);
  });

  it('o PDI não leva a nota decimal do fixture nem travessão, e conserva o nível', () => {
    const pdi = JSON.stringify(d.pdi);
    expect(pdi).not.toContain('nota_decimal');
    expect(textos(d.pdi).filter((t) => TRAVESSAO.test(t))).toEqual([]);
    for (const item of (d.pdi as any).resumo_desempenho) expect([1, 2, 3, 4]).toContain(item.nivel);
  });

  it('o relatório do gestor e o do RH não citam nota decimal, média nem travessão', () => {
    const texto = textos([d.coordination, d.direction]);
    expect(texto.filter((t) => /\d[.,]\d/.test(t))).toEqual([]);
    expect(texto.filter((t) => /\b(nota|m[ée]dia)\b/i.test(t))).toEqual([]);
    expect(texto.filter((t) => TRAVESSAO.test(t))).toEqual([]);
  });

  it('o relatório do gestor fala da equipe do gestor do ambiente, e só dela', () => {
    const equipe = new Set(d.people.filter((p) => p.manager === ambiente.names.manager).map((p) => p.name));
    expect(equipe.size).toBeGreaterThan(0);
    const c: any = d.coordination;
    const citados = [...c.destaques_evolucao, ...c.ranking_atencao].map((x: any) => x.nome);
    expect(citados.length).toBeGreaterThan(0);
    for (const nome of citados) expect(equipe.has(nome), `${nome} não é da equipe de ${ambiente.names.manager}`).toBe(true);
    expect(c.resumo_executivo.leitura_geral).toContain(ambiente.names.manager);
  });

  it('a distribuição por nível de cada competência soma as pessoas que o próprio texto conta', () => {
    for (const a of (d.coordination as any).analise_por_competencia) {
      const soma = ['n1', 'n2', 'n3', 'n4'].reduce((s, k) => s + a.distribuicao[k], 0);
      expect(String(a.padrao_observado), a.competencia).toMatch(new RegExp(`^${soma} pessoas`));
    }
    for (const cargo of (d.direction as any).visao_por_cargo) {
      const soma = ['n1', 'n2', 'n3', 'n4'].reduce((s, k) => s + cargo.distribuicao[k], 0);
      expect(soma, cargo.cargo).toBeGreaterThan(0);
      expect([1, 2, 3, 4]).toContain(cargo.nivel_mais_frequente);
    }
  });

  it('o ambiente declara exatamente os PDFs que o gerador produz (12 na ACME, 6 na escola)', () => {
    expect(nomesDosDocumentos(tenant)).toHaveLength(tenant === 'acme-demo' ? 12 : 6);
  });
});

describe('o RH do pacote conta as mesmas pessoas que o funil do ambiente declara', () => {
  it('ACME: avaliados do relatório = pessoas com o mapeamento completo do funil', () => {
    expect((acmeOfflineData().direction as any).indicadores.total_avaliados).toBe(ACME_DEMO_FUNNEL_TARGETS.withMapping);
  });
  it('escola: avaliados do relatório = Marina mais as pessoas mapeadas do panorama', () => {
    expect((schoolOfflineData().direction as any).indicadores.total_avaliados).toBe(1 + (ROSTER_ESCOLAR.panorama?.mapeados ?? []).length);
  });
});

describe('leiturasDoElenco', () => {
  const pessoa = (key: string, role: string, extra = {}) => ({ key, email: `${key}@demo`, nome_completo: key, cargo: key === 'gestor' ? 'Coordenação' : 'Professor', role, ...extra });
  const nota = (competency: string, score: number) => ({ competency, descriptor: 'D1', score });

  it('falha alto quando o gestor pedido não existe (relatório vazio passaria por "sem dados")', () => {
    expect(() => leiturasDoElenco('Marca', [pessoa('gestor', 'gestor'), pessoa('ana', 'colaborador', { gestor_email: 'gestor@demo' })], { ana: [nota('Didática', 2)] }, 'fantasma'))
      .toThrow(/sem relatório de gestor \(fantasma\)/);
  });

  it('só o nível chega ao texto: a nota 3,10 vira N3 e o cargo que só lidera não entra no mapeamento', () => {
    const r = leiturasDoElenco(
      'Marca',
      [pessoa('gestor', 'gestor'), pessoa('ana', 'colaborador', { gestor_email: 'gestor@demo' })],
      { ana: [nota('Didática', 3.1)], gestor: [nota('Coordenar', 1.1)] },
      'gestor',
    );
    const texto = JSON.stringify(r);
    expect(texto).toContain('Didática em N3');
    expect(texto).not.toMatch(/3,1|3\.1/);
  });
});
