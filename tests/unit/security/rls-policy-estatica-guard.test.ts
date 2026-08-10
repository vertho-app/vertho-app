// Guard ESTÁTICO de policies RLS — roda em PR, sem banco.
//
// POR QUE EXISTE (achado F1 da auditoria de 09-10/08/2026):
//   Quatro policies `FOR SELECT TO authenticated` sem filtro de tenant entregavam,
//   num único GET no PostgREST com a anon key do bundle, 235 Módulos-Base de 3
//   empresas, 393 micro-conteúdos e 935 competências de 10 empresas. Fechadas pela
//   mig 206.
//
//   O guard que deveria ter pego (`rls-posture.test.ts`) não pegou por DOIS motivos,
//   e este arquivo cobre o primeiro:
//     1. o INV2 filtra `roles @> '{public}' OR '{anon}'` — `authenticated` nunca
//        entrava na conta — e casa `qual = 'true'`, enquanto `micro_conteudos` era
//        `USING (ativo = true)` e passaria batido mesmo com o papel corrigido;
//     2. ele só roda com `DATABASE_URL`, que o CI não tem (`describe.skipIf`) —
//        verde sem ter rodado. Corrigir isso é o job de banco pós-merge, NÃO este
//        arquivo: não se põe credencial de produção num workflow que roda o código
//        da própria PR.
//
//   Daí a divisão: aqui vai o que dá para afirmar lendo `migrations/` — que é
//   justamente onde uma policy nova nasce. O estado do banco vivo (policy criada à
//   mão, GRANT, MV exposta) continua sendo assunto do outro guard.
//
// A RÉGUA NÃO É UM PADRÃO DE `qual`. É a lista de tabelas tenant-owned — derivada
// das próprias migrations, não digitada — contra o que a policy referencia. Uma
// lista digitada de tabelas apodrece na primeira tabela nova; um padrão de `qual`
// não pega `USING (ativo = true)`.
//
// ⚠️ BASELINE POR NÚMERO, e o motivo de não ser uma allowlist de nomes:
//   As migrations até a 206 foram auditadas em 10/08/2026 contra o BANCO VIVO
//   (`pg_policies`), não contra o texto. Resultado medido: das 28 policies que o
//   parser textual vê "vivas" sobre tabela tenant-owned sem `empresa_id`, apenas 6
//   existem de fato — 22 foram dropadas pelos loops `EXECUTE format(...)` das migs
//   113/118/156, que nenhum parser estático enxerga sem virar um interpretador de
//   PL/pgSQL pela metade. Das 6 reais: 5 são `TO service_role` (papel com BYPASSRLS
//   — a policy não é a defesa dele) e 1 é `colaboradores_update_self`, escopada por
//   `current_colaborador_id()`, que é MAIS estreita que o tenant.
//   Congelar por número diz a verdade sobre o que foi verificado, em vez de manter
//   22 entradas de allowlist para policies que não existem.
//   LIMITE conhecido: recriar uma policy antiga pelo mesmo nome numa migration nova
//   é pego (ela é > 206); editar um arquivo ≤ 206 não é — mas migration aplicada
//   não se reaplica, então editar o passado não muda o banco.
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

/** Migrations até aqui foram auditadas contra o banco vivo em 10/08/2026. */
const BASELINE = 206;

/**
 * Funções de escopo que substituem `empresa_id` legitimamente. Explícitas de
 * propósito: cada uma é uma afirmação de que o predicado amarra a linha ao
 * chamador. `current_colaborador_id()` é mais estreita que o tenant (uma pessoa);
 * `get_empresa_id()` é o tenant pelo JWT.
 *
 * ⚠️ `get_empresa_id()` devolve NULL para os 365 usuários de hoje (nada escreve o
 * claim `empresa_id` no `app_metadata`), então uma policy que só depende dela nega
 * tudo. Aceitá-la aqui é sobre INTENÇÃO de escopo, não sobre eficácia — a decisão
 * de fazer o RLS valer ou declará-lo decorativo está aberta.
 */
const FUNCOES_DE_ESCOPO = ['get_empresa_id', 'current_colaborador_id', 'can_read_sessao_avaliacao'];

