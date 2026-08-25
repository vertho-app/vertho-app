/**
 * Piloto do bloco E1: Qwen3.8-Max × Sonnet 4.6 gerando CENÁRIOS (IA3).
 *
 * Por que E1 e não outro bloco: é o único do catálogo com REFUTADOR EMBUTIDO.
 * `ia3_check` (GPT 5.6 Terra) já audita essa saída em produção, então trocar o
 * modelo ali produz uma medição de qualidade de graça — se a taxa de aprovação
 * cair, a resposta aparece sozinha, sem precisar de leitura humana nem de eval
 * novo. Nenhum outro bloco oferece isso.
 *
 * 🔑 NÃO PERSISTE NADA. Espelha `gerarCenarioIA3Core` e para ANTES de
 * `persistirCenarioIA3`; o check roda sobre um `cen` montado em memória. As
 * únicas escritas do processo são as linhas do ledger de IA (que é o ponto).
 *
 * O juiz é o mesmo dos dois lados e é de família diferente de AMBOS (Terra é
 * OpenAI; os candidatos são Anthropic e Alibaba) — a comparação não tem o viés
 * de auto-preferência que contaminou o painel do PDI.
 *
 * Tenant: ACME Demo (`is_demo`, reset 04h). Só LEITURA, e nem cliente pagante
 * entra na conta.
 *
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/_piloto-qwen-e1-cenarios.ts
 */
import { setGlobalDispatcher, Agent } from 'undici';
import { createSupabaseAdmin } from '../lib/supabase';

/**
 * 🔴 ACOMODAÇÃO DE HARNESS — e ela é, por si só, o achado mais duro do piloto.
 *
 * Na 1ª rodada o Qwen falhou em 2 de 4 com `UND_ERR_HEADERS_TIMEOUT`: o teto de
 * HEADERS do undici (300s por padrão), que fica abaixo do `AbortSignal` do
 * wrapper e portanto NÃO obedece ao `timeoutMs`. Ou seja, ele leva mais de cinco
 * minutos até o primeiro header numa geração de 6144 tokens.
 *
 * Subir o teto aqui deixa a MEDIÇÃO DE QUALIDADE terminar. Não é algo que a
 * produção possa copiar: as rotas de admin rodam com `maxDuration` de 300s, e
 * uma geração que passa disso devolve 504 com o trabalho perdido, independente
 * de undici. Para o E1 síncrono, um modelo que estoura 300s está fora do
 * orçamento da plataforma — não "lento", inviável. Só entraria por Trigger.dev
 * ou Batch.
 */
setGlobalDispatcher(new Agent({ headersTimeout: 900_000, bodyTimeout: 900_000 }));
import { callAI } from '../actions/ai-client';
import { extractJSON } from '../actions/utils';
import {
  montarContextoIA3, buildIA3SystemPrompt, buildIA3UserPrompt, validarRespostaIA3,
  montarAlternativasIA3, montarCheckIA3Prompt, normalizarResultadoCheckIA3,
} from '../lib/ia3-cenarios';

const EMPRESA = '455f9366-fb4f-4c58-a79e-f94193464744'; // ACME Demo
const CARGO = 'Representante Comercial';
const COMPETENCIAS = [
  { id: 'bb4ad1fa-851e-4889-bf7c-eb0a200bf9bb', nome: 'Comunicação e Apresentação de Valor' },
  { id: 'f6d45995-0d47-43f1-8758-8a7542ba223c', nome: 'Negociação e Fechamento' },
  { id: 'e735bf5b-b364-403c-87d0-f50aef5ad85d', nome: 'Orientação a Metas e Resultados' },
  { id: '39aad7db-f5a6-487a-85c6-3f84be43e416', nome: 'Relacionamento e Pós-venda' },
];
const CANDIDATOS = [
  { modelo: 'claude-sonnet-4-6', rotulo: 'produção' },
  { modelo: 'qwen3.8-max', rotulo: 'candidato' },
];
const CHECKER = 'gpt-5.6-terra';

interface Linha {
  modelo: string; competencia: string;
  gerou: boolean; errosValidacao: string[];
  nota: number | null; status: string | null;
  msGeracao: number; msCheck: number; outTokensAprox: number;
}

