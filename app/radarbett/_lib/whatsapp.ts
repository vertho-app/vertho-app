/**
 * Abre WhatsApp pra agendar conversa com a Vertho.
 * Usado por todos os botões "Agendar conversa" do radarbett — substituiu
 * o caminho antigo que abria o modal de lead (era atrito desnecessário
 * pra quem só queria conversar).
 */

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_RODRIGO_WHATSAPP || '';

type Contexto = {
  tipo?: 'home' | 'escola' | 'municipio' | 'comparar' | 'header' | 'cta';
  scope?: string; // nome da escola/município, etc.
};

export function openWhatsAppAgendar(ctx: Contexto = {}) {
  const fallback = 'Olá! Vim do Radar Vertho e gostaria de agendar uma conversa.';
  const msgPorContexto: Record<string, string> = {
    home:      'Olá! Vim do Radar Vertho (Bett 2026) e gostaria de agendar uma conversa.',
    escola:    `Olá! Acabei de ver a leitura inicial${ctx.scope ? ` da escola ${ctx.scope}` : ''} no Radar Vertho. Gostaria de agendar uma conversa.`,
    municipio: `Olá! Acabei de ver a leitura inicial${ctx.scope ? ` da rede de ${ctx.scope}` : ''} no Radar Vertho. Gostaria de agendar uma conversa.`,
    comparar:  'Olá! Estava comparando escolas no Radar Vertho e gostaria de agendar uma conversa.',
    header:    fallback,
    cta:       'Olá! Vim do Radar Vertho (Bett 2026) e gostaria de agendar uma conversa.',
  };
  const msg = msgPorContexto[ctx.tipo || ''] || fallback;

  if (!WHATSAPP_NUMBER) {
    window.location.href = `mailto:rodrigo@vertho.ai?body=${encodeURIComponent(msg)}`;
    return;
  }
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
}
