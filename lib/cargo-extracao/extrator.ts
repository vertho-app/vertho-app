/**
 * EXTRATOR de descrição de cargo (Fase 0) — documento → ExtracaoCargo via Gemini.
 *
 * Usa structured output nativo (responseSchema) → JSON SEMPRE válido, escapando aspas/
 * quebras do documento (a mesma lição de lib/gemini-video.ts: instrução "responda JSON"
 * quebra intermitente; schema não). Aceita PDF base64 (o Gemini lê PDF nativo via
 * inline_data) OU texto já extraído (docx/txt/colado). Retry 3× (parse/5xx transitório).
 *
 * Puro-ish: sem Supabase, sem Next. Lê process.env.GEMINI_API_KEY. Consumido pela action.
 */
import { EXTRATOR_SYSTEM, EXTRATOR_SCHEMA, EXTRATOR_USER } from './prompts';
import type { ExtracaoCargo, ItemEvid } from './adapter';
import { buildGeminiGenerationConfig } from '@/lib/gemini-generation-config';

// 3.8 validado em 10/09/2026 com PDF inline + structured output usando a chave
// da aplicação. O 3.7 permanece como fallback de rollout. A env é o kill switch.
const CARGO_MODEL = process.env.GEMINI_CARGO_MODEL || 'gemini-3.8-flash';
const CARGO_FALLBACK_MODEL = 'gemini-3.7-flash';
const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20MB inline (acima → Files API, fora de escopo)

export interface ExtratorInput {
  pdfBase64?: string;  // documento PDF em base64 (sem o prefixo data:)
  texto?: string;      // OU texto já extraído (docx/txt/colado)
  nomeArquivo?: string;
}

const vazioItem: ItemEvid = { texto: '', confianca: 'baixa', fonte: '' };

/** Normaliza o retorno do modelo p/ o contrato ExtracaoCargo (defensivo, mesmo com schema). */
function normalizar(raw: any): ExtracaoCargo {
  const item = (v: any): ItemEvid | undefined => (v && typeof v.texto === 'string' ? { texto: v.texto, confianca: v.confianca || 'baixa', fonte: v.fonte || '' } : undefined);
  const arr = (v: any): ItemEvid[] => Array.isArray(v) ? v.map(item).filter((x): x is ItemEvid => !!x && !!x.texto.trim()) : [];
  const strArr = (v: any): string[] => Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : [];
  return {
    documento_valido: raw?.documento_valido !== false,
    cargo_titulo: item(raw?.cargo_titulo),
    area_depto: item(raw?.area_depto),
    descricao: item(raw?.descricao),
    contexto_cultural: item(raw?.contexto_cultural),
    principais_entregas: arr(raw?.principais_entregas),
    stakeholders: arr(raw?.stakeholders),
    decisoes_recorrentes: arr(raw?.decisoes_recorrentes),
    tensoes_comuns: arr(raw?.tensoes_comuns),
    campos_faltantes: strArr(raw?.campos_faltantes),
    elicitar_na_revisao: strArr(raw?.elicitar_na_revisao),
    trechos_ambiguos: strArr(raw?.trechos_ambiguos),
  };
}

export async function extrairCargo(input: ExtratorInput): Promise<ExtracaoCargo> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada.');
  if (!input.pdfBase64 && !input.texto?.trim()) throw new Error('Forneça pdfBase64 ou texto do documento.');
  if (input.pdfBase64 && Buffer.byteLength(input.pdfBase64, 'base64') > MAX_PDF_BYTES) {
    throw new Error('PDF acima de 20MB — extraia o texto e use o campo `texto`.');
  }

  const userParts: any[] = [];
  if (input.pdfBase64) userParts.push({ inline_data: { mime_type: 'application/pdf', data: input.pdfBase64 } });
  if (input.texto?.trim()) userParts.push({ text: `DOCUMENTO:\n${input.texto.trim()}` });
  userParts.push({ text: EXTRATOR_USER });

  let ultimoMotivo = 'sem resposta';
  const modelos = [
    CARGO_MODEL,
    ...(CARGO_MODEL.startsWith('gemini-3.8') ? [CARGO_FALLBACK_MODEL] : []),
  ].filter((model, index, all) => all.indexOf(model) === index);

  for (const model of modelos) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const body = {
      systemInstruction: { parts: [{ text: EXTRATOR_SYSTEM }] },
      contents: [{ role: 'user', parts: userParts }],
      generationConfig: buildGeminiGenerationConfig({
        model,
        maxOutputTokens: 16384,
        thinkingLevel: 'low',
        responseMimeType: 'application/json',
        responseSchema: EXTRATOR_SCHEMA,
        legacyTemperature: 0.2,
      }),
    };

    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      let res: Response;
      try {
        res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
      } catch (e: any) { ultimoMotivo = `${model} rede: ${e?.message}`; continue; }
      if (!res.ok) {
        const detalhe = (await res.text()).slice(0, 300);
        ultimoMotivo = `${model} ${res.status}: ${detalhe}`;
        if (res.status >= 400 && res.status < 500) break; // contrato/acesso: tenta o fallback
        continue;
      }
      const data: any = await res.json();
      const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!txt) { ultimoMotivo = `${model}: resposta vazia (possível filtro/finishReason)`; continue; }
      try { return normalizar(JSON.parse(txt)); } catch { ultimoMotivo = `${model}: JSON inválido`; }
    }
  }
  throw new Error(`Extração de cargo falhou no modelo primário e no fallback — ${ultimoMotivo}.`);
}