const semAspas = (t: string) => t.replace(/^public\./i, '').replace(/"/g, '').toLowerCase();
const numeroDe = (arquivo: string) => Number(/^(\d+)-/.exec(arquivo)?.[1] ?? NaN);

export interface Migration { nome: string; sql: string }
export interface Violacao { arquivo: string; alvo: string; motivo: string }

/**
 * Tabelas com `empresa_id`, derivadas das migrations (CREATE TABLE com a coluna no
 * corpo, ou ALTER TABLE ... ADD COLUMN empresa_id). Sem lista digitada: tabela nova
 * entra sozinha.
 */
export function tabelasTenantOwned(migrations: Migration[]): Set<string> {
  const tenant = new Set<string>();
  for (const { sql } of migrations) {
    for (const m of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w".]+)\s*\(([\s\S]*?)\n\s*\)\s*;/gi)) {
      if (/\bempresa_id\b/i.test(m[2])) tenant.add(semAspas(m[1]));
    }
    for (const m of sql.matchAll(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?([\w".]+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w"]+)/gi)) {
      if (semAspas(m[2]) === 'empresa_id') tenant.add(semAspas(m[1]));
    }
  }
  return tenant;
}

/**
 * As duas classes que produziram F1:
 *
 *  A) policy NOVA nascendo sem filtro de tenant sobre tabela tenant-owned
 *     (`competencias`, mig 037);
 *  B) tabela que VIRA tenant-owned e deixa para trás uma policy escrita quando ela
 *     era catálogo global (`modulos_base_conteudo`: policy na 122, `empresa_id` na
 *     135, ninguém voltou). É a mais traiçoeira das duas — nada no diff da 135
 *     menciona policy. Aqui, adicionar `empresa_id` a uma tabela que já tem policy
 *     obriga o mesmo arquivo a tocar em POLICY (revisitar, dropar ou recriar).
 */
export function violacoes(migrations: Migration[], baseline = BASELINE): Violacao[] {
  const tenant = tabelasTenantOwned(migrations);
  const out: Violacao[] = [];

  // Tabelas que já tinham alguma policy declarada em migration anterior.
  const comPolicy = new Set<string>();
  const escopo = new RegExp(`\\bempresa_id\\b|\\b(${FUNCOES_DE_ESCOPO.join('|')})\\s*\\(`, 'i');

  for (const { nome, sql } of [...migrations].sort((a, b) => a.nome.localeCompare(b.nome))) {
    const novo = !(numeroDe(nome) <= baseline);
    const tocaPolicy = /\bPOLICY\b/i.test(sql);

    if (novo) {
      for (const m of sql.matchAll(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?([\w".]+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w"]+)/gi)) {
        const tab = semAspas(m[1]);
        if (semAspas(m[2]) !== 'empresa_id' || !comPolicy.has(tab) || tocaPolicy) continue;
        out.push({
          arquivo: nome,
          alvo: tab,
          motivo: `virou tenant-owned (ganhou empresa_id) e as policies existentes não foram revisitadas neste arquivo — foi assim que ${'`modulos_base_conteudo`'} ficou aberta por 3 meses`,
        });
      }
    }

    for (const m of sql.matchAll(/CREATE\s+POLICY\s+([\w"]+)\s+ON\s+([\w".]+)([\s\S]*?);/gi)) {
      const [, nomePol, tabRaw, corpo] = m;
      const tab = semAspas(tabRaw);
      comPolicy.add(tab);
      if (!novo || !tenant.has(tab)) continue;

      // `TO service_role` sozinho: papel com BYPASSRLS, a policy não é a defesa dele.
      const roles = /\bTO\s+([\w\s,"]+?)(?=\s+(?:USING|WITH|AS|FOR)\b|\s*$)/i.exec(corpo)?.[1] ?? '';
      const soServiceRole = roles.trim().length > 0
        && roles.split(',').every((r) => ['service_role', 'postgres'].includes(r.trim().toLowerCase()));
      if (soServiceRole) continue;

      if (!escopo.test(corpo)) {
        out.push({
          arquivo: nome,
          alvo: `${tab}.${semAspas(nomePol)}`,
          motivo: `policy sobre tabela tenant-owned sem escopo: o predicado não cita empresa_id nem ${FUNCOES_DE_ESCOPO.join('/')}`,
        });
      }
    }
  }
  return out;
}

const M = (nome: string, sql: string): Migration => ({ nome, sql });

describe('Guard estático: policy RLS sobre tabela tenant-owned', () => {
  const base = M('000-baseline.sql', 'CREATE TABLE competencias (\n  id uuid,\n  empresa_id uuid\n);\n');

  it('deriva as tabelas tenant-owned sem lista digitada (CREATE TABLE e ADD COLUMN)', () => {
    const t = tabelasTenantOwned([
      base,
      M('122-x.sql', 'CREATE TABLE modulos_base_conteudo (\n  id uuid,\n  titulo text\n);\n'),
      M('135-y.sql', 'ALTER TABLE modulos_base_conteudo\n  ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES empresas(id);'),
      M('001-global.sql', 'CREATE TABLE competencias_base (\n  id uuid,\n  nome text\n);\n'),
    ]);
    expect([...t].sort()).toEqual(['competencias', 'modulos_base_conteudo']);
  });

  it('pega o caso real de F1: policy nova permissiva a authenticated', () => {
    const v = violacoes([base, M('207-nova.sql', 'CREATE POLICY "le_tudo" ON competencias FOR SELECT TO authenticated USING (true);')]);
    expect(v.map((x) => x.alvo)).toEqual(['competencias.le_tudo']);
  });

  it('pega `USING (ativo = true)` — que um padrão de qual = true deixaria passar', () => {
    const v = violacoes([base, M('207-nova.sql', 'CREATE POLICY "so_ativo" ON competencias FOR SELECT TO authenticated USING (ativo = true);')]);
    expect(v).toHaveLength(1);
  });

  it('aceita policy escopada por empresa_id ou por função de escopo', () => {
    const ok = M('207-ok.sql', `
      CREATE POLICY "por_tenant" ON competencias FOR SELECT TO authenticated USING (empresa_id = get_empresa_id());
      CREATE POLICY "por_pessoa" ON competencias FOR UPDATE TO authenticated USING (id = current_colaborador_id());`);
    expect(violacoes([base, ok])).toEqual([]);
  });

  it('ignora policy exclusiva de service_role (BYPASSRLS), mas não se houver outro papel junto', () => {
    expect(violacoes([base, M('207-a.sql', 'CREATE POLICY "svc" ON competencias FOR ALL TO service_role USING (true) WITH CHECK (true);')])).toEqual([]);
    expect(violacoes([base, M('207-b.sql', 'CREATE POLICY "svc_e_auth" ON competencias FOR ALL TO service_role, authenticated USING (true);')])).toHaveLength(1);
  });

  it('pega a classe da mig 135: tabela vira tenant-owned e a policy velha fica', () => {
    const historia = [
      M('122-cria.sql', 'CREATE TABLE modulos_base_conteudo (\n  id uuid\n);\nCREATE POLICY "le_todos" ON modulos_base_conteudo FOR SELECT TO authenticated USING (true);'),
      M('207-vira-tenant.sql', 'ALTER TABLE modulos_base_conteudo ADD COLUMN IF NOT EXISTS empresa_id uuid;'),
    ];
    expect(violacoes(historia).map((x) => x.alvo)).toEqual(['modulos_base_conteudo']);

    // ... e para de reclamar quando o mesmo arquivo revisita a policy.
    const corrigida = [
      historia[0],
      M('207-vira-tenant.sql', 'ALTER TABLE modulos_base_conteudo ADD COLUMN IF NOT EXISTS empresa_id uuid;\nDROP POLICY IF EXISTS "le_todos" ON modulos_base_conteudo;'),
    ];
    expect(violacoes(corrigida)).toEqual([]);
  });

  it('não olha para trás do baseline (o passado foi auditado contra o banco vivo)', () => {
    const antiga = M('037-habilita-rls.sql', 'CREATE POLICY "authenticated_select_competencias" ON competencias FOR SELECT TO authenticated USING (true);');
    expect(violacoes([base, antiga])).toEqual([]);
  });

  it('migrations/ não tem policy nova sem escopo de tenant', () => {
    const migrations = readdirSync('migrations')
      .filter((f) => f.endsWith('.sql'))
      .map((f) => M(f, readFileSync(join('migrations', f), 'utf8')));

    const v = violacoes(migrations);
    const lista = v.map((x) => `  ❌ ${x.arquivo} → ${x.alvo}: ${x.motivo}`);
    expect(
      lista.join('\n'),
      lista.length
        ? `Policy RLS sem escopo de tenant:\n${lista.join('\n')}\n\n` +
          'Uma policy permissiva sobre tabela tenant-owned entrega o dado de TODOS os tenants a ' +
          'qualquer sessão autenticada, direto no PostgREST, sem passar por uma linha do app. ' +
          'Escope por empresa_id — ou, se a leitura é global de propósito, diga isso no arquivo ' +
          'e traga a exceção para FUNCOES_DE_ESCOPO com o motivo escrito.'
        : '',
    ).toBe('');
  });
});
