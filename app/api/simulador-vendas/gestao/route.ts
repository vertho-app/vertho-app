import { z } from 'zod';
import { notaPacePublica } from '@/lib/simulador-vendas/escala';
import { escalaNativa14 } from '@/lib/simulador-vendas/matriz-avaliacao';
import { requireUser } from '@/lib/auth/request-context';
import { readLimiter } from '@/lib/rate-limit';
import { contexto } from '@/lib/simulador-vendas/access';
import {
  historicoEquipe,
  relatorioEquipe,
  escopoEquipe,
} from '@/lib/simulador-vendas/equipe';
import { falha, json } from '@/lib/simulador-vendas/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const limited = await readLimiter.check(
      req,
      `sim-vendas-gestao:${auth.email}`,
    );
    if (limited) return limited;
    const q = new URL(req.url).searchParams;
    const empresaId = q.get('empresaId');
    if (empresaId) z.string().uuid().parse(empresaId);
    const c = await contexto(req, empresaId, false, auth);
    if (c instanceof Response) return c;
    const id = q.get('sessaoId');
    if (id) return json(await relatorioEquipe(c, z.string().uuid().parse(id)));
    if (q.get('exportar') === '1') {
      const ids = await escopoEquipe(c);
      const inicio = q.get('inicio'),
        fim = q.get('fim');
      if (inicio) z.string().datetime().parse(inicio);
      if (fim) z.string().datetime().parse(fim);
      if (inicio && fim && Date.parse(fim) <= Date.parse(inicio))
        return json({ error: 'Selecione um período válido.' }, 400);
      const { data, error } = await c.tdb.rpc('sim_vendas_exportar', {
        p_empresa: c.empresaId,
        p_colaboradores: ids,
        p_inicio: inicio,
        p_fim: fim,
      });
      if (error)
        return json({ error: 'Não foi possível exportar o histórico.' }, 503);
      if (
        data?.excedido ||
        !data ||
        Buffer.byteLength(JSON.stringify(data), 'utf8') > 3000000
      )
        return json(
          {
            error:
              'Há muitos treinos neste recorte. Selecione um período menor para exportar.',
          },
          422,
        );
      const planos = new Map<string, number | null>();
      for (let i = 0; i < data.linhas.length; i += 200) {
        const idsExportados = data.linhas
          .slice(i, i + 200)
          .map((r: any) => r.id);
        const { data: rows, error: readError } = await c.tdb
          .from('sim_vendas_sessoes')
          .select('id,PL:estado->relatorio->PL')
          .in('id', idsExportados);
        if (readError)
          return json(
            { error: 'Não foi possível exportar o planejamento.' },
            503,
          );
        for (const row of rows || [])
          planos.set(row.id, row.PL as number | null);
      }
      return json({
        ...data,
        linhas: data.linhas.map((r: any) => ({
          ...r,
          PL: r.Media == null ? null : (planos.get(r.id) ?? null),
          ...Object.fromEntries(
            ['P', 'A', 'C', 'E', 'Media'].map((k) => [
              k,
              notaPacePublica(r[k], r.versaoRegua),
            ]),
          ),
          escalaNota: '1-4',
          escalaOriginal: escalaNativa14(r.versaoRegua) ? null : '0-10',
        })),
      });
    }
    return json(await historicoEquipe(c, q.get('cursor')));
  } catch (e) {
    return falha(e);
  }
}
