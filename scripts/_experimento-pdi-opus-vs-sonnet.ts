/**
 * O modelo melhor entrega PDI melhor? — experimento pareado, medido pelo auditor.
 *
 * Por que agora (27/08/2026): até esta rodada, "Opus 5 é melhor que Sonnet 5 no
 * PDI?" só tinha resposta por painel de juízes LLM (n=4) ou leitura humana. O
 * `pdi_check` mudou isso: ele conta afirmação sem lastro, análise genérica,
 * desproporção e contradição — e já provou que discrimina, pegando o PDI
 * inferindo dificuldades pessoais do perfil DISC na primeira execução limpa.
 *
 * DESENHO, e cada escolha existe para matar um confundidor:
 *
 *  · PAREADO — a MESMA pessoa nos dois modelos. Sem isso, a diferença entre
 *    sujeitos (uns têm evidência rica, outros não) domina a diferença entre
 *    modelos, que é o que este projeto já chamou de "conclusão sorteada".
 *  · MESMO AUDITOR nos dois braços (`pdi_check` → gpt-5.6-terra). Trocar o
 *    auditor junto mediria o auditor, não o gerador.
 *  · MESMA EVIDÊNCIA: o auditor recebe o `user` do gerador — que é idêntico
 *    entre os braços, porque só o modelo muda.
 *  · NÃO PERSISTE. Nenhum relatório real é sobrescrito; isto é medição.
 *    `source: 'experimento'`, fora da população que decide teto de produção.
 *  · O auditor NÃO sabe qual modelo gerou. Ele recebe o artefato e a evidência.
 *
 * ⚠️ O que este experimento NÃO resolve: variância do auditor entre execuções.
 * Com n pequeno, uma diferença de 1-2 achados não é sinal. O relatório imprime
 * o n e a distribuição por sujeito para que ninguém leia uma média como
 * veredito.
 *
 *   npx tsx --env-file=.env.local scripts/_experimento-pdi-opus-vs-sonnet.ts [n]
 */
import { createSupabaseAdmin } from '../lib/supabase';
import { callAI } from '../actions/ai-client';
import { extractJSON } from '../actions/utils';
import { buildRelatorioIndividualPrompt, normKey } from '../lib/relatorio-individual-prompt';
import { getModelForTask } from '../lib/ai-tasks';
import {
  auditarPdiEstrutural, consolidarAuditoriaPdi, promptAuditoriaPdi, parseAuditoriaPdi,
  type PdiAuditCheck,
} from '../lib/relatorios/pdi-audit';

const EMPRESA = '0d99fed1-1710-40e3-b32e-7a95c7d023fe'; // Ibipeba
// Braços do experimento. `MODELO_UNICO=x` restringe a um só — usado para medir
// o efeito de uma mudança de PROMPT contra a linha de base do mesmo modelo,
// onde rodar os dois braços mediria a coisa errada.
const BRACOS = (process.env.MODELO_UNICO
  ? [process.env.MODELO_UNICO]
  : ['claude-sonnet-5', 'claude-opus-5']) as readonly string[];

const SUJEITOS = [
  '04215b5e-e7f3-43b1-978c-3dab600e89d8',
  '06de8798-8992-4d96-bf6e-4963d7f54404',
  '18d52f78-8391-4de8-9f1f-d41bc2e7413d',
  '31f27870-415e-45e8-a606-461614ba5507',
  '449c2c26-7286-430b-8d0b-84ae02c37a1e',
  '44a6cc6a-23dd-417d-a546-1fac3542c61d',
];

interface Resultado {
  sujeito: string;
  modelo: string;
  ok: boolean;
  achadosSemanticos: number;
  falhasEstruturais: number;
  status: string;
  tipos: string[];
  erro?: string;
}

