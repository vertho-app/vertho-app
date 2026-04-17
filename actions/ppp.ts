'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from './ai-client';
import { extractJSON } from './utils';

// ── Extrair contexto organizacional (PPP educacional / Dossiê corporativo) ──

interface ExtrairPPPOpts {
  urls?: string[];
  textos?: string[];
  model?: string;
  enriquecerWeb?: boolean;
}

export async function extrairPPP(empresaId: string, { urls = [], textos = [], model, enriquecerWeb = false }: ExtrairPPPOpts = {}) {
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

    // Normalizar — formato corporativo pode ter { conteudo, origem, confianca }
    const unwrap = (field: any) => field?.conteudo != null ? field.conteudo : field;
    const compsPri = unwrap(dados.competencias_priorizadas);
    if (!compsPri) dados.competencias_priorizadas = [];
    dados.competencias = Array.isArray(compsPri) ? compsPri : [];
    const valoresInst = unwrap(dados.valores_institucionais);

    // Step 4: Salvar
    const { error } = await sb.from('ppp_escolas')
      .upsert({
        empresa_id: empresaId,
        escola: empresa.nome,
        fonte: urls.length ? 'site' : 'json',
        url_site: urls[0] || null,
        status: 'extraido',
        extracao: JSON.stringify(dados),
        valores: Array.isArray(valoresInst) ? valoresInst : (dados.identidade_cultura?.valores || dados.identidade_cultura?.conteudo?.valores || []),
        extracted_at: new Date().toISOString(),
      }, { onConflict: 'empresa_id,escola' });

    if (error) return { success: false, error: error.message };

    const pppTexto = conteudosExtraidos.filter(c => !c.erro).map(c => c.texto).join('\n\n');
    try {
      await sb.from('empresas')
        .update({ ppp_texto: pppTexto.slice(0, 50000) })
        .eq('id', empresaId);
    } catch { /* best-effort */ }

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
  const system = `Você é um especialista em análise de documentos educacionais e institucionais brasileiros.

Sua tarefa é extrair, a partir de um PPP ou documento institucional educacional, o contexto necessário para gerar cenários e avaliações de competências de forma fiel à realidade da instituição.

ATENÇÃO:
Você NÃO está fazendo um resumo escolar genérico.
Você NÃO está interpretando livremente o documento.
Você está EXTRAINDO CONTEXTO ESTRUTURADO para uso posterior em prompts de avaliação e desenvolvimento.

OBJETIVO CENTRAL:
Transformar o documento em um contexto educacional claro, conciso e utilizável, preservando:
- identidade institucional
- contexto da comunidade
- práticas descritas
- vocabulário recorrente
- desafios e metas
- valores institucionais
- competências priorizadas

PRINCÍPIOS INEGOCIÁVEIS:
1. Extraia apenas o que está explícito ou claramente implícito no documento.
2. Nunca invente contexto, cultura ou prática institucional.
3. Se não houver base suficiente, escreva exatamente: "Não declarado no documento".
4. Não transforme ideal declarado em prática consolidada sem sustentação.
5. Seja conciso: no máximo 5 frases curtas por seção.
6. Listas com no máximo 8 itens.
7. Entregue obrigatoriamente todas as seções.
8. Priorize o que ajuda a entender como a instituição funciona.
9. Evite abstrações vazias e pedagogês ornamental.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto antes ou depois.`;

  const user = `Instituição: ${empresa.nome} (${empresa.segmento})

Documento:
${todosTextos.slice(0, 60000)}

---
Extraia no formato JSON abaixo. Todas as seções são OBRIGATÓRIAS:

{
  "perfil_instituicao": {
    "nome": "nome completo",
    "tipo": "escola municipal / estadual / privada / etc",
    "segmento": "${empresa.segmento}",
    "porte": "nº aprox de colaboradores/alunos",
    "localizacao": "cidade, UF"
  },
  "comunidade_contexto": "3-5 frases sobre o perfil da comunidade atendida",
  "identidade": {
    "missao": "transcrever ou sintetizar",
    "visao": "transcrever ou sintetizar",
    "principios": ["princípio 1", "princípio 2"],
    "concepcao": "como a instituição entende seu papel (2-3 frases)"
  },
  "praticas_descritas": [
    {"nome": "prática/projeto/programa", "descricao": "1 frase", "frequencia": "permanente/anual/etc"}
  ],
  "inclusao_diversidade": "3-5 frases sobre como trata diversidade e inclusão",
  "gestao_participacao": "3-5 frases sobre modelo de gestão e participação",
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
    {"nome": "competência", "justificativa": "por que o documento indica isso", "relevancia": "alta|media|baixa"}
  ],
  "valores_institucionais": ["valor 1", "valor 2"],
  "_metadata_extracao": {
    "sinais_fortes": ["sinal forte encontrado no documento"],
    "limites_do_documento": ["o que o documento não cobre bem"],
    "alertas_de_interpretacao": ["alerta sobre interpretação frágil"]
  }
}

REGRAS:
- Todas as seções obrigatórias devem existir
- Se faltar informação, usar "Não declarado no documento" ou lista vazia
- Máximo 5 frases curtas por seção textual
- Listas com máximo 8 itens
- _metadata_extracao é opcional mas recomendado
- Não invente termos, valores ou competências fora do que o documento sustenta
- Registre competências priorizadas apenas quando houver base documental clara`;

  return { system, user };
}