async function gerarSemPersistir(sbRaw: any, modelo: string, compId: string) {
  const t0 = Date.now();
  const mc = await montarContextoIA3(sbRaw, EMPRESA, CARGO, compId, null);
  if (!('ctx' in mc)) throw new Error(mc.error);
  const { empresa, comp, descritores, contextoPPP, valores, cargoDetalhe, gabCIS } = mc.ctx;

  const system = buildIA3SystemPrompt();
  const user = buildIA3UserPrompt(empresa, CARGO, cargoDetalhe, comp, descritores, valores, contextoPPP, gabCIS);

  // Teto 6144 = o mesmo da produção. Qwen é lento (~21 tok/s medido), então o
  // timeout sobe — mas o TETO não, senão eu estaria comparando com o cenário
  // que a produção não gera.
  const resposta = await callAI(system, user, { model: modelo }, 6144, {
    taskKey: 'ia3_cenarios', source: 'piloto', timeoutMs: 600_000,
  });
  const resultado = await extractJSON(resposta);
  if (!resultado) throw new Error('não retornou JSON válido');
  const norm = validarRespostaIA3(resultado, descritores.length);
  if (!norm) throw new Error('não retornou cenário válido');

  // O `cen` que o check receberia — montado, não gravado.
  //
  // 🔴 `descricao`, não `contexto`. A primeira rodada deste piloto (25/08) usou
  // `contexto` e os SEIS cenários — dos dois modelos — saíram com nota 54-60 e
  // status `revisar`, contra um mínimo de 88 na produção do MESMO tenant. Não
  // eram os modelos: `montarCheckIA3Prompt` lê `cen.descricao`, e o auditor
  // estava recebendo o cenário SEM ENUNCIADO. O rename acontece na persistência
  // (`persistirCenarioIA3` faz `descricao: args.contexto`), então quem espelha o
  // core e para antes de persistir herda o nome errado.
  //
  // A lição é do harness, não do IA3: uma medição que deprime os DOIS lados por
  // igual parece empate honesto e não é — parece "nenhum dos dois presta".
  const cen = {
    empresa_id: EMPRESA, competencia_id: comp.id, ppp_escola_id: null,
    cargo: CARGO,
    titulo: norm.cen.titulo || norm.titulo,
    descricao: norm.cen.contexto || norm.contexto,
    alternativas: montarAlternativasIA3(resultado, norm.cen, norm.perguntas),
  };
  return { cen, erros: norm.errors || [], ms: Date.now() - t0, outAprox: Math.round(resposta.length / 4) };
}

async function main() {
  const sbRaw = createSupabaseAdmin();
  const linhas: Linha[] = [];

  for (const comp of COMPETENCIAS) {
    for (const cand of CANDIDATOS) {
      const l: Linha = {
        modelo: cand.modelo, competencia: comp.nome, gerou: false, errosValidacao: [],
        nota: null, status: null, msGeracao: 0, msCheck: 0, outTokensAprox: 0,
      };
      try {
        const g = await gerarSemPersistir(sbRaw, cand.modelo, comp.id);
        l.gerou = true; l.errosValidacao = g.erros; l.msGeracao = g.ms; l.outTokensAprox = g.outAprox;

        const t1 = Date.now();
        const { system, user } = await montarCheckIA3Prompt(sbRaw, g.cen);
        const r = await callAI(system, user, { model: CHECKER }, 4096, {
          taskKey: 'ia3_check', source: 'piloto', timeoutMs: 300_000,
        });
        const normed = normalizarResultadoCheckIA3(await extractJSON(r));
        l.msCheck = Date.now() - t1;
        if (normed) {
          l.status = normed.statusCheck;
          l.nota = Number(normed.resultado?.nota_geral ?? normed.resultado?.nota ?? NaN);
        }
        console.log(`  ${cand.modelo.padEnd(18)} ${comp.nome.slice(0, 30).padEnd(32)} nota ${String(l.nota ?? '?').padStart(4)}  ${String(l.status).padEnd(22)} ${(l.msGeracao / 1000).toFixed(0)}s+${(l.msCheck / 1000).toFixed(0)}s${l.errosValidacao.length ? `  ⚠️ ${l.errosValidacao.length} erro(s) de validação` : ''}`);
      } catch (e: any) {
        console.log(`  ${cand.modelo.padEnd(18)} ${comp.nome.slice(0, 30).padEnd(32)} 🔴 ${String(e?.message || e).slice(0, 70)}`);
      }
      linhas.push(l);
    }
  }

  console.log('\n── apuração ──');
  for (const cand of CANDIDATOS) {
    const l = linhas.filter((x) => x.modelo === cand.modelo);
    const ok = l.filter((x) => x.gerou);
    const notas = ok.map((x) => x.nota).filter((n): n is number => Number.isFinite(n));
    const aprovados = ok.filter((x) => x.status === 'aprovado').length;
    const ressalvas = ok.filter((x) => x.status === 'aprovado_com_ressalvas').length;
    const reprovados = ok.filter((x) => x.status === 'revisar' || x.status === 'reprovado').length;
    const media = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : NaN;
    const erros = ok.reduce((s, x) => s + x.errosValidacao.length, 0);
    console.log(`  ${cand.modelo.padEnd(18)} (${cand.rotulo})`);
    console.log(`     gerou ${ok.length}/${l.length} · nota média ${Number.isFinite(media) ? media.toFixed(2) : '—'} · aprovado ${aprovados} · com ressalvas ${ressalvas} · revisar ${reprovados}`);
    console.log(`     erros de validação estrutural: ${erros} · geração média ${(ok.reduce((s, x) => s + x.msGeracao, 0) / (ok.length || 1) / 1000).toFixed(0)}s`);
  }
  console.log('\n⚠️ n pequeno (4 competências × 2 modelos). Isto decide se VALE um piloto\n'
    + '   maior, não se troca o modelo de produção.');
  process.exit(0);
}

main();