async function rodar(sb: any, colaboradorId: string, modelo: string): Promise<Resultado> {
  const base = { sujeito: colaboradorId.slice(0, 8), modelo };
  try {
    const built = await buildRelatorioIndividualPrompt(sb, { empresaId: EMPRESA, colaboradorId });
    if ('error' in built) return { ...base, ok: false, achadosSemanticos: 0, falhasEstruturais: 0, status: '-', tipos: [], erro: built.error };
    const { system, user, dadosComps, blueprint } = built;

    // ⚠️ `timeoutMs` explicito. Na 1a rodada uma chamada do Sonnet 5 morreu em
    // `APIUserAbortError` no default de 120s — e chamada que morre por relogio
    // cria VIES DE SOBREVIVENCIA: some justamente a execucao mais longa, que e
    // a mais provavel de ter mais achados. Medir com o teto de tempo apertado
    // compararia quem cabe no relogio, nao quem escreve melhor.
    //
    // (Isto tambem e achado de PRODUCAO: `pdi_individual` nao passa `timeoutMs`,
    // entao roda nos mesmos 120s. Hoje o p95 e 75s; o Opus 5 mede 101-103s.)
    const bruto = await callAI(system, user, { model: modelo }, 64000, {
      timeoutMs: 300_000, maxRetries: 0,
      taskKey: 'pdi_experimento', source: 'experimento', empresaId: EMPRESA, colaboradorId,
    });
    const relatorio: any = await extractJSON(bruto);
    if (!relatorio) return { ...base, ok: false, achadosSemanticos: 0, falhasEstruturais: 0, status: '-', tipos: [], erro: 'JSON inválido' };

    // Mesmo tratamento nos DOIS braços: `flag` vem do dado real, não do modelo,
    // e é ele que o check `gap-sem-acao` lê. Sem isto o check mediria ruído.
    if (Array.isArray(relatorio.competencias)) {
      for (const c of relatorio.competencias) {
        const src = dadosComps.find((d) => normKey(d.competencia) === normKey(c?.nome));
        if (src && typeof src.nivel === 'number') c.flag = src.nivel < 3;
      }
    }

    const objetivos = blueprint
      ? (blueprint.competencias || []).flatMap((comp: any) => (comp.objetivos_30_dias || []).map((o: any) => ({
        competencia: comp.nome, acao_principal: o?.acao_principal, acao_apoio: o?.acao_apoio, ritual: o?.ritual,
      })))
      : null;

    const checks: PdiAuditCheck[] = auditarPdiEstrutural(relatorio, objetivos);
    const modeloAuditor = await getModelForTask(EMPRESA, 'pdi_check');
    const { system: sA, user: uA } = promptAuditoriaPdi(relatorio, user.slice(0, 40000));
    const respA = await callAI(sA, uA, { model: modeloAuditor }, 6000, {
      taskKey: 'pdi_experimento_check', source: 'experimento', empresaId: EMPRESA, colaboradorId,
    });
    checks.push(...parseAuditoriaPdi(await extractJSON(respA)));

    const rel = consolidarAuditoriaPdi(checks, dadosComps.length);
    const sem = checks.filter((c) => c.categoria === 'semantica');
    return {
      ...base, ok: true, status: rel.status,
      achadosSemanticos: sem.reduce((s, c) => s + c.ocorrencias.length, 0),
      falhasEstruturais: checks.filter((c) => c.categoria === 'estrutura' && c.status === 'fail').length,
      tipos: sem.map((c) => c.id),
    };
  } catch (e: any) {
    return { ...base, ok: false, achadosSemanticos: 0, falhasEstruturais: 0, status: '-', tipos: [], erro: String(e?.message).slice(0, 100) };
  }
}

async function main() {
  const n = Math.min(Number(process.argv[2] || SUJEITOS.length), SUJEITOS.length);
  const sb = createSupabaseAdmin();
  const alvos = SUJEITOS.slice(0, n);
  console.log(`experimento pareado · ${alvos.length} sujeito(s) × ${BRACOS.length} modelos · SEM persistir\n`);

  const res: Resultado[] = [];
  for (const s of alvos) {
    for (const m of BRACOS) {
      const r = await rodar(sb, s, m);
      res.push(r);
      const marca = r.ok ? `${r.status.padEnd(4)} ${r.achadosSemanticos} achado(s)` : `ERRO: ${r.erro}`;
      console.log(`  ${r.sujeito} · ${m.padEnd(18)} ${marca}`);
    }
  }

  console.log('\n── por modelo ──');
  for (const m of BRACOS) {
    const linhas = res.filter((r) => r.modelo === m && r.ok);
    if (!linhas.length) { console.log(`  ${m}: nenhuma execução válida`); continue; }
    const tot = linhas.reduce((s, r) => s + r.achadosSemanticos, 0);
    const fails = linhas.filter((r) => r.status === 'fail').length;
    console.log(`  ${m.padEnd(18)} n=${linhas.length} · ${tot} achado(s) no total · media ${(tot / linhas.length).toFixed(1)} · ${fails} veredito(s) fail`);
  }

  // O que decide é o PAREADO: em quantos sujeitos o Opus teve MENOS achados.
  console.log('\n── comparação pareada (mesmo sujeito) ──');
  let opusMelhor = 0, sonnetMelhor = 0, empate = 0;
  for (const s of alvos) {
    const a = res.find((r) => r.sujeito === s.slice(0, 8) && r.modelo === 'claude-sonnet-5' && r.ok);
    const b = res.find((r) => r.sujeito === s.slice(0, 8) && r.modelo === 'claude-opus-5' && r.ok);
    if (!a || !b) continue;
    const d = b.achadosSemanticos - a.achadosSemanticos;
    if (d < 0) opusMelhor++; else if (d > 0) sonnetMelhor++; else empate++;
    console.log(`  ${s.slice(0, 8)}: sonnet-5 ${a.achadosSemanticos} × opus-5 ${b.achadosSemanticos}  ${d < 0 ? '← opus melhor' : d > 0 ? '← sonnet melhor' : '(empate)'}`);
  }
  console.log(`\n  opus melhor em ${opusMelhor} · sonnet melhor em ${sonnetMelhor} · empate ${empate}`);

  const pares = opusMelhor + sonnetMelhor;
  console.log('');
  if (pares < 5) {
    console.log(`⚠️ ${pares} par(es) discordantes: n PEQUENO DEMAIS para concluir. Isto é um sinal de direção,`);
    console.log('   não um veredito — a variância do auditor entre execuções não foi medida.');
  } else if (opusMelhor >= pares * 0.8) {
    console.log('✅ direção consistente a favor do Opus 5 — vale ampliar a amostra antes de decidir.');
  } else if (sonnetMelhor >= pares * 0.8) {
    console.log('✅ direção consistente a favor do Sonnet 5 — o upgrade não se justifica por este instrumento.');
  } else {
    console.log('⚠️ sem direção clara: os dois modelos produzem PDIs que o auditor trata de forma parecida.');
  }

  const { data: gasto } = await sb.from('ia_usage_log')
    .select('cost_usd').eq('source', 'experimento');
  const usd = (gasto || []).reduce((s: number, l: any) => s + Number(l.cost_usd || 0), 0);
  console.log(`\ncusto do experimento: US$ ${usd.toFixed(2)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
