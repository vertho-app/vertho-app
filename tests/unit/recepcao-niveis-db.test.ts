// Operação editorial opt-in. Dry-run por padrão; aplicação exige a segunda flag.
//
// RECEPCAO_NIVEIS_DB=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/unit/recepcao-niveis-db.test.ts
// Com RECEPCAO_NIVEIS_APPLY=1: publica 1.1, 2.1 e 3.1 (conteúdo das x.0 mais publico.nivel) lado a lado e
// arquiva as sementes globais 3.0. As 1.0 e 2.0 já estão arquivadas. O trigger do banco não deixa alterar
// conteúdo publicado nem desarquivar, por isso versões novas. Cópias de clínica e snapshots de sessões não
// são tocados. Backup do estado anterior em backups/. Supera recepcao-desafios-db e recepcao-limites-db.
import { test, expect } from 'vitest';
import pg from 'pg';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { sslSupabase } from '../../scripts/_pg-ssl.mjs';
import { catalogoInicial } from '@/lib/recepcao/catalogo';
import { catalogoDesafiador } from '@/lib/recepcao/catalogo-desafiador';
import { catalogoLimites } from '@/lib/recepcao/catalogo-limites';

const sementes = [
  { catalogo: catalogoInicial, versao: '1.1', nivel: 'introducao' },
  { catalogo: catalogoDesafiador, versao: '2.1', nivel: 'pressao' },
  { catalogo: catalogoLimites, versao: '3.1', nivel: 'limite' },
];
const idDeterministico = (codigo: string, versao: string) => {
  const h = createHash('sha256').update(`recepcao:${codigo}:${versao}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

test.runIf(process.env.RECEPCAO_NIVEIS_DB === '1')('publica os três degraus lado a lado (1.1, 2.1, 3.1) e arquiva as sementes 3.0', async () => {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: sslSupabase() }); await db.connect(); let committed = false;
  try {
    await db.query('BEGIN');
    await db.query("select pg_advisory_xact_lock(hashtext('recepcao:catalogo-niveis'))");
    const codigos = catalogoInicial.map(c => c.id);
    const antes = await db.query('select * from recepcao_cenarios where empresa_id is null and codigo=any($1::text[]) for update', [codigos]);
    if (process.env.RECEPCAO_NIVEIS_APPLY === '1') {
      mkdirSync('backups', { recursive: true });
      writeFileSync(`backups/recepcao-catalogo-antes-niveis-${Date.now()}.json`, JSON.stringify(antes.rows, null, 2));
    }
    for (const s of sementes) {
      expect(s.catalogo.map(c => [c.versao, c.publico.nivel]), `${s.versao}: o catálogo em código carrega versão e nível`).toEqual(Array(5).fill([s.versao, s.nivel]));
      for (const c of s.catalogo) {
        const id = idDeterministico(c.id, c.versao);
        await db.query("insert into recepcao_cenarios(id,empresa_id,codigo,versao,conteudo,estado,created_by) values($1,null,$2,$3,$4,'publicado',$5) on conflict do nothing", [id, c.id, c.versao, JSON.stringify(c), `seed:recepcao-niveis-${s.versao}`]);
        const salvo = (await db.query('select conteudo,estado from recepcao_cenarios where id=$1', [id])).rows[0];
        expect(salvo?.conteudo, `${c.id} ${c.versao}: não sobrescrever uma versão divergente já publicada.`).toEqual(c);
        expect(salvo?.estado).toBe('publicado');
      }
    }
    const arquivadas = await db.query("update recepcao_cenarios set estado='arquivado',revisao=revisao+1,updated_at=now() where empresa_id is null and codigo=any($1::text[]) and versao='3.0' and created_by='seed:recepcao-limites-3.0' and estado='publicado'", [codigos]);
    expect(arquivadas.rowCount, 'As 5 sementes 3.0 publicadas são arquivadas (0 numa reexecução).').toBeLessThanOrEqual(5);
    const { rows } = await db.query("select versao, conteudo->'publico'->>'nivel' nivel, count(*)::int n from recepcao_cenarios where empresa_id is null and codigo=any($1::text[]) and estado='publicado' group by 1,2 order by 1", [codigos]);
    expect(rows).toEqual([{ versao: '1.1', nivel: 'introducao', n: 5 }, { versao: '2.1', nivel: 'pressao', n: 5 }, { versao: '3.1', nivel: 'limite', n: 5 }]);
    if (process.env.RECEPCAO_NIVEIS_APPLY === '1') { await db.query('COMMIT'); committed = true; }
  } finally { if (!committed) await db.query('ROLLBACK'); await db.end(); }
}, 60000);
