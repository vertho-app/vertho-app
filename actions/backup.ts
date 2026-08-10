'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { gzipSync } from 'node:zlib';
import { requireAdminOrCronAction } from '@/lib/auth/action-context';
import { requireAdminSupabase } from '@/lib/admin-supabase';

// Tabelas críticas pro backup. Não inclui logs/cache (regenerável).
//
// ⚠️ Nome errado aqui = tabela faltando no dump. Antes de 10/08/2026 isso passava
// batido (`console.warn` + `continue`); agora derruba o backup, que é o certo —
// mas quer dizer que acrescentar nome sem conferir no banco quebra o cron.
// `preferencias_aprendizagem` estava nesta lista e NÃO EXISTE: todo backup diário
// vinha com uma tabela a menos, reportando sucesso. Removida em 10/08.
const TABELAS = [
  'empresas', 'colaboradores', 'cargos_empresa', 'competencias', 'competencias_base',
  'top10_cargos', 'banco_cenarios', 'respostas',
  'fit_resultados', 'descriptor_assessments',
  'trilhas', 'temporada_semana_progresso',
  'micro_conteudos', 'relatorios', 'evolucao', 'evolucao_descritores',
  'sessoes_avaliacao', 'reavaliacao_sessoes',
  'platform_admins',
  'trash', // a própria lixeira também (caso restaure backup velho)
];

const RETENCAO_DIAS = 7;

/**
 * O PostgREST corta a resposta em 1000 linhas — e o `limit` explícito NÃO passa
 * disso. **Medido em 10/08/2026 contra este projeto**: `?select=id&limit=5000`,
 * `limit=100000` e sem limit devolveram 1000 linhas nas três tentativas. Por
 * isso a exportação é paginada por `range()`, e não por um `limit` grande.
 */
const TAMANHO_PAGINA = 1000;

/**
 * Um tipo só, com `erro` nulo no caminho feliz — e não uma união discriminada por
 * `ok: true|false`, que seria o idioma natural: o `tsconfig` deste projeto tem
 * `strict: false`, e sem `strictNullChecks` o narrowing por discriminante não
 * acontece (`r.erro` depois de `if (!r.ok)` vira erro de compilação).
 */
type ResultadoTabela = {
  erro: string | null;
  linhas: any[];
  esperado: number | null;
  paginas: number;
};

/**
 * Exporta uma tabela inteira, paginando.
 *
 * `order('id')` não é enfeite: sem ordenação estável o Postgres pode devolver as
 * páginas em ordens diferentes entre as chamadas, e aí `range()` repete linha e
 * pula linha — um dump corrompido que parece completo pela contagem.
 *
 * O `count: 'exact'` é uma medida INDEPENDENTE do que a paginação produziu: a
 * paginação sozinha já não trunca por construção (o laço só para quando a página
 * vem incompleta), mas se ela estiver errada é o count que denuncia.
 */
async function exportarTabela(sb: any, tabela: string): Promise<ResultadoTabela> {
  const vazio = { linhas: [] as any[], esperado: null, paginas: 0 };

  const { count, error: errCount } = await sb.from(tabela).select('id', { count: 'exact', head: true });
  if (errCount) return { ...vazio, erro: `count: ${errCount.message}` };

  const linhas: any[] = [];
  let paginas = 0;
  for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
    const { data, error } = await sb.from(tabela)
      .select('*')
      .order('id', { ascending: true })
      .range(inicio, inicio + TAMANHO_PAGINA - 1);
    if (error) return { ...vazio, erro: `página ${paginas + 1}: ${error.message}` };
    paginas++;
    linhas.push(...(data || []));
    if (!data || data.length < TAMANHO_PAGINA) break;
  }
  return { erro: null, linhas, esperado: count ?? null, paginas };
}

/**
 * Snapshot diário: dump das tabelas críticas em JSON gzip,
 * salva em storage/backups/<YYYY-MM-DD>.json.gz, rotaciona >7d.
 *
 * DOIS DEFEITOS CORRIGIDOS EM 10/08/2026 (F14 da auditoria), independentes:
 *
 *  1. `select('*')` sem paginação: tudo acima de 1000 linhas era cortado em
 *     silêncio, e `totalLinhas` somava o truncado — a mensagem de sucesso
 *     reportava o número errado com toda a confiança. `competencias` estava em
 *     935 com +237 nos últimos 30 dias: cruzaria o teto em ~7 dias, e o primeiro
 *     sinal seria um restore incompleto no pior dia possível.
 *  2. Tabela que falhava virava `console.warn` + `continue`: sumia do dump e o
 *     backup seguia **reportando sucesso**. Não era hipótese — a lista pedia
 *     `preferencias_aprendizagem`, que NÃO EXISTE no banco, então todo backup
 *     diário já vinha com uma tabela a menos. Medido no artefato de 10/08 antes
 *     de mexer: 20 tabelas dentro do arquivo para 21 na lista.
 *
 * Agora: backup incompleto é FALHA, com a lista do que faltou. E o manifesto vai
 * dentro do arquivo — esperado × exportado por tabela — para que a integridade
 * seja verificável no artefato, sem precisar do banco de origem.
 */
export async function executarBackupDiario() {
  await requireAdminOrCronAction();
  try {
    const sb = createSupabaseAdmin();

    const manifesto: Record<string, { esperado: number | null; exportado: number; paginas: number }> = {};
    const falhas: string[] = [];
    const dump: {
      versao: number; gerado_em: string;
      manifesto: typeof manifesto; tabelas: Record<string, any[]>;
    } = {
      versao: 2,
      gerado_em: new Date().toISOString(),
      manifesto,
      tabelas: {},
    };

    let totalLinhas = 0;
    for (const t of TABELAS) {
      const r: ResultadoTabela = await exportarTabela(sb, t)
        .catch((e: any): ResultadoTabela => ({ erro: e?.message || 'exceção', linhas: [], esperado: null, paginas: 0 }));
      if (r.erro) { falhas.push(`${t} (${r.erro})`); continue; }

      // Exportado a MENOS que o esperado = perdemos linha. Backup é construção,
      // e construção falha alto: um dump silenciosamente incompleto é pior que
      // dump nenhum, porque só se descobre na hora de restaurar.
      if (r.esperado !== null && r.linhas.length < r.esperado) {
        falhas.push(`${t} (exportou ${r.linhas.length} de ${r.esperado})`);
        continue;
      }

      dump.tabelas[t] = r.linhas;
      manifesto[t] = { esperado: r.esperado, exportado: r.linhas.length, paginas: r.paginas };
      totalLinhas += r.linhas.length;
    }

    if (falhas.length > 0) {
      return {
        success: false,
        error: `Backup INCOMPLETO — ${falhas.length} de ${TABELAS.length} tabela(s) falharam: ${falhas.join(' · ')}`,
        falhas,
      };
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
      message: `Backup ${hoje}: ${TABELAS.length} tabelas, ${totalLinhas} linhas, ${(tamanhoComprimido / 1024).toFixed(1)} KB gzip (${(tamanhoOriginal / 1024).toFixed(1)} KB original) · ${paraApagar.length} antigo(s) removido(s)`,
      path,
      tamanho: tamanhoComprimido,
      linhas: totalLinhas,
      manifesto,
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
  const sb = await requireAdminSupabase();
  try {
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
