/* eslint-disable */
// RE-EXTRAI de uma rodada JÁ GRAVADA, com o extrator ATUAL. Nenhuma cena nova.
//
// ═══ POR QUE ESTE SCRIPT EXISTE ═══
//
// A troca de 25/08/2026 — do extrator de OCORRÊNCIA (demonstrou/tentou/falhou)
// para o classificador ANCORADO (n1_gap/n2_em_desenvolvimento/n3_meta, com as
// três âncoras do descritor à vista) — muda o que o modelo responde, não o que
// aconteceu na cena. As transcrições estão em disco.
//
// Rodar cenas novas para medir a troca custaria ~US$ 3,50, 40 minutos, e — pior
// — trocaria DUAS coisas ao mesmo tempo: o extrator e o diálogo. Com diálogos
// novos, "a nota do braço N1 caiu" não distingue extrator melhor de ator mais
// duro. Re-extrair do MESMO diálogo isola a variável: o que muda é só a leitura.
//
// Uso: npx tsx scripts/_cena-reextrair.ts cena-fase0c.json [--saida x.json]
process.loadEnvFile('.env.local');

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extrairEvidenciasCena } from '@/lib/season-engine/cena/core';
import { consolidarCena, nivelDaEvidencia } from '@/lib/season-engine/cena/beats';
import { validarSaidaDaCena, saidaConfiavel } from '@/lib/season-engine/cena/validar-saida';

const arg = (n: string, d = '') => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

const entrada = process.argv[2];
if (!entrada || entrada.startsWith('--')) {
  console.error('uso: _cena-reextrair.ts <arquivo.json> [--saida x.json]');
  process.exit(1);
}
const saida = arg('saida', entrada.replace(/\.json$/, '-reextraido.json'));

const d = JSON.parse(readFileSync(entrada, 'utf-8'));
const ctx = d.ctx;
const nd = ctx.descritores.length;

/**
 * Gravação INCREMENTAL, e retomada pelo que já está gravado.
 *
 * Mesma regra da fase 0: uma rodada de 10 extrações leva minutos e paga IA. Se
 * a última travar, o trabalho das nove anteriores não pode evaporar — foi assim
 * que uma rodada inteira se perdeu em 25/08.
 */
const feitas: any[] = existsSync(saida) ? JSON.parse(readFileSync(saida, 'utf-8')).rodadas ?? [] : [];
const gravar = () =>
  writeFileSync(saida, JSON.stringify({ ctx, origem: entrada, rodadas: feitas }, null, 2));

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : ' -- ');

(async () => {
  for (let k = 0; k < d.rodadas.length; k++) {
    if (feitas[k]) { console.log(`[${k + 1}/${d.rodadas.length}] já feita, pulando`); continue; }
    const r = d.rodadas[k];
    if (!r?.estado?.historico?.length) { feitas[k] = null; gravar(); continue; }

    const extracao = await extrairEvidenciasCena(ctx, r.estado, {});
    if (!extracao) {
      console.log(`[${k + 1}] ✗ extração vazia`);
      feitas[k] = { nivel: r.nivel, extracao: null, consolidacao: null, violacoes: [], confiavel: false };
      gravar();
      continue;
    }

    const consolidacao = consolidarCena(extracao.evidencias, nd, {
      beats: ctx.beats,
      beatsCumpridos: r.estado.beatsCumpridos,
    });
    const violacoes = validarSaidaDaCena({
      numDescritores: nd,
      totalBeats: ctx.beats.length,
      turnos: r.estado.turno,
      beatsCumpridos: r.estado.beatsCumpridos,
      contrato: {
        armadilha: ctx.cenario.armadilhaGenerica,
        tradeoff: ctx.cenario.tradeoffTestado,
        complicador: ctx.cenario.fatorComplicador,
      },
      evidencias: extracao.evidencias,
      consolidacao,
      falasDoAvaliado: r.estado.historico.filter((m: any) => m.role === 'user').map((m: any) => m.content),
    });
    const erros = violacoes.filter((x) => x.severidade === 'erro');
    if (erros.length) {
      console.log(`[${k + 1}] ✗ SAÍDA INVÁLIDA — ${erros.length} erro(s)`);
      erros.slice(0, 6).forEach((x) => console.log(`      ${x.campo}: ${x.detalhe.slice(0, 140)}`));
    }

    feitas[k] = {
      nivel: r.nivel,
      extracao,
      consolidacao,
      violacoes,
      confiavel: saidaConfiavel(violacoes),
      antes: { media: r.consolidacao?.media ?? null, nivel: r.consolidacao?.nivel ?? null },
    };
    gravar();
    const cts = extracao.evidencias.reduce((a: any, e: any) => {
      const n = nivelDaEvidencia(e); a[n] = (a[n] ?? 0) + 1; return a;
    }, {});
    console.log(
      `[${k + 1}] ator N${r.nivel}  enc ${f2(consolidacao.media ?? NaN)} (N${consolidacao.nivel ?? '-'})` +
      `  abe ${f2(consolidacao.abertura.media ?? NaN)} (N${consolidacao.abertura.nivel ?? '-'})` +
      `  antes ${f2(r.consolidacao?.media ?? NaN)}` +
      `  | ${Object.entries(cts).map(([n, c]) => `${n}:${c}`).join(' ')}`,
    );
  }

  // ── Comparação por braço ──────────────────────────────────────────────────
  //
  // O que se quer ver aqui NÃO é "a média caiu". É se o instrumento SEPARA os
  // dois braços: um ator instruído a ser N1 tem de sair diferente de um
  // instruído a ser N3. Média que anda junto nos dois é ruído com duas casas.
  const validas = feitas.filter((x) => x && x.consolidacao);
  console.log('\n════ POR BRAÇO ════');
  console.log('ator   n   encerramento     abertura        antes (ocorrência)');
  const resumo: Record<number, { enc: number; abe: number }> = {} as any;
  for (const nv of [1, 3]) {
    const g = validas.filter((x) => x.nivel === nv);
    if (!g.length) continue;
    const enc = media(g.map((x) => x.consolidacao.media).filter((n: any) => n != null));
    const abe = media(g.map((x) => x.consolidacao.abertura.media).filter((n: any) => n != null));
    const antes = media(g.map((x) => x.antes?.media).filter((n: any) => n != null));
    resumo[nv] = { enc, abe };
    const niveisEnc = g.map((x) => `N${x.consolidacao.nivel ?? '-'}`).join(' ');
    const niveisAbe = g.map((x) => `N${x.consolidacao.abertura.nivel ?? '-'}`).join(' ');
    console.log(`N${nv}    ${String(g.length).padEnd(3)} ${f2(enc)} [${niveisEnc}]   ${f2(abe)} [${niveisAbe}]   ${f2(antes)}`);
  }
  if (resumo[1] && resumo[3]) {
    console.log(`\nseparação N3−N1:  encerramento ${f2(resumo[3].enc - resumo[1].enc)}` +
      `   abertura ${f2(resumo[3].abe - resumo[1].abe)}`);
  }
  const invalidas = feitas.filter((x) => x && !x.confiavel).length;
  console.log(`\nrodadas inválidas: ${invalidas} de ${feitas.filter(Boolean).length}   → ${saida}`);
})();
