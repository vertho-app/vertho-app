const SAEB_API_BASE = 'https://saeb.inep.gov.br/saeb/rest/resultado-final';

const DISCIPLINA_BY_CODE = {
  1: 'LP',
  2: 'MAT',
};

function stripAccents(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeEtapa(series) {
  const id = Number(series?.idSerie);
  const text = stripAccents(series?.dsSerie).toLowerCase();
  if (id === 5 || text.includes('5')) return '5_EF';
  if (id === 9 || text.includes('9')) return '9_EF';
  if (id === 12 || id === 3 || text.includes('medio') || text.includes('3')) return '3_EM';
  return series?.idSerie ? String(series.idSerie) : String(series?.dsSerie || '').trim();
}

function normalizeDisciplina(disciplina) {
  const code = Number(disciplina?.coDisciplina);
  if (DISCIPLINA_BY_CODE[code]) return DISCIPLINA_BY_CODE[code];
  const text = stripAccents(disciplina?.noDisciplina).toLowerCase();
  if (text.includes('matematica')) return 'MAT';
  if (text.includes('lingua portuguesa') || text.includes('portugues')) return 'LP';
  return String(disciplina?.noDisciplina || disciplina?.coDisciplina || '').trim().toUpperCase();
}

function romanToInt(roman) {
  const map = { I: 1, V: 5, X: 10 };
  let total = 0;
  let prev = 0;
  for (const ch of String(roman || '').toUpperCase().split('').reverse()) {
    const cur = map[ch] || 0;
    total += cur < prev ? -cur : cur;
    prev = Math.max(prev, cur);
  }
  return total || null;
}

function parseInseGrupo(label) {
  const text = String(label || '');
  const roman = text.match(/\b([IVX]+)\b/i)?.[1];
  if (roman) return romanToInt(roman);
  const numeric = text.match(/\b(\d+)\b/)?.[1];
  return numeric ? Number(numeric) : null;
}

function normalizeRede(value) {
  const text = stripAccents(value).trim().toUpperCase();
  if (!text) return null;
  if (text.includes('MUNICIPAL')) return 'MUNICIPAL';
  if (text.includes('ESTADUAL')) return 'ESTADUAL';
  if (text.includes('FEDERAL')) return 'FEDERAL';
  if (text.includes('PRIVADA')) return 'PRIVADA';
  return text;
}

function distToObject(items) {
  const out = {};
  for (const item of items || []) {
    const nivel = item?.nivel ?? String(item?.name || '').match(/\d+/)?.[0];
    const value = item?.distribuicao ?? item?.value;
    const num = Number(value);
    if (nivel != null && Number.isFinite(num)) out[String(nivel)] = num;
  }
  return out;
}

function mediaValue(items, name) {
  const found = (items || []).find((item) => stripAccents(item?.name).toLowerCase() === stripAccents(name).toLowerCase());
  const value = Number(found?.value);
  return Number.isFinite(value) ? value : null;
}

function buildParticipacaoMap(items) {
  const map = new Map();
  for (const item of items || []) {
    const etapa = normalizeEtapa(item);
    map.set(etapa, item);
  }
  return map;
}

function buildFormacaoMap(indicadores) {
  return new Map([
    ['5_EF', indicadores?.anosIniciaisEnsinoFundamental ?? null],
    ['9_EF', indicadores?.anosFinaisEnsinoFundamental ?? null],
    ['3_EM', indicadores?.ensinoMedio ?? null],
  ]);
}

export function endpointSaebResultadoFinal(codigoInep, anoProjeto) {
  return `${SAEB_API_BASE}/escolas/${encodeURIComponent(codigoInep)}/anos-projeto/${encodeURIComponent(anoProjeto)}`;
}

export async function fetchSaebResultadoFinal(codigoInep, anoProjeto, opts = {}) {
  const url = endpointSaebResultadoFinal(codigoInep, anoProjeto);
  const res = await fetch(url, {
    signal: opts.signal,
    headers: {
      accept: 'application/json,text/plain,*/*',
      'user-agent': opts.userAgent || 'VerthoRadarImporter/1.0 (+https://radar.vertho.ai)',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`INEP ${res.status} ${res.statusText}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Resposta INEP não é JSON: ${text.slice(0, 300)}`);
  }
}

export function normalizeSaebResultadoFinal(apiResponse, { codigoInep, anoProjeto, ingestRunId = null } = {}) {
  const dados = apiResponse?.dados;
  if (!dados?.escola) {
    return { escola: null, snapshots: [], warning: apiResponse?.mensagem || 'Resposta sem dados.escola' };
  }

  const escolaApi = dados.escola;
  const indicadores = dados.indicadoresContextuais || {};
  const participacaoByEtapa = buildParticipacaoMap(dados.participacaoAvaliacao);
  const formacaoByEtapa = buildFormacaoMap(indicadores);
  const ano = Number(escolaApi.ano || anoProjeto);
  const codigo = String(escolaApi.coEntidade || codigoInep || '').padStart(8, '0');
  const etapas = new Set();

  const snapshots = [];
  for (const disciplina of dados.disciplinas || []) {
    const disciplinaNorm = normalizeDisciplina(disciplina);
    for (const serie of disciplina.series || []) {
      const etapa = normalizeEtapa(serie);
      if (etapa) etapas.add(etapa);
      const part = participacaoByEtapa.get(etapa) || {};
      const formacao = Number(formacaoByEtapa.get(etapa));

      snapshots.push({
        codigo_inep: codigo,
        ano,
        etapa,
        disciplina: disciplinaNorm,
        distribuicao: distToObject(serie.niveisSuaEscola || serie.graficoNiveisSuaEscola),
        similares: distToObject(serie.niveisEscolaSimilares),
        total_municipio: distToObject(serie.niveisTotalMunicipio),
        total_estado: distToObject(serie.niveisTotalEstado),
        total_brasil: distToObject(serie.niveisTotalBrasil),
        presentes: Number.isFinite(Number(part.qtdEstudantesPresentes)) ? Number(part.qtdEstudantesPresentes) : null,
        matriculados: Number.isFinite(Number(part.qtdAlunosMatriculados)) ? Number(part.qtdAlunosMatriculados) : null,
        taxa_participacao: Number.isFinite(Number(part.taxaParticipacao)) ? Number(part.taxaParticipacao) : null,
        formacao_docente: Number.isFinite(formacao) ? formacao : null,
        media_proficiencia: mediaValue(serie.mediaProficiencia, 'Sua Escola'),
        media_similares: mediaValue(serie.mediaProficiencia, 'Escolas Similares'),
        historico_proficiencia: serie.desempenhoEscolaEdicaoesSaeb || [],
        raw_api: {
          escola: escolaApi,
          indicadoresContextuais: indicadores,
          participacaoAvaliacao: part,
          disciplina,
          serie,
        },
        ingest_run_id: ingestRunId,
        atualizado_em: new Date().toISOString(),
      });
    }
  }

  const escola = {
    codigo_inep: codigo,
    nome: String(escolaApi.noEscola || '').trim() || codigo,
    rede: normalizeRede(escolaApi.dsTipoRede),
    municipio: String(escolaApi.noMunicipio || '').trim() || null,
    uf: String(escolaApi.sgUf || escolaApi.siglaUf || '').trim().toUpperCase() || null,
    inse_grupo: parseInseGrupo(indicadores.noNivelSocioeconomico),
    etapas: Array.from(etapas),
    ano_referencia: ano,
    atualizado_em: new Date().toISOString(),
  };

  return { escola, snapshots, warning: null };
}

export async function fetchAndNormalizeSaeb(codigoInep, anoProjeto, opts = {}) {
  const api = await fetchSaebResultadoFinal(codigoInep, anoProjeto, opts);
  return normalizeSaebResultadoFinal(api, { codigoInep, anoProjeto, ingestRunId: opts.ingestRunId });
}
