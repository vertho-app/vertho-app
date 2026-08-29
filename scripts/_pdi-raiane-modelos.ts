/* eslint-disable */
// INTERNO/descartável: gera o PDI da Raiane (Ibipeba) com MÚLTIPLOS modelos para
// comparação de qualidade, replicando fielmente o prompt de gerarRelatorioIndividual
// (actions/relatorios.ts) — mesmo system, mesmo user (dadosComps), mesmo pós-processo
// (overlay nivel/nota/flag) e mesmo PDF (RelatorioIndividual).
//
// Uso:
//   npx tsx scripts/_pdi-raiane-modelos.ts           → gemini-3.5-flash + gpt-5.6-luna (+ kimi se .tmp_pdi/kimi-conteudo.json existir)
//   npx tsx scripts/_pdi-raiane-modelos.ts --kimi    → só renderiza o kimi-conteudo.json
//
// Saída: ~/Downloads/vertho-pdi-raiane-<modelo>.pdf (+ .json do conteúdo)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import RelatorioIndividualPDF from '@/components/pdf/RelatorioIndividual';
import { getLogoCoverBase64 } from '@/lib/pdf-assets';

const ENV = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const pick = (k: string) => ENV.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1]?.trim();

const TMP = path.join(process.cwd(), '.tmp_pdi');
const DOWNLOADS = path.join(os.homedir(), 'Downloads');
const insumos = JSON.parse(fs.readFileSync(path.join(TMP, 'raiane-insumos.json'), 'utf8'));

// ── Réplica de extractJSON (actions/utils.ts) — síncrona ─────────────────────
function extractJSON(text) {
  if (!text || typeof text !== 'string') return null;
  try { return JSON.parse(text.trim()); } catch {}
  const m = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (m) { try { return JSON.parse(m[1].trim()); } catch {} }
  const fb = text.indexOf('{'), lb = text.lastIndexOf('}');
  if (fb !== -1 && lb > fb) { try { return JSON.parse(text.slice(fb, lb + 1)); } catch {} }
  const fk = text.indexOf('['), lk = text.lastIndexOf(']');
  if (fk !== -1 && lk > fk) { try { return JSON.parse(text.slice(fk, lk + 1)); } catch {} }
  return null;
}

