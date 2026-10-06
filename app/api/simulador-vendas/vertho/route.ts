import { z } from 'zod';
import { csrfCheck } from '@/lib/csrf';
import {
  aiLimiter,
  readLimiter,
  simVendasInicioLimiter,
} from '@/lib/rate-limit';
import { comContexto } from '@/lib/execucao-contexto';
import {
  contextoVertho,
  requireRepresentativeOrInternalTrainingUser,
} from '@/lib/simulador-vendas/vertho-access';
import { comandoSchema } from '@/lib/simulador-vendas/schema';
import {
  consultar,
  consultarHistorico,
  executar,
} from '@/lib/simulador-vendas/service';
import { falha, json } from '@/lib/simulador-vendas/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function GET(req: Request) {
  try {
    const user = await requireRepresentativeOrInternalTrainingUser(req);
    const limited = await readLimiter.check(req, `sim-vertho:${user.id}`);
    if (limited) return limited;
    const q = new URL(req.url).searchParams;
    if (q.has('empresaId'))
      return json(
        { error: 'O treinamento Vertho usa seu cadastro comercial.' },
        400,
      );
    const id = q.get('sessaoId');
    if (id) z.string().uuid().parse(id);
    const c = await contextoVertho(user);
    return json(
      q.get('historico') === '1'
        ? await consultarHistorico(c, q.get('cursor'))
        : await consultar(c, id),
    );
  } catch (e) {
    return falha(e);
  }
}
export async function POST(req: Request) {
  return comContexto(
    {
      runtime: 'rota',
      orcamentoMs: 300000,
      onde: 'api/simulador-vendas/vertho',
    },
    async () => {
      try {
        const csrf = csrfCheck(req);
        if (csrf) return csrf;
        const user = await requireRepresentativeOrInternalTrainingUser(req);
        const identityLimit = await readLimiter.check(
          req,
          `sim-vertho-escrita:${user.id}`,
        );
        if (identityLimit) return identityLimit;
        const raw = await req.text();
        if (raw.length > 16000)
          return json({ error: 'Mensagem muito longa.' }, 413);
        const cmd = comandoSchema.parse(JSON.parse(raw));
        if (cmd.empresaId)
          return json(
            { error: 'Empresa não pode ser escolhida neste treinamento.' },
            400,
          );
        const c = await contextoVertho(user);
        const limited = await aiLimiter.check(
          req,
          `sim-vendas:${c.empresaId}:${c.ownerKey}`,
        );
        if (limited) return limited;
        if (cmd.acao === 'iniciar') {
          const startLimit = await simVendasInicioLimiter.check(
            req,
            `sim-vendas-iniciar:${c.empresaId}:${c.ownerKey}`,
          );
          if (startLimit) return startLimit;
        }
        return json(await executar(c, cmd));
      } catch (e) {
        return falha(e);
      }
    },
  );
}
