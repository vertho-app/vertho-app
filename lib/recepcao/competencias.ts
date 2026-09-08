import 'server-only';
import { randomUUID } from 'node:crypto';
import { type ContextoRecepcao, RecepcaoError } from './access';
import { competenciaSchema, type competenciaComandoSchema } from './schema';
import { can } from '@/lib/permissions';
import type { z } from 'zod';

// Biblioteca global (Catálogo Vertho): quem vê a aba Cenários (content.manage) lê; só a plataforma escreve.
// Os cenários copiam nome/critério/níveis para a própria rubrica: nada aqui altera um caso publicado.
export async function listarCompetencias(c: ContextoRecepcao, incluirInativas = false) {
 if (!(await can(c.auth, 'content.manage'))) throw new RecepcaoError(403, 'Seu perfil não permite ver a biblioteca de competências.');
 let q = c.sb.from('recepcao_competencias').select('*');
 if (!incluirInativas) q = q.eq('ativo', true);
 const { data, error } = await q.order('nome').order('id').limit(200);
 if (error) throw new RecepcaoError(503, 'Não foi possível carregar as competências.');
 return { competencias: data || [], podeEditar: c.auth.isPlatformAdmin === true };
}

export async function editarCompetencia(c: ContextoRecepcao, cmd: z.infer<typeof competenciaComandoSchema>) {
 if (!(await can(c.auth, 'content.manage')) || !c.auth.isPlatformAdmin) throw new RecepcaoError(403, 'A biblioteca de competências é editada pela plataforma.');
 if (!cmd.id) {
  if (cmd.op !== 'salvar' || !cmd.conteudo) throw new RecepcaoError(400, 'Informe a competência a criar.');
  const conteudo = competenciaSchema.parse(cmd.conteudo);
  const { data, error } = await c.sb.from('recepcao_competencias').insert({ id: randomUUID(), ...conteudo, ativo: true, created_by: c.ownerKey }).select('*').single();
  if (error?.code === '23505') throw new RecepcaoError(409, 'Já existe uma competência com este código.');
  if (error) throw new RecepcaoError(503, 'Não foi possível criar a competência.');
  return data;
 }
 const { data: atual, error: readError } = await c.sb.from('recepcao_competencias').select('*').eq('id', cmd.id).maybeSingle();
 if (readError) throw new RecepcaoError(503, 'Não foi possível consultar a competência.');
 if (!atual) throw new RecepcaoError(404, 'Competência não encontrada.');
 if (cmd.revisao !== atual.revisao) throw new RecepcaoError(409, 'A competência mudou. Recarregue antes de editar.');
 let patch: Record<string, unknown>;
 if (cmd.op === 'salvar') {
  if (!cmd.conteudo) throw new RecepcaoError(400, 'Informe o conteúdo da competência.');
  const conteudo = competenciaSchema.parse(cmd.conteudo);
  if (conteudo.codigo !== atual.codigo) throw new RecepcaoError(400, 'O código não muda depois de criado; crie outra competência.');
  patch = { nome: conteudo.nome, descricao: conteudo.descricao, niveis: conteudo.niveis };
 } else patch = { ativo: cmd.op === 'restaurar' };
 const { data, error } = await c.sb.from('recepcao_competencias').update({ ...patch, revisao: atual.revisao + 1, updated_at: new Date().toISOString() })
  .eq('id', cmd.id).eq('revisao', cmd.revisao).select('*').maybeSingle();
 if (error) throw new RecepcaoError(503, 'Não foi possível salvar a competência.');
 if (!data) throw new RecepcaoError(409, 'A competência mudou durante a gravação. Recarregue.');
 return data;
}