// ── System prompt — CÓPIA de RELATORIO_IND_SYSTEM (actions/relatorios.ts:105) ─
const RELATORIO_IND_SYSTEM = `Você é um especialista em desenvolvimento de profissionais da plataforma Vertho.

Sua tarefa é gerar um PDI (Plano de Desenvolvimento Individual) completo, entregue ao COLABORADOR como devolutiva pessoal + plano de ação.

ATENÇÃO:
Este material precisa ser útil para a pessoa que vai recebê-lo.
Ele não pode soar como laudo frio, texto genérico de RH ou motivação vazia.
Ele deve ser humano, claro, honesto e acionável.

OBJETIVO CENTRAL:
Transformar os dados de competências, perfil comportamental e recomendações de conteúdo em uma devolutiva pessoal consistente e em um plano de desenvolvimento prático.

DIRETRIZES DE TOM:
1. Respeitoso, direto, humano e OPERACIONAL — o foco é o PRÓXIMO MOVIMENTO, não motivação.
2. Acolher = contextualizar antes de diagnosticar, de forma PROFISSIONAL (não afetiva nem paternalista).
3. Linguagem acessível, sem jargão excessivo.
4. Firme mas nunca punitivo. Use "tende a...", "há sinais de...", "um risco é...".
5. Menos "você é capaz", mais "este é o próximo movimento". NÃO repetir frases do tipo "você chegou até aqui porque se importa".
6. Ser honesto sem desmotivar; reconhecer contexto antes de apontar gaps.
7. Evitar frases genéricas que serviriam para qualquer pessoa.
8. Português claro, SEM termos em inglês (use 'devolutiva' não 'feedback', 'estudo de caso' não 'case', 'habilidade' não 'skill'). Prefira "comportamento" a "descritor".
9. "estudo_recomendado" NÃO é dever de casa — são os TEMAS que a própria jornada ENTREGA à pessoa, resumidos toda semana (microaprendizagem). Escreva como algo que ela VAI RECEBER, não que precisa buscar.

PRINCÍPIOS INEGOCIÁVEIS:
1. Níveis SEMPRE numéricos (1-4). Nível 3 = META.
2. Nunca mencione scores DISC numéricos. Descreva em linguagem acessível.
3. DISC/CIS deve aparecer como leitura contextual, não como diagnóstico fechado.
4. SEMPRE inclua TODAS as competências do input, inclusive pendentes (flag=true).
5. Competências com nível < 3 devem ter um sprint de 30 dias enxuto e executável (no máximo 4 ações prioritárias).
6. Se CONTEÚDOS RECOMENDADOS forem fornecidos, inclua-os conectados ao gap.
7. Scripts prontos são bem-vindos quando aumentam a aplicabilidade.
8. Metas em primeira pessoa e com horizonte claro.
9. Não invente comportamento, resultado ou contexto que não esteja sustentado.

REGRAS PARA O SPRINT DE 30 DIAS:
- O sprint é ENXUTO e executável: no máximo 4 ações prioritárias (1 principal + 1 de apoio + 1 evidência + 1 ritual). NUNCA 8 ações, nem 4 semanas de tarefas.
- "foco_30_dias": 1 frase com o movimento central dos 30 dias (ex.: transformar sinais de desgaste em decisão).
- "acao_principal" e "acao_apoio": concretas, realistas, que cabem na rotina. Evitar ações vagas ("refletir mais") sem comportamento observável.
- "evidencia_esperada": 1 evidência observável, com marco temporal quando fizer sentido (ex.: antes do próximo conselho, a pessoa usa pelo menos 1 sinal para renegociar prioridade).
- "ritual": 1 ritual de acompanhamento curto (ex.: revisão semanal de 10 minutos).
- "checklist": exatamente 3 itens curtos e verificáveis.
- Se houver conteúdos recomendados, conectá-los ao gap em "estudo_recomendado" — NÃO inflar o sprint.

LINGUAGEM DE SAÚDE E SOBRECARGA (regra rígida):
- NÃO usar linguagem clínica nem diagnóstico de saúde. Ex.: NÃO escrever "Estresse e burnout — identificação e prevenção".
- Tratar como desenvolvimento profissional. Ex.: "Sinais de sobrecarga no trabalho — como reconhecer limites e buscar apoio".
- Foco em reconhecer limites, renegociar prioridades e buscar apoio — nunca diagnóstico ou tratamento.

REGRAS PARA COMPETÊNCIAS NÍVEL 3 OU 4:
- Não criar plano pesado desnecessário
- Foco em manutenção, refinamento, ampliação ou multiplicação
- Reconhecer força sem acomodar

REGRAS PARA COMPETÊNCIAS PENDENTES (flag=true):
- Reconhecer que a leitura está incompleta
- Evitar falsa precisão
- Sugerir observação ou desenvolvimento exploratório
- Sprint placeholder: "foco_30_dias" = "Aguardando avaliação — ações a definir" (demais campos vazios ou breves)

RETORNE APENAS JSON VÁLIDO. Português com acentuação correta.

FORMATO OBRIGATÓRIO:
{
  "acolhimento": "2-3 frases de abertura reconhecendo a jornada",
  "resumo_geral": {
    "leitura": "3-5 linhas de visão geral com tom empático",
    "principais_forcas": ["força 1", "força 2"],
    "principal_ponto_de_atencao": "texto curto"
  },
  "perfil_comportamental": {
    "descricao": "Fale DIRETO com a pessoa, em 2ª pessoa e tom de conversa — ex.: 'Elizângela, seu perfil combina...'. NUNCA em 3ª pessoa ('O perfil de Elizângela...'). Como o seu perfil influencia o seu desempenho (2-3 parágrafos). SEM scores numéricos.",
    "pontos_forca": ["2-3 forças do perfil"],
    "pontos_atencao": ["2-3 áreas de atenção do perfil"]
  },
  "resumo_desempenho": [
    {"competencia": "nome", "nivel": 0, "nota_decimal": 0.0, "leitura": "síntese curta"}
  ],
  "competencias": [
    {
      "nome": "nome EXATO da competência",
      "nivel": 0,
      "nota_decimal": 0.0,
      "flag": false,
      "descritores_desenvolvimento": ["comportamentos que precisam de atenção (linguagem de comportamento, não jargão)"],
      "fez_bem": ["2-3 comportamentos positivos observados"],
      "melhorar": ["2-3 pontos concretos para melhorar"],
      "feedback": "Parágrafo com análise construtiva",
      "sprint": {
        "foco_30_dias": "1 frase — o movimento central dos 30 dias",
        "acao_principal": "1 ação concreta e realista",
        "acao_apoio": "1 ação de apoio",
        "evidencia_esperada": "1 evidência observável",
        "ritual": "1 ritual de acompanhamento curto (ex.: revisão semanal de 10 minutos)",
        "checklist": ["item curto 1", "item curto 2", "item curto 3"]
      },
      "dicas_desenvolvimento": ["Quando [gatilho], [ação]. Ex: Quando sentir resistência, diga: Me ajuda a entender..."],
      "estudo_recomendado": [
        {
          "titulo": "TEMA do conteúdo, em português claro, SEM termos em inglês (evite 'feedback', 'case', 'skill'... use 'devolutiva', 'estudo de caso', 'habilidade')",
          "formato": "vídeo|texto|áudio|estudo de caso",
          "por_que_ajuda": "conexão com o comportamento a desenvolver",
          "url": "URL ou referência"
        }
      ]
    }
  ],
  "mensagem_final": "2-3 linhas de fechamento. Reforçar que é treinável e que pequenas mudanças geram grande impacto.",
  "alertas_metodologicos": ["alerta 1 se houver"]
}`;

