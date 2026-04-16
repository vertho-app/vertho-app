'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { gzipSync } from 'node:zlib';

// Tabelas críticas pro backup. Não inclui logs/cache (regenerável).
const TABELAS = [
  'empresas', 'colaboradores', 'cargos_empresa', 'competencias', 'competencias_base',
  'top10_cargos', 'banco_cenarios', 'respostas',
  'fit_resultados', 'descriptor_assessments',
  'trilhas', 'temporada_semana_progresso',
  'micro_conteudos', 'relatorios', 'evolucao', 'evolucao_descritores',
  'sessoes_avaliacao', 'reavaliacao_sessoes',
  'preferencias_aprendizagem', 'platform_admins',
  'trash', // a própria lixeira também (caso restaure backup velho)
];

const RETENCAO_DIAS = 7;

/**
 * Snapshot diário: dump das tabelas críticas em JSON gzip,
 * salva em storage/backups/<YYYY-MM-DD>.json.gz, rotaciona >7d.
 */
export async function executarBackupDiario() {
  try {
    const sb = createSupabaseAdmin();

    const dump: { versao: number; gerado_em: string; tabelas: Record<string, any[]> } = {
      versao: 1,
      gerado_em: new Date().toISOString(),
      tabelas: {},
    };

    let totalLinhas = 0;
    for (const t of TABELAS) {
      try {
        const { data, error } = await sb.from(t).select('*');
        if (error) {
          console.warn(`[backup] skip ${t}:`, error.message);
          continue;
        }
        dump.tabelas[t] = data || [];
        totalLinhas += (data || []).length;
      } catch (e) {
        console.warn(`[backup] erro ${t}:`, e.message);
      }
    }

    // Comprime
    const json = JSON.stringify(dump);
    const buffer = gzipSync(Buffer.from(json), { level: 9 });
    const tamanhoOriginal = json.length;
    const tamanhoComprimido = buffer.length;

    const data = new Date();
    const hoje = data.toISOString().slice(0, 10); // YYYY-MM-DD
    const path = `${hoje}.json.gz`;

    // Upload (upsert overwrite caso já exista do mesmo dia)
    const { error: upErr } = await sb.storage.from('backups').upload(path, buffer, {
      contentType: 'application/gzip',
      upsert: true,
    });
    if (upErr) return { success: false, error: `Upload falhou: ${upErr.message}` };

    // Rotação: lista snapshots e deleta os antigos
    const { data: existing } = await sb.storage.from('backups').list('', { limit: 100 });
    const cortePoint = Date.now() - RETENCAO_DIAS * 86400 * 1000;
    const paraApagar = (existing || [])
      .filter(f => {
        const m = f.name.match(/^(\d{4}-\d{2}-\d{2})\.json\.gz$/);
        if (!m) return false;
        return new Date(m[1]).getTime() < cortePoint;
      })
      .map(f => f.name);
    if (paraApagar.length > 0) {
      await sb.storage.from('backups').remove(paraApagar);
    }

    return {
      success: true,
      message: `Backup ${hoje}: ${totalLinhas} linhas, ${(tamanhoComprimido / 1024).toFixed(1)} KB gzip (${(tamanhoOriginal / 1024).toFixed(1)} KB original) · ${paraApagar.length} antigo(s) removido(s)`,
      path,
      tamanho: tamanhoComprimido,
      linhas: totalLinhas,
    };
  } catch (err) {
    console.error('[VERTHO] backup diário:', err);
    return { success: false, error: err?.message };
  }
}

/**
 * Lista os backups disponíveis no bucket.
 */
export async function listarBackups() {
  try {
    const sb = createSupabaseAdmin();
    const { data, error } = await sb.storage.from('backups').list('', {
      limit: 30, sortBy: { column: 'created_at', order: 'desc' },
    });
    if (error) return { success: false, error: error.message };
    return {
      success: true,
      backups: (data || [])
        .filter(f => f.name.endsWith('.json.gz'))
        .map(f => ({
          nome: f.name,
          data: f.name.replace(/\.json\.gz$/, ''),
          tamanho_kb: f.metadata?.size ? Math.round(f.metadata.size / 1024) : 0,
          criado_em: f.created_at,
        })),
    };
  } catch (err) {
    return { success: false, error: err?.message };
  }
}
