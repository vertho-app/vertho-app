// Helpers e constantes compartilhados pelos módulos de actions/fase5/*.
// SEM 'use server' — nada aqui é action, apenas código interno.

import type { AIConfig } from '../ai-client';

// Configs específicas da fase 5 (estende a base com flags do check + lote)
export type Fase5Config = AIConfig & {
  checkModel?: string;
  incluirAprovados?: boolean;
};

// ── Helper: upsert para relatórios agregados (colaborador_id = NULL) ────────
// PostgreSQL UNIQUE não detecta conflito em NULL, então onConflict não funciona.
// Solução: select + update/insert explícito.
export async function upsertRelatorioAgregado(tdb: any, tipo: string, conteudo: any) {
  const { data: existing } = await tdb.from('relatorios')
    .select('id').eq('tipo', tipo).is('colaborador_id', null).maybeSingle();
  if (existing) {
    await tdb.from('relatorios').update({ conteudo, gerado_em: new Date().toISOString() }).eq('id', existing.id);
  } else {
    await tdb.from('relatorios').insert({ colaborador_id: null, tipo, conteudo, gerado_em: new Date().toISOString() });
  }
}

// ── Constantes (alinhadas com GAS) ──────────────────────────────────────────
export const TEMP = 0.4; // temperatura GAS para consistência