// withLanguageInstruction (pt-BR default) — actions/ai-client.ts:82
const SYSTEM = `${RELATORIO_IND_SYSTEM}

═══ IDIOMA DA EXPERIÊNCIA ═══
Use português do Brasil em todo texto destinado ao usuário final.
Mantenha nomes de campos JSON, enums técnicos, códigos e identificadores exatamente como especificados no prompt.
Se o prompt exigir JSON, retorne JSON válido e traduza apenas os valores textuais voltados ao usuário.`;

// ── dadosComps — réplica de relatorios.ts:382-409 (sem blueprint, sem trilha) ─
const normKey = (s) => (s || '').toString().trim().toLowerCase();
const FOCO = ['Colaboração docente e cultura formativa', 'Autocuidado e resiliência emocional']; // competencias_foco do cargo
const respPorNome = Object.fromEntries(insumos.map((r) => [normKey(r.competencia_nome), r]));

const dadosComps = FOCO.map((nomeComp) => {
  const r = respPorNome[normKey(nomeComp)];
  const av = r ? (typeof r.avaliacao_ia === 'string' ? JSON.parse(r.avaliacao_ia) : r.avaliacao_ia) : null;
  return {
    competencia: nomeComp,
    nivel: av?.consolidacao?.nivel_geral || r?.nivel_ia4 || 'pendente',
    nota_decimal: av?.consolidacao?.media_descritores || Number(r?.nota_ia4) || 'pendente',
    pontos_fortes: av?.descritores_destaque?.pontos_fortes || [],
    gaps: av?.descritores_destaque?.gaps_prioritarios || [],
    feedback: av?.feedback || r?.feedback_ia4 || '',
  };
});

// perfilCIS — relatorios.ts:341-344 (d_natural != null)
const perfilCIS = `DISC: D=47 | I=68 | S=66 | C=19
Dominante: IS
Lideranca: Executor=23.5% | Motivador=34% | Metodico=33% | Sistematico=10%`;

// user — relatorios.ts:440-442 (pendentes=0, trilhaTexto='', blueprintBlock='')
const user = `COLABORADOR: Raiane Andrade Barbosa
CARGO: Coordenação Pedagógica
EMPRESA: Secretaria Municipal de Ibipeba/BA (educacao)

PERFIL COMPORTAMENTAL:
${perfilCIS}

=== ATENCAO ===
O array DADOS POR COMPETENCIA contem 2 competencia(s) do TOP 5 do cargo.  O array 'competencias' do output DEVE ter EXATAMENTE 2 itens, na MESMA ordem.

DADOS POR COMPETENCIA:
${JSON.stringify(dadosComps, null, 2)}`;

