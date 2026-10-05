/**
 * O Ranking de Adequação do pacote offline: o PDF e a tela dizem o mesmo (R-136, 05/10/2026).
 *
 * A TELA do pacote serve o retrato salvo do ranking (`panels-snapshot.json`, capturado da sala
 * online). O PDF sai do mesmo motor sobre o elenco e os gabaritos versionados, SEM banco
 * (`lib/demo/offline/ranking-snapshots.ts`). Se o motor, o gabarito, o DISC de uma persona ou o
 * filtro de quem tem perfil mudarem, as duas pontas se separam e o lead vê um número na tela e
 * outro no documento. Este teste recalcula e compara pessoa a pessoa: aderência, status e os
 * quatro blocos. Também trava o vocabulário das narrativas (que a sala online grava e o PDF imprime).
 */
import { describe, it, expect } from 'vitest';
import { acmeOfflineData } from '@/lib/demo/offline/acme-data';
import { schoolOfflineData } from '@/lib/demo/offline/data';
import { offlineEnvironment, type OfflineTenant } from '@/lib/demo/offline/environment';
import { entradaDoPdfDeRanking, rankingsDoPacote, semTravessaoDoMotor } from '@/lib/demo/offline/ranking-snapshots';
import { buildAcmeFitRankingNarratives } from '@/lib/demo/acme-fit-rankings';

const AMBIENTES: Array<[OfflineTenant, () => ReturnType<typeof acmeOfflineData>]> = [['acme-demo', acmeOfflineData], ['escolas-acme', schoolOfflineData]];
const VOCABULARIO_DA_SELECAO = /candidat|eleg[ií]ve|elimin|entrevista|psic[óo]log|\bvagas?\b|\bgaps?\b/i;

describe.each(AMBIENTES)('ranking do pacote offline: %s', (tenant, dados) => {
  const painel = dados().panels;
  const cargos = Object.values<any>(painel.rankings).map((r) => ({ cargo: r.cargo, dataISO: r.dataISO }));

  it('o ranking recalculado bate com o retrato que a tela mostra, pessoa a pessoa', async () => {
    expect(cargos.length).toBeGreaterThan(0);
    const calculados = await rankingsDoPacote(tenant, offlineEnvironment(tenant).name, cargos);
    let pessoas = 0;
    for (const salvo of Object.values<any>(painel.rankings)) {
      const input = calculados.find((c) => c.cargo === salvo.cargo)!.input;
      const porNome = new Map(input.elegiveis.map((p) => [p.nome, p]));
      // Mesmas pessoas: quem tem o perfil comportamental concluído e não está no anexo.
      expect([...porNome.keys()].sort(), `${salvo.cargo}: quem está no ranking`).toEqual(salvo.elegiveis.map((e: any) => e.nome).sort());
      expect(input.anexo.map((p) => p.nome).sort(), `${salvo.cargo}: quem está no anexo`).toEqual(salvo.anexoGate.map((e: any) => e.nome).sort());
      expect(input.perfilIdeal.faixas, `${salvo.cargo}: faixas`).toEqual(salvo.faixas);
      for (const e of salvo.elegiveis) {
        const p: any = porNome.get(e.nome);
        pessoas++;
        expect(Math.abs(p.beta.pct - e.aderencia), `${salvo.cargo} / ${e.nome}: aderência`).toBeLessThanOrEqual(0.051);
        expect(p.status, `${salvo.cargo} / ${e.nome}: status`).toBe(e.status);
        const blocos: Record<string, any> = { 'Competência': p.competencia, 'Liderança': p.lideranca, 'DISC': p.discScore, 'Mapeamento': p.mapeamento };
        for (const [bloco, valor] of Object.entries<any>(e.blocos)) {
          if (valor == null) continue;
          expect(Math.abs((blocos[bloco]?.pct ?? -999) - valor), `${salvo.cargo} / ${e.nome}: bloco ${bloco}`).toBeLessThanOrEqual(0.051);
        }
      }
    }
    // Sem esta âncora o laço poderia percorrer nada e passar por vacuidade.
    expect(pessoas).toBeGreaterThanOrEqual(tenant === 'acme-demo' ? 27 : 12);
  });

  it('o PDF ordena por aderência, narra todo mundo e não usa o vocabulário da Seleção nem travessão', async () => {
    const calculados = await rankingsDoPacote(tenant, offlineEnvironment(tenant).name, cargos);
    for (const { cargo, input } of calculados) {
      const betas = input.elegiveis.map((p) => p.beta.pct);
      expect([...betas].sort((a, b) => b - a), `${cargo}: ordem`).toEqual(betas);
      for (const p of [...input.elegiveis, ...input.anexo]) {
        expect(input.narrativas[p.nome], `${cargo}: narrativa de ${p.nome}`).toBeTruthy();
      }
      const texto = JSON.stringify([input.narrativas, input.elegiveis.map((p) => [p.nome, p.statusLabel, p.gaps, p.tracos])]);
      expect(texto.match(VOCABULARIO_DA_SELECAO), `${cargo}: vocabulário`).toBeNull();
      expect(texto, `${cargo}: travessão`).not.toMatch(/[—―]/);
    }
  });
});

