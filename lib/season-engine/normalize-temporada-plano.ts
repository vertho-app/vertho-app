import {
  parseMissaoResponse,
  missaoToMarkdown,
  type MissaoStructured,
} from './prompts/missao';
import {
  parseCenarioResponse,
  cenarioToMarkdown,
  type CenarioStructured,
} from './prompts/scenario';

function stripCodeFence(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
}

function parseLooseJSON(raw: unknown): any | null {
  if (typeof raw !== 'string') return null;

  let current = stripCodeFence(raw);
  for (let i = 0; i < 2; i++) {
    try {
      const parsed = JSON.parse(current);
      if (typeof parsed === 'string') {
        current = stripCodeFence(parsed);
        continue;
      }
      return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unescapeJsonLike(value: string): string {
  return value
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\')
    .trim();
}

function extractLooseStringField(text: string, key: string, knownKeys: string[]): string {
  const nextKeys = knownKeys.filter((item) => item !== key).map(escapeRegex).join('|');
  const pattern = new RegExp(
    `"${escapeRegex(key)}"\\s*:\\s*"([\\s\\S]*?)(?:"\\s*(?=,\\s*"(?:${nextKeys})"|\\s*}\\s*$)|$)`,
    'i',
  );
  const match = text.match(pattern);
  return match?.[1] ? unescapeJsonLike(match[1]) : '';
}

function extractLooseArrayField(text: string, key: string, knownKeys: string[]): string[] {
  const nextKeys = knownKeys.filter((item) => item !== key).map(escapeRegex).join('|');
  const pattern = new RegExp(
    `"${escapeRegex(key)}"\\s*:\\s*\\[([\\s\\S]*?)(?:\\]\\s*(?=,\\s*"(?:${nextKeys})"|\\s*}\\s*$)|$)`,
    'i',
  );
  const block = text.match(pattern)?.[1] || '';
  const items: string[] = [];
  const itemRegex = /"([\s\S]*?)(?:"\s*(?=,|$)|$)/g;
  let match: RegExpExecArray | null = null;
  while ((match = itemRegex.exec(block))) {
    const value = unescapeJsonLike(match[1]);
    if (value) items.push(value);
  }
  return items;
}

function salvageCenarioStructured(raw: string): CenarioStructured | null {
  const text = stripCodeFence(raw);
  if (!text.includes('"contexto"') && !text.includes('"tensao_central"')) return null;

  const knownKeys = [
    'contexto',
    'tensao_central',
    'fator_complicador',
    'stakeholders',
    'tradeoff_testado',
    'armadilha_resposta_generica',
    'pergunta',
    'complexidade_aplicada',
    'complexidade',
    'por_que_essa_complexidade_faz_sentido',
  ];

  const contexto = extractLooseStringField(text, 'contexto', knownKeys);
  const tensao = extractLooseStringField(text, 'tensao_central', knownKeys);
  const fator = extractLooseStringField(text, 'fator_complicador', knownKeys);
  const stakeholders = extractLooseArrayField(text, 'stakeholders', knownKeys).slice(0, 2);
  const tradeoff = extractLooseStringField(text, 'tradeoff_testado', knownKeys);
  const armadilha = extractLooseStringField(text, 'armadilha_resposta_generica', knownKeys);
  const pergunta = extractLooseStringField(text, 'pergunta', knownKeys);
  const complexidade = extractLooseStringField(text, 'complexidade_aplicada', knownKeys) || extractLooseStringField(text, 'complexidade', knownKeys);
  const porque = extractLooseStringField(text, 'por_que_essa_complexidade_faz_sentido', knownKeys);

  if (!contexto && !tensao && !fator && !tradeoff && !armadilha && !pergunta) return null;

  return {
    contexto,
    tensao_central: tensao,
    fator_complicador: fator,
    stakeholders,
    tradeoff_testado: tradeoff,
    armadilha_resposta_generica: armadilha,
    pergunta,
    complexidade_aplicada: complexidade,
    por_que_essa_complexidade_faz_sentido: porque,
  };
}

function toMissaoStructured(raw: any): MissaoStructured | null {
  if (!raw) return null;

  if (typeof raw === 'string') {
    return parseMissaoResponse(raw) || toMissaoStructured(parseLooseJSON(raw));
  }

  if (typeof raw === 'object') {
    if (typeof raw.texto === 'string') {
      return parseMissaoResponse(raw.texto) || toMissaoStructured(parseLooseJSON(raw.texto));
    }

    if (
      typeof raw.missao_texto === 'string' &&
      typeof raw.acao_principal === 'string' &&
      typeof raw.contexto_de_aplicacao === 'string' &&
      typeof raw.criterio_de_execucao === 'string' &&
      typeof raw.por_que_cabe_na_semana === 'string' &&
      Array.isArray(raw.integracao_descritores)
    ) {
      return {
        missao_texto: raw.missao_texto.trim(),
        acao_principal: raw.acao_principal.trim(),
        contexto_de_aplicacao: raw.contexto_de_aplicacao.trim(),
        criterio_de_execucao: raw.criterio_de_execucao.trim(),
        integracao_descritores: raw.integracao_descritores
          .map((item: any) => ({
            descritor: String(item?.descritor || '').trim(),
            como_aparece: String(item?.como_aparece || '').trim(),
          }))
          .filter((item: any) => item.descritor && item.como_aparece),
        por_que_cabe_na_semana: raw.por_que_cabe_na_semana.trim(),
      };
    }
  }

  return null;
}

function toCenarioStructured(raw: any): CenarioStructured | null {
  if (!raw) return null;

  if (typeof raw === 'string') {
    return parseCenarioResponse(raw) || salvageCenarioStructured(raw) || toCenarioStructured(parseLooseJSON(raw));
  }

  if (typeof raw === 'object') {
    if (typeof raw.texto === 'string') {
      return parseCenarioResponse(raw.texto) || salvageCenarioStructured(raw.texto) || toCenarioStructured(parseLooseJSON(raw.texto));
    }

    if (
      typeof raw.contexto === 'string' &&
      typeof raw.tensao_central === 'string' &&
      typeof raw.fator_complicador === 'string' &&
      typeof raw.tradeoff_testado === 'string' &&
      typeof raw.armadilha_resposta_generica === 'string' &&
      typeof raw.pergunta === 'string' &&
      Array.isArray(raw.stakeholders)
    ) {
      return {
        contexto: raw.contexto.trim(),
        tensao_central: raw.tensao_central.trim(),
        fator_complicador: raw.fator_complicador.trim(),
        stakeholders: raw.stakeholders.map((item: any) => String(item || '').trim()).filter(Boolean).slice(0, 2),
        tradeoff_testado: raw.tradeoff_testado.trim(),
        armadilha_resposta_generica: raw.armadilha_resposta_generica.trim(),
        pergunta: raw.pergunta.trim(),
        complexidade_aplicada: String(raw.complexidade_aplicada || raw.complexidade || '').trim(),
        por_que_essa_complexidade_faz_sentido: String(raw.por_que_essa_complexidade_faz_sentido || '').trim(),
      };
    }
  }

  return null;
}

function normalizeMissao(missao: any) {
  const parsed = toMissaoStructured(missao);
  if (!parsed) return missao;

  return {
    ...(missao && typeof missao === 'object' ? missao : {}),
    texto: missaoToMarkdown(parsed),
    acao_principal: missao?.acao_principal || parsed.acao_principal,
    contexto_de_aplicacao: missao?.contexto_de_aplicacao || parsed.contexto_de_aplicacao,
    criterio_de_execucao: missao?.criterio_de_execucao || parsed.criterio_de_execucao,
    integracao_descritores: missao?.integracao_descritores || parsed.integracao_descritores,
  };
}

function normalizeCenario(cenario: any) {
  const parsed = toCenarioStructured(cenario);
  if (!parsed) return cenario;

  return {
    ...(cenario && typeof cenario === 'object' ? cenario : {}),
    texto: cenarioToMarkdown(parsed),
    complexidade: cenario?.complexidade || parsed.complexidade_aplicada || 'intermediario',
    contexto: cenario?.contexto || parsed.contexto,
    fator_complicador: cenario?.fator_complicador || parsed.fator_complicador,
    stakeholders: cenario?.stakeholders || parsed.stakeholders,
    tensao_central: cenario?.tensao_central || parsed.tensao_central,
    tradeoff_testado: cenario?.tradeoff_testado || parsed.tradeoff_testado,
    armadilha_resposta_generica: cenario?.armadilha_resposta_generica || parsed.armadilha_resposta_generica,
    pergunta: cenario?.pergunta || parsed.pergunta,
  };
}

export function normalizeTemporadaPlano(plano: any): any[] {
  if (!Array.isArray(plano)) return [];

  return plano.map((semana) => {
    if (!semana || semana.tipo !== 'aplicacao') return semana;
    return {
      ...semana,
      missao: normalizeMissao(semana.missao),
      cenario: normalizeCenario(semana.cenario),
    };
  });
}
