'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from './ai-client';
import { extractJSON } from './utils';

// ── Extrair contexto organizacional (PPP educacional / Dossiê corporativo) ──

export async function extrairPPP(empresaId, { urls = [], textos = [], model, enriquecerWeb = false } = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento')
      .eq('id', empresaId).single();

    if (!empresa) return { success: false, error: 'Empresa não encontrada' };

    // Step 1: Scrape URLs fornecidas
    const conteudosExtraidos = [];

    for (const url of urls) {
      let extraido = await scrapeJina(url);
      if (!extraido.ok && process.env.FIRECRAWL_API_KEY) {
        extraido = await scrapeFirecrawl(url);
      }
      conteudosExtraidos.push({
        fonte: url,
        texto: extraido.texto.slice(0, 15000),
        erro: !extraido.ok,
        via: extraido.via,
      });
    }

    for (const texto of textos) {
      conteudosExtraidos.push({ fonte: 'texto_manual', texto: texto.slice(0, 15000) });
    }

    if (!conteudosExtraidos.length) {
      return { success: false, error: 'Nenhum conteúdo extraído das URLs ou textos fornecidos' };
    }

    const urlsOk = conteudosExtraidos.filter(c => !c.erro && c.fonte !== 'texto_manual');
    const urlsFail = conteudosExtraidos.filter(c => c.erro);

    // Step 2: Extração via IA (Etapa 1 — material fornecido)
    const isCorporativo = (empresa.segmento || '').toLowerCase().includes('corporativ') ||
      (empresa.segmento || '').toLowerCase().includes('empresa');

    const todosTextos = conteudosExtraidos.map(c => `[Fonte: ${c.fonte}]\n${c.texto}`).join('\n\n---\n\n');
    const aiModel = model || 'claude-sonnet-4-6';

    const { system, user } = isCorporativo
      ? buildPromptCorporativo(empresa, todosTextos)
      : buildPromptEducacional(empresa, todosTextos);

    const resultado = await callAI(system, user, { model: aiModel }, 16000);
    let dados = await extractJSON(resultado);

    if (!dados) {
      return { success: false, error: 'Não foi possível extrair dados do documento' };
    }

    // Step 3: Enriquecimento web (Etapa 2 — apenas corporativo e se habilitado)
    let webLog = '';
    if (isCorporativo && enriquecerWeb) {
      const enrichResult = await enriquecerViaWeb(empresa, dados, aiModel);
      if (enrichResult.enriched) {
        dados = enrichResult.dados;
        webLog = ` | Web: ${enrichResult.fontes.length} fontes`;
      }
    }

    // Normalizar
    if (!dados.competencias_priorizadas) dados.competencias_priorizadas = [];
    dados.competencias = dados.competencias_priorizadas;

    // Step 4: Salvar
    const { error } = await sb.from('ppp_escolas')
      .upsert({
        empresa_id: empresaId,
        escola: empresa.nome,
        fonte: urls.length ? 'site' : 'json',
        url_site: urls[0] || null,
        status: 'extraido',
        extracao: JSON.stringify(dados),
        valores: dados.valores_institucionais || dados.identidade_cultura?.valores || [],
        extracted_at: new Date().toISOString(),
      }, { onConflict: 'empresa_id,escola' });

    if (error) return { success: false, error: error.message };

    const pppTexto = conteudosExtraidos.filter(c => !c.erro).map(c => c.texto).join('\n\n');
    await sb.from('empresas')
      .update({ ppp_texto: pppTexto.slice(0, 50000) })
      .eq('id', empresaId)
      .then(() => {}).catch(() => {});

    const compCount = (dados.competencias || []).length;
    return {
      success: true,
      message: `${compCount} competências extraídas (${urlsOk.length} URLs ok${urlsFail.length ? `, ${urlsFail.length} falharam` : ''})${webLog}`,
      data: dados,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATES DE EXTRAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

function buildPromptEducacional(empresa, todosTextos) {
  const system = `Voce e um especialista em analise de documentos educacionais e institucionais brasileiros.
Sua tarefa e extrair de um PPP ou documento institucional as informacoes necessarias para contextualizar cenarios de avaliacao de competencias.

IMPORTANTE: Extraia APENAS o que esta explicito ou claramente implicito no documento.
Nao invente, nao complemente com conhecimento geral.
Se uma secao nao existir no documento, escreva "Nao declarado no documento".

REGRA DE CONCISAO: Seja direto e objetivo em cada secao.
- Secoes descritivas: maximo 5 frases curtas cada.
- Listas: maximo 8 itens.
Priorize COMPLETAR TODAS AS 10 SECOES ao inves de detalhar demais cada uma.
E OBRIGATORIO entregar da secao 1 ate a secao 10 completas.

Responda APENAS com JSON valido.`;

  const user = `Instituicao: ${empresa.nome} (${empresa.segmento})

Documento:
${todosTextos.slice(0, 60000)}

---
Extraia no formato JSON abaixo. Todas as 10 secoes sao OBRIGATORIAS:

{
  "perfil_instituicao": {
    "nome": "nome completo",
    "tipo": "escola municipal / empresa corporativa / etc",
    "segmento": "${empresa.segmento}",
    "porte": "n aprox de colaboradores/alunos",
    "localizacao": "cidade, UF"
  },
  "comunidade_contexto": "3-5 frases sobre o perfil da comunidade/mercado atendido",
  "identidade": {
    "missao": "transcrever ou sintetizar",
    "visao": "transcrever ou sintetizar",
    "principios": ["principio 1", "principio 2"],
    "concepcao": "como a instituicao entende seu papel (2-3 frases)"
  },
  "praticas_descritas": [
    {"nome": "pratica/projeto/programa", "descricao": "1 frase", "frequencia": "permanente/anual/etc"}
  ],
  "inclusao_diversidade": "3-5 frases sobre como trata diversidade e inclusao",
  "gestao_participacao": "3-5 frases sobre modelo de gestao e participacao",
  "infraestrutura_recursos": {
    "espacos": ["lab", "biblioteca", "etc"],
    "tecnologia": ["plataformas", "equipamentos"],
    "limitacoes": ["problemas mencionados"]
  },
  "desafios_metas": {
    "desafios": ["desafio 1", "desafio 2"],
    "metas": ["meta 1", "meta 2"]
  },
  "vocabulario": [
    {"termo": "sigla ou termo", "significado": "o que significa naquele contexto"}
  ],
  "competencias_priorizadas": [
    {"nome": "competencia", "justificativa": "por que o documento indica isso", "relevancia": "alta|media|baixa"}
  ],
  "valores_institucionais": ["valor 1", "valor 2"]
}`;

  return { system, user };
}

function buildPromptCorporativo(empresa, todosTextos) {
  const system = `Voce e um especialista em extracao de contexto corporativo para geracao de cenarios de assessment por competencias.

MISSAO: Extrair um Dossie de Contexto Operacional a partir de documentos fornecidos pela empresa.
Este dossie sera usado para gerar cenarios de competencias altamente fieis ao dia a dia da organizacao.

REGRAS DE SEGURANCA METODOLOGICA:
1. NUNCA trate hipotese como fato. Se nao esta no documento, marque como lacuna.
2. NUNCA preencha processos internos, cultura real ou dinamica operacional sem evidencia no material.
3. NUNCA assuma cultura real a partir apenas do site institucional — sites refletem imagem publica, nao realidade operacional.
4. NUNCA invente tensoes internas, conflitos ou erros sem base documental.
5. Separe claramente "contexto publico" de "dinamica operacional real".
6. Use job postings e descricoes de cargo como PISTA, nao como verdade absoluta.

CLASSIFICACAO DE CONFIANCA (obrigatoria para cada secao):
- "alta": informacao explicita no material fornecido (documento interno, dados oficiais)
- "media": informacao implicita ou parcialmente evidenciada no material
- "baixa": inferencia a partir de pistas indiretas (site, vagas, releases)

CLASSIFICACAO DE ORIGEM (obrigatoria para cada secao):
- "documento_interno": PPP, relatorio, apresentacao interna, regulamento
- "site_institucional": site oficial, pagina sobre, pagina de carreiras
- "release_noticia": materia jornalistica, release, entrevista publica
- "nao_identificado": secao sem informacao suficiente no material

REGRA DE CONCISAO:
- Secoes descritivas: maximo 5 frases curtas cada.
- Listas: maximo 8 itens.
- OBRIGATORIO entregar todas as 10 secoes completas.
- Para cada secao, preencha conteudo + origem + confianca.
- Se a secao nao tem informacao, preencha conteudo como null e confianca como "baixa".

Responda APENAS com JSON valido.`;

  const user = `Empresa: ${empresa.nome} (${empresa.segmento})

Material fornecido:
${todosTextos.slice(0, 60000)}

---
Extraia no formato JSON abaixo (Dossie de Contexto Operacional Corporativo).
TODAS as 10 secoes sao OBRIGATORIAS, cada uma com conteudo + origem + confianca:

{
  "perfil_organizacional": {
    "conteudo": {
      "nome": "nome completo da empresa",
      "setor": "industria / servicos / tecnologia / varejo / etc",
      "segmento": "${empresa.segmento}",
      "porte": "n aprox de colaboradores, faturamento se disponivel",
      "localizacao": "sede e unidades",
      "modelo_atuacao": "presencial / hibrido / remoto / multi-site"
    },
    "origem": "documento_interno | site_institucional | release_noticia | nao_identificado",
    "confianca": "alta | media | baixa"
  },
  "mercado_stakeholders": {
    "conteudo": {
      "clientes": "perfil dos clientes e mercado atendido (2-3 frases)",
      "concorrencia": "posicionamento competitivo e diferenciais mencionados",
      "stakeholders_chave": ["acionistas", "reguladores", "parceiros", "comunidade"]
    },
    "origem": "...",
    "confianca": "..."
  },
  "identidade_cultura": {
    "conteudo": {
      "missao": "transcrever ou sintetizar",
      "visao": "transcrever ou sintetizar",
      "valores": ["valor 1", "valor 2"],
      "modelo_gestao": "como descreve seu estilo de gestao e lideranca (2-3 frases)",
      "cultura_declarada": "elementos culturais explicitos (2-3 frases)"
    },
    "origem": "...",
    "confianca": "..."
  },
  "operacao_processos": {
    "conteudo": [
      {"area": "nome da area", "funcao": "o que faz (1 frase)", "processos_chave": "processos ou rotinas mencionados"}
    ],
    "origem": "...",
    "confianca": "..."
  },
  "modelo_pessoas": {
    "conteudo": {
      "desenvolvimento": "programas, trilhas, mentorias (2-3 frases)",
      "avaliacao": "modelo de avaliacao de desempenho",
      "carreira": "progressao e carreira",
      "diversidade_inclusao": "politicas de D&I (2-3 frases)"
    },
    "origem": "...",
    "confianca": "..."
  },
  "governanca_decisao": {
    "conteudo": {
      "estrutura": "hierarquia, comites, autonomia (2-3 frases)",
      "tomada_decisao": "centralizada, colegiada, por nivel",
      "compliance": "regulacoes, certificacoes, normas"
    },
    "origem": "...",
    "confianca": "..."
  },
  "tecnologia_recursos": {
    "conteudo": {
      "ferramentas": ["sistemas", "plataformas", "ERPs"],
      "capacidades": ["labs", "centros de inovacao"],
      "limitacoes": ["gaps tecnologicos ou de infra"]
    },
    "origem": "...",
    "confianca": "..."
  },
  "desafios_estrategia": {
    "conteudo": {
      "desafios": ["desafio estrategico 1", "desafio 2"],
      "metas": ["meta declarada 1", "meta 2"],
      "transformacoes": "mudancas em curso: digital, cultural, expansao (2-3 frases)"
    },
    "origem": "...",
    "confianca": "..."
  },
  "vocabulario_corporativo": {
    "conteudo": [
      {"termo": "sigla ou jargao interno", "significado": "o que significa"}
    ],
    "origem": "...",
    "confianca": "..."
  },
  "competencias_priorizadas": [
    {"nome": "competencia", "justificativa": "por que o documento indica isso", "relevancia": "alta|media|baixa"}
  ],
  "valores_institucionais": ["valor 1", "valor 2"],
  "_metadata": {
    "lacunas": ["secoes ou campos onde nao havia informacao suficiente"],
    "hipoteses_controladas": ["inferencias feitas a partir de pistas indiretas — NAO sao fatos confirmados"],
    "recomendacao_validacao": ["pontos que devem ser validados com RH ou gestor da empresa"]
  }
}`;

  return { system, user };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 2: ENRIQUECIMENTO VIA WEB
// ═══════════════════════════════════════════════════════════════════════════════

// Regras do que PODE ser enriquecido via web
const WEB_ENRICHABLE = {
  perfil_organizacional: true,   // setor, porte, localização — dados públicos
  mercado_stakeholders: true,    // clientes, concorrência — informação pública
  identidade_cultura: true,      // missão, visão, valores — geralmente no site
  desafios_estrategia: true,     // releases, notícias, relatórios públicos
  vocabulario_corporativo: true, // termos do setor são públicos
  tecnologia_recursos: false,    // muito interno — web não ajuda
  operacao_processos: false,     // interno demais — web gera falso positivo
  modelo_pessoas: false,         // programas internos — web é superficial
  governanca_decisao: false,     // estrutura interna — web não é confiável
};

async function enriquecerViaWeb(empresa, dadosBase, aiModel) {
  try {
    // Identificar lacunas nas seções enriquecíveis
    const lacunas = [];
    for (const [secao, permitido] of Object.entries(WEB_ENRICHABLE)) {
      if (!permitido) continue;
      const sec = dadosBase[secao];
      if (!sec) { lacunas.push(secao); continue; }
      // Verificar se conteudo está vazio/nulo
      const conteudo = sec.conteudo || sec;
      if (!conteudo || conteudo === 'Nao identificado no documento') {
        lacunas.push(secao);
      } else if (sec.confianca === 'baixa') {
        lacunas.push(secao);
      }
    }

    if (lacunas.length === 0) return { enriched: false, dados: dadosBase, fontes: [] };

    // Buscar informações da web sobre a empresa
    const searchQueries = [
      `${empresa.nome} sobre empresa`,
      `${empresa.nome} missão visão valores`,
      `${empresa.nome} produtos serviços mercado`,
    ];

    const webContents = [];
    for (const query of searchQueries) {
      const result = await scrapeJina(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
      if (result.ok && result.texto.length > 200) {
        webContents.push({ query, texto: result.texto.slice(0, 5000) });
      }
    }

    // Tentar buscar o site institucional da empresa
    const possibleSites = [
      `https://www.${empresa.nome.toLowerCase().replace(/\s+/g, '')}.com.br`,
      `https://${empresa.nome.toLowerCase().replace(/\s+/g, '')}.com.br`,
    ];
    for (const site of possibleSites) {
      const result = await scrapeJina(site);
      if (result.ok && result.texto.length > 200) {
        webContents.push({ query: site, texto: result.texto.slice(0, 8000) });
        break; // Um site basta
      }
    }

    if (webContents.length === 0) return { enriched: false, dados: dadosBase, fontes: [] };

    // Chamar IA para enriquecer apenas as lacunas
    const enrichSystem = `Voce e um especialista em enriquecimento de contexto corporativo.
Recebera um Dossie de Contexto ja extraido de material interno, e informacoes publicas da web.

SUA MISSAO: Preencher APENAS as lacunas indicadas, usando as fontes web.

REGRAS CRITICAS:
1. NAO altere informacoes ja extraidas do material interno — elas tem prioridade.
2. NAO invente processos internos, cultura real ou dinamica operacional.
3. Tudo que vier da web deve ser marcado com origem "site_institucional" ou "release_noticia".
4. Confianca maxima para dados web = "media". NUNCA "alta" (alta = apenas material interno).
5. Se a informacao web for generica ou duvidosa, NAO inclua — melhor lacuna que dado ruim.
6. Marque como hipotese_controlada qualquer inferencia.

Responda APENAS com JSON valido contendo somente as secoes que voce conseguiu enriquecer.`;

    const enrichUser = `Empresa: ${empresa.nome}

DOSSIE ATUAL (extraido do material interno):
${JSON.stringify(dadosBase, null, 2).slice(0, 8000)}

LACUNAS A PREENCHER: ${lacunas.join(', ')}

FONTES WEB DISPONIVEIS:
${webContents.map(w => `[Fonte: ${w.query}]\n${w.texto}`).join('\n\n---\n\n')}

---
Retorne JSON com APENAS as secoes que voce conseguiu enriquecer, no mesmo formato do dossie.
Para cada secao enriquecida, use origem e confianca adequados.
Se nao conseguiu enriquecer uma secao, NAO inclua no JSON.`;

    const enrichResult = await callAI(enrichSystem, enrichUser, { model: aiModel }, 8000);
    const enrichData = await extractJSON(enrichResult);

    if (!enrichData) return { enriched: false, dados: dadosBase, fontes: webContents.map(w => w.query) };

    // Merge: sobrescrever apenas seções que estavam em lacuna
    const merged = { ...dadosBase };
    for (const secao of lacunas) {
      if (enrichData[secao]) {
        merged[secao] = enrichData[secao];
      }
    }

    // Adicionar fontes web ao metadata
    if (!merged._metadata) merged._metadata = {};
    merged._metadata.fontes_web = webContents.map(w => w.query);
    merged._metadata.secoes_enriquecidas_web = Object.keys(enrichData).filter(k => lacunas.includes(k));

    return { enriched: true, dados: merged, fontes: webContents };
  } catch (err) {
    console.error('Erro no enriquecimento web:', err);
    return { enriched: false, dados: dadosBase, fontes: [] };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCRAPERS
// ═══════════════════════════════════════════════════════════════════════════════

async function scrapeJina(url) {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        Accept: 'text/plain',
        'X-Return-Format': 'text',
        ...(process.env.JINA_API_KEY && { Authorization: `Bearer ${process.env.JINA_API_KEY}` }),
      },
    });

    if (res.ok) {
      const texto = await res.text();
      if (texto && texto.length > 100) {
        return { ok: true, texto, via: 'jina' };
      }
    }
    return { ok: false, texto: `[Jina: conteúdo insuficiente para ${url}]`, via: 'jina' };
  } catch (err) {
    return { ok: false, texto: `[Jina falhou: ${err.message}]`, via: 'jina' };
  }
}

async function scrapeFirecrawl(url) {
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return { ok: false, texto: `[Firecrawl HTTP ${res.status}: ${detail.slice(0, 200)}]`, via: 'firecrawl' };
    }

    const data = await res.json();
    const markdown = data.data?.markdown || '';

    if (markdown.length > 100) {
      return { ok: true, texto: markdown, via: 'firecrawl' };
    }
    return { ok: false, texto: `[Firecrawl: conteúdo insuficiente para ${url}]`, via: 'firecrawl' };
  } catch (err) {
    return { ok: false, texto: `[Firecrawl falhou: ${err.message}]`, via: 'firecrawl' };
  }
}