function buildPromptCorporativo(empresa, todosTextos) {
  const system = `Você é um especialista em extração de contexto corporativo para geração de cenários e avaliações da Vertho.

Sua tarefa é transformar materiais corporativos em um Dossiê de Contexto Operacional estruturado.

ATENÇÃO:
Você NÃO está fazendo um resumo corporativo bonito.
Você NÃO está interpretando livremente a empresa.
Você está EXTRAINDO CONTEXTO para uso posterior em prompts de competências, cenários e relatórios.

OBJETIVO CENTRAL:
Transformar os materiais da empresa em um dossiê útil, fiel e prudente, preservando:
- identidade organizacional
- stakeholders e mercado
- operação e processos descritos
- modelo de pessoas
- governança e decisão
- tecnologia e recursos
- desafios e estratégia
- vocabulário corporativo
- tensões e dilemas
- cadência e rituais
- sinais sobre cultura e reconhecimento

PRINCÍPIOS INEGOCIÁVEIS:
1. Nunca trate hipótese como fato. Se não está no material, marque como lacuna.
2. Nunca preencha processos internos, cultura real ou dinâmica operacional sem evidência.
3. Nunca assuma cultura real a partir do site institucional — sites refletem imagem pública, não realidade operacional.
4. Nunca invente tensões internas, conflitos ou erros sem base documental.
5. Separe claramente "contexto público" de "dinâmica operacional real".
6. Job postings e descrições de cargo são PISTA, não verdade absoluta.
7. Quando faltar base, use conteudo: null e confianca: "baixa".

CLASSIFICAÇÃO OBRIGATÓRIA POR SEÇÃO:
- confianca: "alta" (documento interno explícito) | "media" (implícito ou fonte pública consistente) | "baixa" (inferência fraca)
- origem: "documento_interno" | "site_institucional" | "release_noticia" | "nao_identificado"

REGRAS DE QUALIDADE:
- Seções descritivas: máximo 5 frases curtas cada.
- Listas: máximo 8 itens.
- OBRIGATÓRIO entregar todas as seções completas.
- Cada seção com conteudo + origem + confianca.
- Priorize o que ajuda a entender a empresa de verdade.
- Capture vocabulário e tensões úteis para cenários.
- Não force preenchimento positivo.
- Evite consultoriês e frases que serviriam para qualquer empresa.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto antes ou depois.`;

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
  "tensoes_dilemas": {
    "conteudo": [
      {"tensao": "ex: velocidade vs qualidade / autonomia vs controle / marketing vs vendas", "contexto": "como aparece no dia a dia"}
    ],
    "origem": "...",
    "confianca": "..."
  },
  "cadencia_rituais": {
    "conteudo": {
      "rituais_individuais": "ex: 1:1 semanais, check-ins quinzenais (o que acontece e freq)",
      "rituais_time": "ex: dailies, retros, plannings, all-hands, town halls",
      "ciclos_estrategicos": "ex: OKRs trimestrais, budget anual, pulse surveys"
    },
    "origem": "...",
    "confianca": "..."
  },
  "stakeholders_por_area": {
    "conteudo": [
      {"area": "nome", "clientes_internos": ["areas que dependem dela"], "fornecedores_internos": ["areas que a abastecem"]}
    ],
    "origem": "...",
    "confianca": "..."
  },
  "casos_recentes": {
    "conteudo": [
      {"tipo": "aquisicao | incidente | lancamento | crise | transformacao", "descricao": "2-3 frases", "quando": "ex: Q3 2025"}
    ],
    "origem": "...",
    "confianca": "..."
  },
  "perfil_forca_trabalho": {
    "conteudo": {
      "geracao_dominante": "ex: millennials 30-40, gen X 40+, mix",
      "seniority_medio": "ex: senior, pleno, junior predominante",
      "turnover": "se mencionado: alto / medio / baixo",
      "formacao_tipica": "graduacao, pos, diversos"
    },
    "origem": "...",
    "confianca": "..."
  },
  "reconhecimento_punicao": {
    "conteudo": {
      "o_que_e_celebrado": "comportamentos/resultados visivelmente reconhecidos (2-3 frases)",
      "o_que_nao_e_tolerado": "comportamentos que levam a consequencias (2-3 frases)",
      "mecanismos": "ex: premio, reconhecimento publico, feedback, promocao"
    },
    "origem": "...",
    "confianca": "..."
  },
  "comunicacao_interna": {
    "conteudo": {
      "canais_principais": ["ex: Slack, email, Teams, whatsapp, face-a-face"],
      "padrao": "sincrono / assincrono / misto",
      "formalidade": "alta / media / informal",
      "transparencia": "ex: all-hands regulares, dados abertos, tudo publico"
    },
    "origem": "...",
    "confianca": "..."
  },
  "maturidade_cultural": {
    "conteudo": {
      "psychological_safety": "alta / media / baixa — evidencias",
      "tratamento_de_erros": "ex: blameless post-mortem, culpabilizacao, aprendizado",
      "velocidade_decisao": "rapida / media / lenta — por que",
      "abertura_mudanca": "alta / media / baixa"
    },
    "origem": "...",
    "confianca": "..."
  },
  "competencias_priorizadas": {
    "conteudo": [
      {"nome": "competência", "justificativa": "por que o material indica isso", "relevancia": "alta|media|baixa"}
    ],
    "origem": "...",
    "confianca": "..."
  },
  "valores_institucionais": {
    "conteudo": ["valor 1", "valor 2"],
    "origem": "...",
    "confianca": "..."
  },
  "_metadata_extracao": {
    "sinais_fortes": ["sinal forte encontrado no material"],
    "limites_do_material": ["o que o material não cobre bem"],
    "alertas_de_interpretacao": ["alerta sobre interpretação frágil"],
    "recomendacao_validacao": ["pontos que devem ser validados com RH ou gestor"]
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
