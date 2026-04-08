'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from './ai-client';
import { extractJSON } from './utils';

// ── Extrair competências do PPP (Projeto Político Pedagógico) ───────────────

export async function extrairPPP(empresaId, { urls = [], textos = [], model } = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento')
      .eq('id', empresaId).single();

    if (!empresa) return { success: false, error: 'Empresa não encontrada' };

    // Step 1: Scrape URLs — Jina AI Reader (primário) + Firecrawl (fallback)
    const conteudosExtraidos = [];

    for (const url of urls) {
      // Tentativa 1: Jina AI Reader
      let extraido = await scrapeJina(url);

      // Tentativa 2: Firecrawl (fallback se Jina falhou)
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

    // Add manual texts
    for (const texto of textos) {
      conteudosExtraidos.push({ fonte: 'texto_manual', texto: texto.slice(0, 15000) });
    }

    if (!conteudosExtraidos.length) {
      return { success: false, error: 'Nenhum conteúdo extraído das URLs ou textos fornecidos' };
    }

    const urlsOk = conteudosExtraidos.filter(c => !c.erro && c.fonte !== 'texto_manual');
    const urlsFail = conteudosExtraidos.filter(c => c.erro);
    const scraperLog = urlsOk.map(c => `${c.fonte} (${c.via})`).join(', ');

    // Step 2: Use AI to extract structured PPP data (10 sections — matches GAS template)
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

    const todosTextos = conteudosExtraidos.map(c => `[Fonte: ${c.fonte}]\n${c.texto}`).join('\n\n---\n\n');

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

    const resultado = await callAI(system, user, { model: model || 'claude-sonnet-4-6' }, 16000);
    const dados = await extractJSON(resultado);

    if (!dados) {
      return { success: false, error: 'Não foi possível extrair dados do documento' };
    }

    // Normalizar: garantir que competencias existe
    if (!dados.competencias_priorizadas) dados.competencias_priorizadas = [];
    // Compat: manter campo 'competencias' para a UI
    dados.competencias = dados.competencias_priorizadas;

    // Step 3: Save to ppp_escolas (schema: escola, fonte, extracao, valores, status)
    const fonteLabel = urls.length ? urls[0] : 'texto_manual';
    const escolaNome = empresa.nome;

    const { error } = await sb.from('ppp_escolas')
      .upsert({
        empresa_id: empresaId,
        escola: escolaNome,
        fonte: urls.length ? 'site' : 'json',
        url_site: urls[0] || null,
        status: 'extraido',
        extracao: JSON.stringify(dados),
        valores: dados.valores_institucionais || [],
        extracted_at: new Date().toISOString(),
      }, { onConflict: 'empresa_id,escola' });

    if (error) return { success: false, error: error.message };

    // Also save the full PPP text to the empresa (columns may not exist yet — ignore errors)
    const pppTexto = conteudosExtraidos.filter(c => !c.erro).map(c => c.texto).join('\n\n');
    await sb.from('empresas')
      .update({ ppp_texto: pppTexto.slice(0, 50000) })
      .eq('id', empresaId)
      .then(() => {}).catch(() => {});

    return {
      success: true,
      message: `${dados.competencias.length} competências extraídas (${urlsOk.length} URLs ok${urlsFail.length ? `, ${urlsFail.length} falharam` : ''})${scraperLog ? ` via ${urlsOk[0]?.via}` : ''}`,
      data: dados,
    };
  } catch (err) {
    return { success: false, error: err.message };
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
