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

    // Step 2: Use AI to extract PPP competencies
    const system = `Você é um especialista em análise de Projetos Político-Pedagógicos (PPP) e documentos institucionais.
Extraia competências comportamentais mencionadas ou implícitas nos documentos.
Responda APENAS com JSON válido.`;

    const todosTextos = conteudosExtraidos.map(c => `[Fonte: ${c.fonte}]\n${c.texto}`).join('\n\n---\n\n');

    const user = `Empresa: ${empresa.nome} (${empresa.segmento})

Documentos PPP / Institucionais:
${todosTextos.slice(0, 30000)}

Extraia as competências comportamentais que a instituição valoriza:
{
  "competencias": [
    {"nome": "...", "descricao": "...", "evidencia": "trecho do texto que suporta", "relevancia": "alta|media|baixa"}
  ],
  "valores_institucionais": ["..."],
  "perfil_desejado": "..."
}`;

    const resultado = await callAI(system, user, { model: model || 'claude-sonnet-4-6' }, 8000);
    const dados = await extractJSON(resultado);

    if (!dados?.competencias?.length) {
      return { success: false, error: 'Não foi possível extrair competências dos documentos' };
    }

    // Step 3: Save to ppp_escolas table
    const registros = dados.competencias.map(c => ({
      empresa_id: empresaId,
      nome: c.nome,
      descricao: c.descricao,
      evidencia: c.evidencia,
      relevancia: c.relevancia,
    }));

    const { error } = await sb.from('ppp_escolas').insert(registros);
    if (error) return { success: false, error: error.message };

    // Also save the full PPP text to the empresa
    const pppTexto = conteudosExtraidos.map(c => c.texto).join('\n\n');
    await sb.from('empresas')
      .update({
        ppp_texto: pppTexto.slice(0, 50000),
        ppp_valores: dados.valores_institucionais,
        ppp_perfil: dados.perfil_desejado,
      })
      .eq('id', empresaId);

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
