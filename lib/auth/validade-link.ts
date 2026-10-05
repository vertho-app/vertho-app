/**
 * Quanto tempo vale o link de acesso (o magic link do Supabase).
 *
 * MEDIDO em 03/10/2026 (R-47): `mailer_otp_exp = 3600` na configuração do Auth
 * do projeto, lida pela API de gestão do Supabase. É o mesmo relógio para o
 * link do e-mail, o do WhatsApp e o do Beto, porque os três saem do mesmo
 * `generateLink`. O banco confirma: das entradas por link em que dá para casar
 * o envio com o login, há entradas 19 e 36 minutos depois do envio.
 *
 * Até esta data cada peça dizia uma coisa: o e-mail e o WhatsApp em texto
 * diziam 24 horas (o link morria 23 horas antes do prometido), e o template
 * `acesso_vertho` e o Beto diziam 15 minutos.
 *
 * ⚠️ O número NÃO mora no repositório: é configuração do projeto no Supabase.
 * Se alguém mudar lá, este valor e os textos que o citam (os de
 * `lib/i18n-auth-templates.ts`) ficam errados sem nenhum teste acusar. O corpo
 * aprovado do template `acesso_vertho` também não muda por código: o "15
 * minutos" de lá só some com a versão nova na Meta, o `acesso_vertho_v2` ("O link
 * vale por 1 hora"), submetido em 05/10/2026 e em uso depois de APPROVED, quando
 * a env `WHATSAPP_TEMPLATE_ACESSO` passa a apontar para ele.
 */
export const VALIDADE_LINK_ACESSO_MS = 60 * 60 * 1000;