describe('semTravessaoDoMotor', () => {
  it('troca o travessão do rótulo por dois-pontos no snapshot inteiro e não toca em número, chave nem intervalo', () => {
    const entrada = { 'D — Dominância': 1, rotulo: 'D — Dominância', lista: ['S — Estabilidade', 'faixa 41–80'], n: 7, aninhado: { texto: 'C — Conformidade, com 0%' } };
    expect(semTravessaoDoMotor(entrada)).toEqual({ 'D — Dominância': 1, rotulo: 'D: Dominância', lista: ['S: Estabilidade', 'faixa 41–80'], n: 7, aninhado: { texto: 'C: Conformidade, com 0%' } });
  });
});

describe('narrativas determinísticas do ranking da demo (a sala online grava, o PDF imprime)', () => {
  const pessoa = (status: string, extra: any = {}) => ({
    nome: 'Pessoa', status, beta: { pct: 70 }, competencia: { aplicavel: true, pct: 90 }, lideranca: { aplicavel: false, pct: 0 },
    discScore: { aplicavel: true, pct: 60 }, mapeamento: { aplicavel: true, pct: 50 }, gaps: [], knockoutEvidencias: [], ...extra,
  });
  it('os quatro estados falam de ranking, requisito essencial e distância até a meta, nunca de entrevista nem de requisito eliminatório', () => {
    const data: any = { pessoas: [
      pessoa('recomendado'),
      pessoa('recomendado_com_ressalvas', { nome: 'B', gaps: [{ traco: 'Prudência', fitPct: 64 }] }),
      pessoa('abaixo_do_corte', { nome: 'C' }),
      pessoa('bloqueado', { nome: 'D', knockoutEvidencias: [] }),
    ] };
    const textos = Object.values(buildAcmeFitRankingNarratives(data));
    expect(textos).toHaveLength(4);
    for (const t of textos) expect(t.match(VOCABULARIO_DA_SELECAO), t).toBeNull();
    expect(textos.join(' ')).toContain('fora do ranking por requisito essencial');
    expect(textos.join(' ')).toContain('conversar com a pessoa sobre Prudência');
    expect(textos.join(' ')).toContain('as distâncias até a meta apontadas no diagnóstico');
  });
});

describe('entradaDoPdfDeRanking', () => {
  it('põe o bloqueado no anexo, sem aderência, e o resto em ordem de aderência', () => {
    const p = (nome: string, pct: number, status: string) => ({ nome, status, beta: { pct }, competencia: { pct }, lideranca: { pct: 0, excluido: true }, discScore: { pct }, mapeamento: { pct } });
    const snapshot: any = {
      data: { cargo: 'X', perfilIdeal: { pesos: [{ bloco: 'Competência', pct: 100 }] }, pessoas: [p('Baixa', 60, 'abaixo_do_corte'), p('Alta', 95, 'recomendado'), p('Fora', 10, 'bloqueado')] },
      empresaNome: 'Empresa', dataISO: '2026-09-17T07:00:00.000Z', narrativas: {},
    };
    const entrada = entradaDoPdfDeRanking(snapshot, 'X');
    expect(entrada.elegiveis.map((x) => x.nome)).toEqual(['Alta', 'Baixa']);
    expect(entrada.anexo.map((x) => x.nome)).toEqual(['Fora']);
  });
});