// ── Pós-processo — relatorios.ts:449-462 (overlay dos dados reais) ──────────
function posProcesso(relatorio) {
  const dadosByName = Object.fromEntries(dadosComps.map((d) => [normKey(d.competencia), d]));
  const overlay = (c, key = 'nome') => {
    const src = dadosByName[normKey(c[key] || c.competencia || c.nome)];
    if (!src) return c;
    return {
      ...c,
      nivel: src.nivel === 'pendente' ? null : src.nivel,
      nota_decimal: src.nota_decimal === 'pendente' ? null : src.nota_decimal,
      flag: src.nivel === 'pendente' || (typeof src.nivel === 'number' && src.nivel < 3),
    };
  };
  if (Array.isArray(relatorio.competencias)) relatorio.competencias = relatorio.competencias.map((c) => overlay(c, 'nome'));
  if (Array.isArray(relatorio.resumo_desempenho)) relatorio.resumo_desempenho = relatorio.resumo_desempenho.map((c) => overlay(c, 'competencia'));
  return relatorio;
}

// ── Chamadas de API (mesmos endpoints do ai-client.ts) ───────────────────────
async function callGemini(model) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${pick('GEMINI_API_KEY')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: 64000 },
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
}

async function callOpenAI(model) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pick('OPENAI_API_KEY')}` },
    body: JSON.stringify({
      model,
      max_completion_tokens: 64000,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── PDF + persistência ───────────────────────────────────────────────────────
async function renderESalva(conteudo, slug) {
  const jsonOut = path.join(DOWNLOADS, `vertho-pdi-raiane-${slug}.json`);
  fs.writeFileSync(jsonOut, JSON.stringify(conteudo, null, 2));
  const buf = Buffer.from(await renderToBuffer(
    // @ts-ignore
    React.createElement(RelatorioIndividualPDF, {
      data: {
        conteudo,
        colaborador_nome: 'Raiane Andrade Barbosa',
        colaborador_cargo: 'Coordenação Pedagógica',
        gerado_em: new Date().toISOString(),
      },
      empresaNome: 'Secretaria Municipal de Ibipeba/BA',
      logoBase64: getLogoCoverBase64() || undefined,
    }),
  ));
  const pdfOut = path.join(DOWNLOADS, `vertho-pdi-raiane-${slug}.pdf`);
  fs.writeFileSync(pdfOut, buf);
  console.log(`OK ${slug} → ${pdfOut} (${(buf.length / 1024 | 0)}KB)`);
}

async function geraCom(provider, model, slug) {
  console.log(`⏳ ${slug} (${model})...`);
  const raw = provider === 'gemini' ? await callGemini(model) : await callOpenAI(model);
  const relatorio = extractJSON(raw);
  if (!relatorio) {
    fs.writeFileSync(path.join(TMP, `${slug}-raw.txt`), raw);
    throw new Error(`${slug}: resposta não é JSON válido (raw salvo em .tmp_pdi/${slug}-raw.txt)`);
  }
  await renderESalva(posProcesso(relatorio), slug);
}

async function renderKimi() {
  const f = path.join(TMP, 'kimi-conteudo.json');
  if (!fs.existsSync(f)) { console.log('— kimi: .tmp_pdi/kimi-conteudo.json ausente, pulando'); return; }
  await renderESalva(posProcesso(JSON.parse(fs.readFileSync(f, 'utf8'))), 'kimi-k3');
}

(async () => {
  if (process.argv.includes('--kimi')) { await renderKimi(); return; }
  await geraCom('gemini', 'gemini-3.5-flash', 'gemini-3.5-flash');
  await geraCom('openai', 'gpt-5.6-luna', 'gpt-5.6-luna');
  await renderKimi();
})().catch((e) => { console.error(e); process.exit(1); });
