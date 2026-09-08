// Operação editorial opt-in. Dry-run por padrão; aplicação exige a segunda flag.
//
// RECEPCAO_COMPETENCIAS_DB=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/unit/recepcao-competencias-db.test.ts
// Com RECEPCAO_COMPETENCIAS_APPLY=1: garante a migration 245 (idempotente), semeia a biblioteca base
// (6 competências, por código), publica 1.2/2.2/3.2 (rubrica em quatro níveis) e arquiva as sementes
// x.1. Versões publicadas e arquivadas são imutáveis no banco, por isso versões novas. Cópias de clínica
// e snapshots de sessões não são tocados. Backup do estado anterior em backups/.
// Ordem em produção: migration → deploy do código → este APPLY (o schema anterior é strict).
import { test, expect } from 'vitest';
import pg from 'pg';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { sslSupabase } from '../../scripts/_pg-ssl.mjs';
import { cenarioSchema } from '@/lib/recepcao/schema';
import { competenciasBase } from '@/lib/recepcao/competencias-base';
import { catalogoInicial } from '@/lib/recepcao/catalogo';
import { catalogoDesafiador } from '@/lib/recepcao/catalogo-desafiador';
import { catalogoLimites } from '@/lib/recepcao/catalogo-limites';

const sementes = [
  { catalogo: catalogoInicial, versao: '1.2', nivel: 'introducao', anterior: '1.1' },
  { catalogo: catalogoDesafiador, versao: '2.2', nivel: 'pressao', anterior: '2.1' },
  { catalogo: catalogoLimites, versao: '3.2', nivel: 'limite', anterior: '3.1' },
];
const idDeterministico = (codigo: string, versao: string) => {
  const h = createHash('sha256').update(`recepcao:${codigo}:${versao}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

test.runIf(process.env.RECEPCAO_COMPETENCIAS_DB === '1')('migration 245, biblioteca base e catálogo x.2 em quatro níveis', async () => {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: sslSupabase() }); await db.connect(); let committed = false;
  try {
    await db.query('BEGIN');
    await db.query("select pg_advisory_xact_lock(hashtext('recepcao:competencias'))");
    await db.query(readFileSync('migrations/245-recepcao-competencias.sql', 'utf8').replace(/^BEGIN;\s*/m, '').replace(/^COMMIT;\s*/m, '').replace(/^NOTIFY[^;]*;\s*/m, ''));
    const codigos = catalogoInicial.map(c => c.id);
    const antes = await db.query('select * from recepcao_cenarios where empresa_id is null and codigo=any($1::text[]) for update', [codigos]);
    const bibliotecaAntes = await db.query('select * from recepcao_competencias order by codigo');
    if (process.env.RECEPCAO_COMPETENCIAS_APPLY === '1') {
      mkdirSync('backups', { recursive: true });
      writeFileSync(`backups/recepcao-catalogo-antes-competencias-${Date.now()}.json`, JSON.stringify({ cenarios: antes.rows, competencias: bibliotecaAntes.rows }, null, 2));
    }
    for (const b of competenciasBase) {
      await db.query("insert into recepcao_competencias(codigo,nome,descricao,niveis,ativo,created_by) values($1,$2,$3,$4,true,'seed:recepcao-competencias-base') on conflict (codigo) do nothing", [b.codigo, b.nome, b.descricao, JSON.stringify(b.niveis)]);
    }
    const biblioteca = await db.query('select codigo, ativo, niveis from recepcao_competencias where codigo=any($1::text[]) order by codigo', [competenciasBase.map(b => b.codigo)]);
    expect(biblioteca.rows.map(r => r.codigo)).toEqual([...competenciasBase.map(b => b.codigo)].sort());
    expect(biblioteca.rows.every(r => r.ativo && ['n1', 'n2', 'n3', 'n4'].every(n => typeof r.niveis[n] === 'string' && r.niveis[n].length > 0))).toBe(true);
    for (const s of sementes) {
      expect(s.catalogo.map(c => [c.versao, c.publico.nivel, c.rubrica.every(d => !!d.niveis)])).toEqual(Array(5).fill([s.versao, s.nivel, true]));
      for (const c of s.catalogo) {
        const id = idDeterministico(c.id, c.versao);
        await db.query("insert into recepcao_cenarios(id,empresa_id,codigo,versao,conteudo,estado,created_by) values($1,null,$2,$3,$4,'publicado',$5) on conflict do nothing", [id, c.id, c.versao, JSON.stringify(c), `seed:recepcao-competencias-${s.versao}`]);
        const salvo = (await db.query('select conteudo,estado from recepcao_cenarios where id=$1', [id])).rows[0];
        expect(salvo?.conteudo, `${c.id} ${c.versao}: não sobrescrever uma versão divergente já publicada.`).toEqual(c);
        expect(salvo?.estado).toBe('publicado');
        expect(cenarioSchema.parse(salvo.conteudo).rubrica.every(d => !!d.niveis)).toBe(true);
      }
      const arquivadas = await db.query("update recepcao_cenarios set estado='arquivado',revisao=revisao+1,updated_at=now() where empresa_id is null and codigo=any($1::text[]) and versao=$2 and created_by=$3 and estado='publicado'", [codigos, s.anterior, `seed:recepcao-niveis-${s.anterior}`]);
      expect(arquivadas.rowCount, `${s.anterior}: até 5 sementes arquivadas (0 numa reexecução)`).toBeLessThanOrEqual(5);
    }
    const { rows } = await db.query("select versao, conteudo->'publico'->>'nivel' nivel, count(*)::int n from recepcao_cenarios where empresa_id is null and codigo=any($1::text[]) and estado='publicado' group by 1,2 order by 1", [codigos]);
    expect(rows).toEqual([{ versao: '1.2', nivel: 'introducao', n: 5 }, { versao: '2.2', nivel: 'pressao', n: 5 }, { versao: '3.2', nivel: 'limite', n: 5 }]);
    const semNiveis = await db.query("select count(*)::int n from recepcao_cenarios c where c.empresa_id is null and c.estado='publicado' and exists (select 1 from jsonb_array_elements(c.conteudo->'rubrica') r where r->'niveis' is null)");
    expect(semNiveis.rows[0].n).toBe(0);
    if (process.env.RECEPCAO_COMPETENCIAS_APPLY === '1') { await db.query('COMMIT'); committed = true; }
  } finally { if (!committed) await db.query('ROLLBACK'); await db.end(); }
}, 90000);
