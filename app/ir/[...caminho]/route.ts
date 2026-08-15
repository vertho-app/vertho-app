import { NextResponse } from 'next/server';

/**
 * `/ir/<tenant>/<semana>[/<formato>[/<pilula>]]` — link curto de domínio ÚNICO.
 *
 * POR QUE ISTO EXISTE
 * ───────────────────
 * O botão de URL de um template da Meta aceita **uma** variável, e ela vai no
 * FIM de uma URL fixa ("Supports 1 variable, appended to the end of the URL
 * string"). Aqui o domínio É o tenant (`ibipeba.vertho.ai`), então um botão
 * `https://{{1}}` — com a variável cobrindo o domínio — é recusado na revisão.
 *
 * Com este redirecionador o botão vira `https://app.vertho.ai/ir/{{1}}`: domínio
 * fixo, variável no fim, e o caminho carrega tenant + semana + formato + pílula.
 *
 * 🔴 POR QUE NÃO É UM OPEN REDIRECT (é o que faz este arquivo ser seguro):
 * o parâmetro é um **slug**, nunca uma URL, e o destino é MONTADO aqui. O regex
 * do slug não admite `.`, `/`, `@` nem `:` — os quatro caracteres que
 * permitiriam a um valor externo virar OUTRO host. Logo o destino é sempre
 * `<algo>.vertho.ai`: um link do nosso domínio que leva para fora seria
 * matéria-prima de phishing, com a nossa marca em cima, e aqui isso é
 * impossível por construção.
 *
 * ⚠️ NÃO CONSULTA O BANCO de propósito. A versão anterior validava o slug em
 * `empresas` — segunda camada legítima, mas que exigia service-role numa rota
 * PÚBLICA (quem clica ainda não entrou, então não há sessão para gatear). Trocar
 * a defesa real (o regex) por uma consulta com privilégio máximo, num endpoint
 * aberto, é piorar a postura para ganhar uma mensagem de erro mais bonita: slug
 * inexistente cai numa tela de tenant inválido do próprio app, não num destino
 * de terceiro.
 *
 * Sem sessão de propósito: quem clica ainda não entrou. O destino é que decide
 * se manda para o login.
 */

export const dynamic = 'force-dynamic';

/** Formatos que a pílula anuncia. Fora disso, o parâmetro é ignorado — não quebra. */
const FORMATOS = new Set(['texto', 'audio', 'video', 'case', 'podcast', 'infografico']);

const SLUG = /^[a-z0-9-]{2,40}$/;

function destinoInvalido(motivo: string) {
  // 404 e não redirect: mandar para algum lugar "por garantia" é exatamente o
  // comportamento que transforma um link quebrado em vetor de phishing.
  return NextResponse.json({ error: `link inválido (${motivo})` }, { status: 404 });
}

export async function GET(_req: Request, ctx: { params: Promise<{ caminho: string[] }> }) {
  const { caminho } = await ctx.params;
  const [slug, semanaTxt, formato, pilulaTxt] = caminho || [];

  if (!slug || !SLUG.test(slug)) return destinoInvalido('cliente');

  const semana = Number(semanaTxt);
  if (!Number.isInteger(semana) || semana < 1 || semana > 60) return destinoInvalido('semana');

  const params = new URLSearchParams();
  if (formato && FORMATOS.has(formato)) params.set('formato', formato);
  const pilula = Number(pilulaTxt);
  if (Number.isInteger(pilula) && pilula >= 1 && pilula <= 7) params.set('p', String(pilula));
  const qs = params.toString();

  const destino = `https://${slug}.vertho.ai/dashboard/temporada/semana/${semana}${qs ? `?${qs}` : ''}`;
  // 302 e não 301: o mapeamento pode mudar (formato preferido, estrutura da
  // rota), e um 301 fica no cache do navegador da pessoa para sempre.
  return NextResponse.redirect(destino, 302);
}
