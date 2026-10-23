'use server';

import { z } from 'zod';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { assertTenantAccessAction, requireAdminAction } from '@/lib/auth/action-context';
import { protectedAction, protectedLoader } from '@/lib/auth/protected-action';
import { updateColaboradorInTenant, emailExistsInTenant, createColaboradorInTenant, listEmailsInTenant, listTelefonesLoginWhatsappInTenant, createColaboradoresLoteInTenant } from '@/lib/repositories/colaboradores-repo';
import { preverExclusaoPace, excluirCadastroComBackupPace } from '@/lib/simulador-vendas/exclusao';
import { upsertCargoInTenant, deleteCargoInTenant } from '@/lib/repositories/cargos-empresa-repo';
import { camposNovosDoCargo, planoDoImportDeCargos } from '@/lib/cargos-import';
import { logAdminAction } from '@/lib/audit';
import { excludeInternalEmails } from '@/lib/internal-emails';
import { validateWhatsApp, normalizePhone } from '@/lib/phone';
import { proxyEmailFromPhone, isProxyEmail } from '@/lib/phone-otp';
import { getLocale } from 'next-intl/server';
import { TURMA_MEMBRO } from '@/lib/status';
import { lerTudoPaginado } from '@/lib/paginacao';
import { pacoteClinicasLigado, erroDoCadastroPacote, papelExigeCadastroDoPacote, MOTIVO_IMPORTACAO_FECHADA, MOTIVO_CARGO_TRAVADO, type ReferenciaCadastroPacote } from '@/lib/pacote-clinicas';
import { MODELOS_CLINICA } from '@/lib/recepcao/modelos-clinica';

const VALID_ROLES = ['colaborador', 'gestor', 'rh'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

function normalizeText(value: any) {
  const text = value?.toString().trim();
  return text || null;
}

function normalizeEmail(value: any) {
  const email = normalizeText(value)?.toLowerCase();
  return email || null;
}

function isValidEmail(email: string | null) {
  return Boolean(email && email.length <= 254 && EMAIL_RE.test(email));
}


function hasValue(value: any) {
  return Boolean(value?.toString().trim());
}

function formatIssue(issue: any) {
  const valor = issue.valor ? ` "${issue.valor}"` : '';
  const nome = issue.nome ? ` (${issue.nome})` : '';
  return `linha ${issue.linha}${nome}: ${issue.campo}${valor} - ${issue.motivo}`;
}

function buildImportMessage(importados: number, duplicados: number, erros: any[], avisos: any[]) {
  const parts = [`${importados} colaboradores importados`];
  if (duplicados > 0) parts.push(`${duplicados} duplicata${duplicados === 1 ? '' : 's'} ignorada${duplicados === 1 ? '' : 's'}`);
  if (erros.length > 0) parts.push(`${erros.length} linha${erros.length === 1 ? '' : 's'} com erro bloqueada${erros.length === 1 ? '' : 's'}`);
  if (avisos.length > 0) parts.push(`${avisos.length} aviso${avisos.length === 1 ? '' : 's'} em telefone/e-mail de gestor`);

  const detalhes = [...erros, ...avisos].slice(0, 8).map(formatIssue);
  if (detalhes.length === 0) return parts.join(' · ');
  const extra = erros.length + avisos.length - detalhes.length;
  return `${parts.join(' · ')}\n${detalhes.join('\n')}${extra > 0 ? `\n... mais ${extra} ocorrência${extra === 1 ? '' : 's'}` : ''}`;
}

/**
 * Pacote de clínicas (lib/pacote-clinicas.ts): a chave da empresa e o que existe NELA para conferir o
 * cadastro de uma secretária (cargos, clínicas) e dar nome à clínica escolhida. Toda leitura com o
 * `empresa_id` no WHERE (o app roda em service-role). Falha de leitura LANÇA: cadastrar sem conferir
 * seria aceitar qualquer id que o navegador mandasse.
 *
 * Helper local (não exportado): num arquivo `'use server'` todo export vira endpoint HTTP.
 */
async function referenciaDoPacote(sb: any, empresaId: string): Promise<{
  ligado: boolean;
  ref: ReferenciaCadastroPacote;
  nomeDaClinica: Map<string, string>;
}> {
  const { data: empresa, error: eE } = await sb.from('empresas').select('sys_config').eq('id', empresaId).maybeSingle();
  if (eE) throw new Error(`não foi possível ler a configuração da empresa: ${eE.message}`);
  const ligado = pacoteClinicasLigado(empresa?.sys_config);
  if (!ligado) return { ligado, ref: { cargos: [], clinicas: [], modelos: [] }, nomeDaClinica: new Map() };
  const [{ data: cargos, error: eC }, { data: clinicas, error: eL }] = await Promise.all([
    sb.from('cargos_empresa').select('nome').eq('empresa_id', empresaId),
    sb.from('escolas').select('id, nome').eq('empresa_id', empresaId),
  ]);
  if (eC) throw new Error(`não foi possível ler os cargos da empresa: ${eC.message}`);
  if (eL) throw new Error(`não foi possível ler as clínicas da empresa: ${eL.message}`);
  return {
    ligado,
    ref: {
      cargos: (cargos || []).map((c: any) => String(c.nome || '').trim()).filter(Boolean),
      clinicas: (clinicas || []).map((c: any) => c.id),
      modelos: MODELOS_CLINICA.map((m) => m.codigo),
    },
    nomeDaClinica: new Map((clinicas || []).map((c: any) => [c.id, c.nome])),
  };
}

// Loaders chamados no mount de client components: gate via protectedLoader —
// sessão expirada/bot recebe o fallback em vez de estourar erro no Sentry.
const _loadEmpresas = protectedLoader<[], any[]>([], async () => {
  const sb = await requireAdminSupabase();
  const { data } = await sb.from('empresas').select('id, nome, segmento').order('nome');
  return data || [];
});

export async function loadEmpresas() {
  return _loadEmpresas();
}

const _loadResumoEmpresa = protectedLoader({ colabs: 0, competencias: 0 }, async (_ctx, empresaId: any) => {
  const sb = await requireAdminSupabase();
  const { count: colabs } = await excludeInternalEmails(sb.from('colaboradores')
    .select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId)); // exclui internos @vertho.ai
  const { data: comps } = await sb.from('competencias')
    .select('cod_comp').eq('empresa_id', empresaId);
  return { colabs: colabs || 0, competencias: comps?.length || 0 };
});

export async function loadResumoEmpresa(empresaId: any) {
  return _loadResumoEmpresa(empresaId);
}

const ImportarLoteSchema = z.object({
  empresaId: z.string().uuid(),
  colabs: z.array(z.record(z.string(), z.any())).max(10000),
});

const _importarColaboradoresLote = protectedAction('users.manage', ImportarLoteSchema, async (ctx, { empresaId, colabs }) => {
  await assertTenantAccessAction(ctx, empresaId);
  const sb = await requireAdminSupabase();
  // Pacote de clínicas: a planilha gravaria cargo em texto livre, sem clínica e sem modelo.
  if ((await referenciaDoPacote(sb, empresaId)).ligado) throw new Error(MOTIVO_IMPORTACAO_FECHADA);
  const emailsExistentes = new Set(await listEmailsInTenant(sb, empresaId));
  const emailsArquivo = new Set<string>();
  // Telefones que já logam por WhatsApp (banco + linhas deste arquivo): o índice único parcial
  // `(empresa_id, telefone) WHERE login_por_whatsapp` derrubaria o INSERT do lote inteiro.
  const telefonesComLogin = new Set(await listTelefonesLoginWhatsappInTenant(sb, empresaId));
  const erros: any[] = [];
  const avisos: any[] = [];
  let duplicados = 0;

  const novos = (colabs || []).reduce<Record<string, any>[]>((acc, c: any, index: number) => {
    const linha = index + 2;
    const nome = normalizeText(c.nome);
    let email = normalizeEmail(c.email);
    const wa = validateWhatsApp(c.telefone);
    let loginPorWhatsapp = false;
    let telefone: string | null;

    if (isValidEmail(email)) {
      telefone = normalizePhone(c.telefone);
      if (hasValue(c.telefone) && !telefone) {
        avisos.push({ linha, nome, campo: 'telefone/celular', valor: c.telefone, motivo: 'formato inválido; campo não salvo' });
      }
      // E-mail REAL + telefone → loga pelos DOIS, como em `criarColaborador`. Sem a flag a rota
      // de telefone é anti-enumeração: responde sucesso e não envia nada (Amazon Bowling, 30/09).
      if (telefone) {
        if (telefonesComLogin.has(telefone)) {
          avisos.push({ linha, nome, campo: 'telefone/celular', valor: c.telefone, motivo: 'telefone já usado por outra pessoa da empresa; login por WhatsApp não habilitado (entra por e-mail)' });
        } else {
          loginPorWhatsapp = true;
        }
      }
    } else if (wa.valid === true) {
      // Sem e-mail → login por WhatsApp (email-proxy interno determinístico).
      email = proxyEmailFromPhone(empresaId, wa.e164);
      telefone = wa.e164;
      loginPorWhatsapp = true;
    } else {
      erros.push({ linha, nome, campo: 'email', valor: c.email, motivo: 'sem e-mail válido e sem WhatsApp válido (com indicativo do país, ou DDD + 9 + 8 dígitos no Brasil); linha não importada' });
      return acc;
    }

    // Dedup pelo e-mail efetivo (real ou proxy) — cobre telefone repetido.
    if (emailsExistentes.has(email!) || emailsArquivo.has(email!)) {
      duplicados += 1;
      return acc;
    }
    emailsArquivo.add(email!);
    // Só reserva o telefone de quem entra de fato (linha descartada por duplicidade não segura).
    if (loginPorWhatsapp && telefone) telefonesComLogin.add(telefone);

    const gestorEmail = normalizeEmail(c.gestor_email);
    if (hasValue(c.gestor_email) && !isValidEmail(gestorEmail)) {
      avisos.push({ linha, nome, campo: 'gestor_email', valor: c.gestor_email, motivo: 'e-mail inválido; campo não salvo' });
    }

    const gestorWhatsapp = normalizePhone(c.gestor_whatsapp);
    if (hasValue(c.gestor_whatsapp) && !gestorWhatsapp) {
      avisos.push({ linha, nome, campo: 'gestor_whatsapp', valor: c.gestor_whatsapp, motivo: 'formato inválido; campo não salvo' });
    }

    const role = normalizeText(c.role)?.toLowerCase();
    acc.push({
      nome_completo: nome,
      email,
      cargo: normalizeText(c.cargo),
      area_depto: normalizeText(c.area_depto),
      role: VALID_ROLES.includes(role || '') ? role : 'colaborador',
      telefone,
      gestor_nome: normalizeText(c.gestor_nome),
      gestor_email: isValidEmail(gestorEmail) ? gestorEmail : null,
      gestor_whatsapp: gestorWhatsapp,
      login_por_whatsapp: loginPorWhatsapp,
    });
    return acc;
  }, []);

  if (novos.length === 0) {
    return { message: buildImportMessage(0, duplicados, erros, avisos), importados: 0, duplicados, erros, avisos };
  }
  await createColaboradoresLoteInTenant(sb, empresaId, novos);
  return { message: buildImportMessage(novos.length, duplicados, erros, avisos), importados: novos.length, duplicados, erros, avisos };
});

export async function importarColaboradoresLote(input: z.infer<typeof ImportarLoteSchema>) {
  return _importarColaboradoresLote(input);
}

/**
 * A turma ATIVA de cada pessoa da empresa (`colaborador_id` -> turma), ou `null` se a leitura
 * falhou. A lista de pessoas usa o resultado para o filtro por turma, e a diferença importa:
 * `undefined` na linha da pessoa é "não sei", e o filtro nunca o trata como "sem turma".
 */
async function turmaAtivaPorColaborador(sb: any, empresaId: string): Promise<Map<string, { id: string; nome: string }> | null> {
  const membros = await lerTudoPaginado((de: number, ate: number) => sb.from('turma_membros')
    .select('id, colaborador_id, turma_id')
    .eq('empresa_id', empresaId)
    .eq('status', TURMA_MEMBRO.ATIVO)
    .order('id')
    .range(de, ate));
  const { data: turmas, error } = await sb.from('turmas').select('id, nome').eq('empresa_id', empresaId);
  if (membros.error || error) return null;
  const nomePorTurma = new Map<string, string>((turmas || []).map((t: any) => [t.id, t.nome]));
  const mapa = new Map<string, { id: string; nome: string }>();
  for (const m of membros.data as any[]) {
    if (nomePorTurma.has(m.turma_id)) mapa.set(m.colaborador_id, { id: m.turma_id, nome: nomePorTurma.get(m.turma_id)! });
  }
  return mapa;
}

const _loadColaboradores = protectedLoader<[any], any[]>([], async (_ctx, empresaId) => {
  const sb = await requireAdminSupabase();
  const { data: d1, error: e1 } = await sb.from('colaboradores')
    // `escola_id` (a clínica, no pacote de clínicas) e `recepcao_modelo` (mig 297) vêm para a lista e a edição.
    .select('id, nome_completo, email, cargo, role, area_depto, telefone, gestor_nome, gestor_email, gestor_whatsapp, mapeamento_em, login_por_whatsapp, escola_id, recepcao_modelo')
    .eq('empresa_id', empresaId)
    .order('nome_completo');
  // sem_email_real = e-mail é o proxy interno (login só por WhatsApp). A UI mostra
  // o badge por ISTO (não por login_por_whatsapp), pois um colab pode logar por
  // WhatsApp E ter e-mail real — aí o e-mail aparece normalmente.
  if (!e1) {
    const turmaDe = await turmaAtivaPorColaborador(sb, empresaId);
    return (d1 || []).map((c: any) => ({
      ...c,
      sem_email_real: isProxyEmail(c.email),
      // string = turma ativa · null = sem turma · undefined = não foi possível ler (o filtro não adivinha)
      turma_id: turmaDe ? (turmaDe.get(c.id)?.id ?? null) : undefined,
      turma_nome: turmaDe ? (turmaDe.get(c.id)?.nome ?? null) : undefined,
    }));
  }
  const { data: d2 } = await sb.from('colaboradores')
    .select('id, nome_completo, email, cargo, role, area_depto, mapeamento_em')
    .eq('empresa_id', empresaId)
    .order('nome_completo');
  return (d2 || []).map((c: any) => ({ ...c, telefone: null, gestor_nome: null, gestor_email: null, gestor_whatsapp: null, login_por_whatsapp: false, sem_email_real: isProxyEmail(c.email) }));
});

export async function loadColaboradores(empresaId: any) {
  return _loadColaboradores(empresaId);
}

/**
 * Opções do cadastro no pacote de clínicas: se a chave está ligada, os cargos e as clínicas da empresa
 * e os modelos de clínica do simulador. Sem a chave, `pacote: false` e a tela segue como sempre.
 */
const _loadOpcoesCadastro = protectedLoader<[any], {
  pacote: boolean;
  cargos: string[];
  clinicas: Array<{ id: string; nome: string }>;
  modelos: Array<{ codigo: string; nome: string; descricao: string }>;
  erro?: string;
}>({ pacote: false, cargos: [], clinicas: [], modelos: [] }, async (_ctx, empresaId) => {
  const sb = await requireAdminSupabase();
  try {
    const { ligado, ref, nomeDaClinica } = await referenciaDoPacote(sb, empresaId);
    if (!ligado) return { pacote: false, cargos: [], clinicas: [], modelos: [] };
    const clinicas = [...nomeDaClinica.entries()]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return { pacote: true, cargos: [...ref.cargos].sort((a, b) => a.localeCompare(b, 'pt-BR')), clinicas, modelos: MODELOS_CLINICA.map((m) => ({ ...m })) };
  } catch (e: any) {
    // Pacote ligado e leitura falhou: a tela avisa em vez de cair no cadastro livre.
    return { pacote: true, cargos: [], clinicas: [], modelos: [], erro: e?.message || 'falha ao ler as opções do cadastro' };
  }
});

export async function loadOpcoesCadastro(empresaId: any) {
  return _loadOpcoesCadastro(empresaId);
}

const CriarClinicaSchema = z.object({
  empresaId: z.string().uuid(),
  nome: z.string().trim().min(2).max(120),
});

/**
 * Cadastra uma clínica (a unidade da secretária, tabela `escolas`) direto pelo admin, sem depender do
 * "Normalizar" das redes de ensino (que tira prefixos de escola e trata "secretaria" como central).
 * Nome repetido na empresa, sem diferenciar maiúsculas, devolve a clínica que já existe.
 */
const _criarClinica = protectedAction('users.manage', CriarClinicaSchema, async (ctx, { empresaId, nome }) => {
  await assertTenantAccessAction(ctx, empresaId);
  const sb = await requireAdminSupabase();
  const { ligado } = await referenciaDoPacote(sb, empresaId);
  if (!ligado) throw new Error('o cadastro de clínicas é do pacote de clínicas, que não está ligado nesta empresa');
  const nomeLimpo = nome.replace(/\s+/g, ' ').trim();
  const { data: existentes, error: eL } = await sb.from('escolas').select('id, nome').eq('empresa_id', empresaId);
  if (eL) throw new Error(`não foi possível ler as clínicas da empresa: ${eL.message}`);
  const chave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const igual = (existentes || []).find((c: any) => chave(c.nome || '') === chave(nomeLimpo));
  if (igual) return { id: igual.id, nome: igual.nome, existia: true };
  const { data: nova, error: eI } = await sb.from('escolas')
    .insert({ empresa_id: empresaId, nome: nomeLimpo, is_central: false })
    .select('id, nome').single();
  if (eI) throw new Error(`não foi possível cadastrar a clínica: ${eI.message}`);
  await logAdminAction({
    adminEmail: ctx.email, acao: 'clinica.criar', empresaId, empresaSlug: undefined,
    alvo: nomeLimpo, detalhes: { escola_id: nova.id },
  });
  return { id: nova.id, nome: nova.nome, existia: false };
});

export async function criarClinica(input: z.infer<typeof CriarClinicaSchema>) {
  return _criarClinica(input);
}

const RelatorioClinicasSchema = z.object({ empresaId: z.string().uuid() });

/**
 * Relatório das clínicas sob demanda (o cron é toda segunda às 07h): na semana de entrada a onlabel
 * precisa da lista de pendentes antes da segunda. A prévia monta o e-mail sem enviar; o envio usa a
 * mesma deduplicação do cron (um por dia por destinatário).
 */
const _previewRelatorioClinicas = protectedAction('assessments.dispatch', RelatorioClinicasSchema, async (ctx, { empresaId }) => {
  await assertTenantAccessAction(ctx, empresaId);
  const { executarRelatorioClinicas } = await import('@/lib/relatorio-clinicas/enviar');
  const r = await executarRelatorioClinicas(await requireAdminSupabase(), { empresaId, enviar: false });
  const e = r.empresas[0];
  if (!e) throw new Error('o pacote de clínicas não está ligado nesta empresa');
  if (e.erro) throw new Error(e.erro);
  return { assunto: e.assunto, html: e.html, clinicas: e.clinicas, pessoas: e.pessoas, pendentes: e.pendentes, destinatarios: e.destinatarios };
});

export async function previewRelatorioClinicas(input: z.infer<typeof RelatorioClinicasSchema>) {
  return _previewRelatorioClinicas(input);
}

const _enviarRelatorioClinicasAgora = protectedAction('assessments.dispatch', RelatorioClinicasSchema, async (ctx, { empresaId }) => {
  await assertTenantAccessAction(ctx, empresaId);
  const { executarRelatorioClinicas } = await import('@/lib/relatorio-clinicas/enviar');
  const r = await executarRelatorioClinicas(await requireAdminSupabase(), { empresaId, enviar: true });
  const e = r.empresas[0];
  if (!e) throw new Error('o pacote de clínicas não está ligado nesta empresa');
  await logAdminAction({
    adminEmail: ctx.email, acao: 'relatorio_clinicas.enviar', empresaId, empresaSlug: undefined,
    alvo: `${e.enviados.length} destinatário(s)`,
    detalhes: { enviados: e.enviados, jaRecebidosHoje: e.jaRecebidosHoje, falhas: e.falhas, erro: e.erro ?? null, clinicas: e.clinicas, pessoas: e.pessoas },
  });
  if (e.erro) throw new Error(e.erro);
  return { enviados: e.enviados, jaRecebidosHoje: e.jaRecebidosHoje, falhas: e.falhas };
});

export async function enviarRelatorioClinicasAgora(input: z.infer<typeof RelatorioClinicasSchema>) {
  return _enviarRelatorioClinicasAgora(input);
}

/** Export XLSX da base de colaboradores da empresa (base64). Client decodifica → Blob → download. */
const _exportarColaboradoresXLSX = protectedLoader<[any], { ok: true; base64: string; n: number } | { ok: false; error: string }>(
  { ok: false, error: 'Sessão expirada ou sem permissão' },
  async (ctx, empresaId) => {
  if (!empresaId) return { ok: false, error: 'empresa obrigatória' };
  const locale = await getLocale();

  const sb = await requireAdminSupabase();
  const [{ data: emp }, colabs] = await Promise.all([
    sb.from('empresas').select('nome').eq('id', empresaId).single(),
    loadColaboradores(empresaId),
  ]);
  if (!colabs.length) return { ok: false, error: 'Nenhum colaborador para exportar' };

  const COLS = [
    { h: 'Nome', k: 'nome_completo', w: 28 },
    { h: 'Email', k: 'email', w: 30 },
    { h: 'Cargo', k: 'cargo', w: 22 },
    { h: 'Área / Depto', k: 'area_depto', w: 20 },
    { h: 'Role', k: 'role', w: 12 },
    { h: 'WhatsApp', k: 'telefone', w: 16 },
    { h: 'Gestor', k: 'gestor_nome', w: 24 },
    { h: 'Gestor (email)', k: 'gestor_email', w: 28 },
    { h: 'Gestor (WhatsApp)', k: 'gestor_whatsapp', w: 18 },
    { h: 'Mapeado em', k: 'mapeamento_em', w: 18 },
  ];

  const fmtData = (v: any) => {
    if (!v) return '';
    const d = new Date(v);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
  };

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Colaboradores');

  const titulo = `Colaboradores — ${emp?.nome || 'empresa'} — exportado em ${new Date().toLocaleDateString(locale)} (${colabs.length})`;
  ws.addRow([titulo]);
  ws.mergeCells(1, 1, 1, COLS.length);
  ws.getRow(1).font = { italic: true, size: 9, color: { argb: 'FF888888' } };

  const head = ws.addRow(COLS.map(c => c.h));
  head.font = { bold: true };
  head.eachCell((c: any) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2B54' } }; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });

  for (const colab of colabs as any[]) {
    ws.addRow(COLS.map(c => {
      if (c.k === 'mapeamento_em') return fmtData(colab[c.k]);
      if (c.k === 'email') return colab.login_por_whatsapp ? '(login por WhatsApp)' : (colab.email ?? '');
      return colab[c.k] ?? '';
    }));
  }

  ws.views = [{ state: 'frozen', ySplit: 2 }];
  ws.columns.forEach((col: any, i: number) => { col.width = COLS[i]?.w || 14; });

  const buf = await wb.xlsx.writeBuffer();
  await logAdminAction({
    adminEmail: ctx.email, acao: 'colaboradores.export', empresaId, empresaSlug: undefined,
    alvo: `${colabs.length} colaboradores`, detalhes: { empresa: emp?.nome, formato: 'xlsx', n: colabs.length },
  });
  return { ok: true, base64: Buffer.from(buf as any).toString('base64'), n: colabs.length };
}, 'exports.run');

export async function exportarColaboradoresXLSX(empresaId: any) {
  return _exportarColaboradoresXLSX(empresaId);
}

const CriarColaboradorSchema = z.object({
  empresaId: z.string().uuid(),
  campos: z.object({
    nome_completo: z.string().nullish(),
    email: z.string().nullish(),
    telefone: z.string().nullish(),
    cargo: z.string().nullish(),
    area_depto: z.string().nullish(),
    gestor_nome: z.string().nullish(),
    gestor_email: z.string().nullish(),
    gestor_whatsapp: z.string().nullish(),
    role: z.string().nullish(),
    // Pacote de clínicas: a clínica (id de `escolas`) e o modelo do simulador. Ignorados sem a chave.
    escola_id: z.string().max(64).nullish(),
    recepcao_modelo: z.string().max(40).nullish(),
  }),
});

const _criarColaborador = protectedAction('users.manage', CriarColaboradorSchema, async (ctx, { empresaId, campos }) => {
  await assertTenantAccessAction(ctx, empresaId); // defense-in-depth (no-op p/ platform admin)

  let email = normalizeEmail(campos?.email);
  const wa = validateWhatsApp(campos?.telefone);
  let loginPorWhatsapp = false;
  let telefone: string | null;

  if (isValidEmail(email)) {
    telefone = normalizePhone(campos.telefone);
    if (hasValue(campos.telefone) && !telefone) throw new Error('telefone/celular inválido. Use o indicativo do país (ex.: +351926360862) ou, no Brasil, DDD + número (ex.: 11999998888).');
    // Tem e-mail REAL + telefone → loga pelos DOIS (e-mail E WhatsApp). Sem
    // telefone, só e-mail. O auth.users é criado no 1º login (verify/magic-link).
    loginPorWhatsapp = !!telefone;
  } else if (wa.valid === true) {
    // Sem e-mail → login por WhatsApp (email-proxy interno determinístico).
    email = proxyEmailFromPhone(empresaId, wa.e164);
    telefone = wa.e164;
    loginPorWhatsapp = true;
  } else {
    throw new Error('informe um e-mail válido OU um WhatsApp válido (com indicativo do país, ex.: +351926360862; no Brasil, DDD + 9 + 8 dígitos)');
  }

  const gestorEmail = normalizeEmail(campos.gestor_email);
  if (hasValue(campos.gestor_email) && !isValidEmail(gestorEmail)) throw new Error('email do gestor inválido');
  const gestorWhatsapp = normalizePhone(campos.gestor_whatsapp);
  if (hasValue(campos.gestor_whatsapp) && !gestorWhatsapp) throw new Error('whatsapp do gestor inválido. Use o indicativo do país (ex.: +351926360862) ou, no Brasil, DDD + número (ex.: 11999998888).');

  const sb = await requireAdminSupabase();
  if (await emailExistsInTenant(sb, empresaId, email)) {
    throw new Error(loginPorWhatsapp ? 'já existe colaborador com este WhatsApp nesta empresa' : 'já existe colaborador com este email nesta empresa');
  }

  const role = VALID_ROLES.includes(campos.role as string) ? campos.role : 'colaborador';
  // Pacote de clínicas: a secretária nasce com clínica, cargo da lista e modelo do simulador, conferidos
  // contra o que existe NA EMPRESA. A área passa a ser o nome da clínica (a lista e a exportação a leem).
  const pacote = await referenciaDoPacote(sb, empresaId);
  const extrasDoPacote: Record<string, any> = {};
  if (pacote.ligado && papelExigeCadastroDoPacote(role)) {
    const erro = erroDoCadastroPacote(
      { cargo: campos.cargo, escolaId: campos.escola_id, recepcaoModelo: campos.recepcao_modelo },
      pacote.ref,
    );
    if (erro) throw new Error(erro);
    extrasDoPacote.escola_id = campos.escola_id;
    extrasDoPacote.recepcao_modelo = campos.recepcao_modelo || null;
    extrasDoPacote.area_depto = pacote.nomeDaClinica.get(campos.escola_id as string) || null;
  }

  const novo = await createColaboradorInTenant(sb, empresaId, {
    email,
    nome_completo: campos.nome_completo?.trim() || null,
    cargo: campos.cargo?.trim() || null,
    area_depto: campos.area_depto?.trim() || null,
    telefone,
    gestor_nome: campos.gestor_nome?.trim() || null,
    gestor_email: gestorEmail,
    gestor_whatsapp: gestorWhatsapp,
    role,
    login_por_whatsapp: loginPorWhatsapp,
    ...extrasDoPacote,
  });
  return { id: novo.id };
});

export async function criarColaborador(input: z.infer<typeof CriarColaboradorSchema>) {
  return _criarColaborador(input);
}

const AtualizarColaboradorSchema = z.object({
  empresaId: z.string().uuid(),
  id: z.string().uuid(),
  // forma livre; a normalização/validação SEMÂNTICA (email/telefone) fica no corpo
  campos: z.object({
    nome_completo: z.string().nullish(),
    email: z.string().nullish(),
    cargo: z.string().nullish(),
    area_depto: z.string().nullish(),
    telefone: z.string().nullish(),
    gestor_nome: z.string().nullish(),
    gestor_email: z.string().nullish(),
    gestor_whatsapp: z.string().nullish(),
    role: z.string().nullish(),
    // Pacote de clínicas: a clínica (id de `escolas`) e o modelo do simulador. Ignorados sem a chave.
    escola_id: z.string().max(64).nullish(),
    recepcao_modelo: z.string().max(40).nullish(),
  }),
});

const _atualizarColaborador = protectedAction('users.manage', AtualizarColaboradorSchema, async (ctx, { empresaId, id, campos }) => {
  // Defense-in-depth: valida que o admin pode operar NESTE tenant (no-op p/ platform
  // admin). O isolamento REAL agora vem do repo — empresa_id embutido no WHERE.
  await assertTenantAccessAction(ctx, empresaId);

  const update: any = {};
  if (campos.nome_completo !== undefined) update.nome_completo = campos.nome_completo?.trim() || null;
  if (campos.email !== undefined) {
    const email = normalizeEmail(campos.email);
    if (!isValidEmail(email)) throw new Error('email inválido');
    update.email = email;
    // E-mail REAL cadastrado num colab que entrou por WhatsApp: cria o auth.users
    // do e-mail (idempotente) p/ ele poder logar TAMBÉM por e-mail. login_por_whatsapp
    // NÃO é alterado — se já era true, continua logando por WhatsApp também (a rota
    // de verificação passa a usar este e-mail real como identidade).
    if (!isProxyEmail(email)) {
      try {
        const sbAuth = await requireAdminSupabase();
        const { error: ce } = await sbAuth.auth.admin.createUser({ email, email_confirm: true });
        if (ce && !/already|registered|exists/i.test(ce.message)) console.warn('[atualizarColaborador] createUser:', ce.message);
      } catch (e: any) { console.warn('[atualizarColaborador] createUser:', e?.message); }
    }
  }
  if (campos.cargo !== undefined) update.cargo = campos.cargo?.trim() || null;
  if (campos.area_depto !== undefined) update.area_depto = campos.area_depto?.trim() || null;
  if (campos.telefone !== undefined) {
    const telefone = normalizePhone(campos.telefone);
    if (hasValue(campos.telefone) && !telefone) throw new Error('telefone/celular inválido. Use o indicativo do país (ex.: +351926360862) ou, no Brasil, DDD + número (ex.: 11999998888).');
    update.telefone = telefone;
  }
  if (campos.gestor_nome !== undefined) update.gestor_nome = campos.gestor_nome?.trim() || null;
  if (campos.gestor_email !== undefined) {
    const gestorEmail = normalizeEmail(campos.gestor_email);
    if (hasValue(campos.gestor_email) && !isValidEmail(gestorEmail)) throw new Error('email do gestor inválido');
    update.gestor_email = gestorEmail;
  }
  if (campos.gestor_whatsapp !== undefined) {
    const gestorWhatsapp = normalizePhone(campos.gestor_whatsapp);
    if (hasValue(campos.gestor_whatsapp) && !gestorWhatsapp) throw new Error('whatsapp do gestor inválido. Use o indicativo do país (ex.: +351926360862) ou, no Brasil, DDD + número (ex.: 11999998888).');
    update.gestor_whatsapp = gestorWhatsapp;
  }
  if (campos.role !== undefined && VALID_ROLES.includes(campos.role as string)) update.role = campos.role;

  // Pacote de clínicas: o que vier de clínica, cargo e modelo é conferido contra a EMPRESA (só o que veio:
  // campo ausente não muda). O papel decide se a regra vale: a conta de RH não tem clínica nem modelo.
  const sbPacote = await requireAdminSupabase();
  const pacote = await referenciaDoPacote(sbPacote, empresaId);
  if (pacote.ligado) {
    const { data: atual, error: eR } = await sbPacote.from('colaboradores').select('role, cargo')
      .eq('empresa_id', empresaId).eq('id', id).maybeSingle();
    if (eR) throw new Error(`não foi possível ler a pessoa: ${eR.message}`);
    if (!atual) throw new Error('colaborador não encontrado nesta empresa');
    const role = update.role !== undefined ? update.role : atual.role;
    if (papelExigeCadastroDoPacote(role)) {
      const erro = erroDoCadastroPacote(
        { cargo: campos.cargo, escolaId: campos.escola_id, recepcaoModelo: campos.recepcao_modelo },
        pacote.ref,
        { parcial: true },
      );
      if (erro) throw new Error(erro);
      // Regra D9 revista (23/10/2026): o cargo só muda ANTES do diagnóstico. Depois da 1ª resposta, o
      // diagnóstico, o PDI e a trilha já foram montados para o cargo, e ele fica até o fim do programa.
      const cargoNovo = campos.cargo !== undefined ? (campos.cargo || '').trim() : null;
      if (cargoNovo !== null && cargoNovo !== String(atual.cargo || '').trim()) {
        const { count, error: eResp } = await sbPacote.from('respostas').select('id', { count: 'exact', head: true })
          .eq('empresa_id', empresaId).eq('colaborador_id', id);
        if (eResp) throw new Error(`não foi possível conferir o diagnóstico da pessoa: ${eResp.message}`);
        if ((count || 0) > 0) throw new Error(MOTIVO_CARGO_TRAVADO);
      }
      if (campos.escola_id !== undefined) {
        update.escola_id = campos.escola_id;
        update.area_depto = pacote.nomeDaClinica.get(campos.escola_id as string) || null;
      }
      if (campos.recepcao_modelo !== undefined) update.recepcao_modelo = campos.recepcao_modelo || null;
    }
  }

  const updated = await updateColaboradorInTenant(sbPacote, empresaId, id, update);
  if (!updated) throw new Error('colaborador não encontrado nesta empresa');
  return { id };
});

export async function atualizarColaborador(input: z.infer<typeof AtualizarColaboradorSchema>) {
  return _atualizarColaborador(input);
}

const PreviaExclusaoSchema = z.object({ empresaId: z.string().uuid(), id: z.string().uuid() });
const ExcluirColaboradorSchema = PreviaExclusaoSchema.extend({ confirmacao: z.string().regex(/^[0-9a-f]{64}$/) });
const _preverExclusaoColaborador = protectedAction('users.manage', PreviaExclusaoSchema, async (ctx, { empresaId, id }) => {
  // Gate explícito no corpo delegado: cada export `use server` é um endpoint.
  await requireAdminAction('users.manage');
  await assertTenantAccessAction(ctx, empresaId);
  return preverExclusaoPace(empresaId, { tipo: 'colaborador', id });
});
export async function preverExclusaoColaborador(input: z.infer<typeof PreviaExclusaoSchema>) {
  return _preverExclusaoColaborador(input);
}

const _excluirColaborador = protectedAction('users.manage', ExcluirColaboradorSchema, async (ctx, { empresaId, id, confirmacao }) => {
  await requireAdminAction('users.manage');
  await assertTenantAccessAction(ctx, empresaId); // defense-in-depth (no-op p/ platform admin)
  const removido = await excluirCadastroComBackupPace(empresaId, { tipo: 'colaborador', id }, confirmacao, ctx.email);
  if (!removido) throw new Error('colaborador não encontrado nesta empresa');
  await logAdminAction({
    adminEmail: ctx.email, acao: 'colaborador.excluir', empresaId,
    alvo: removido.nome_completo || id, detalhes: { colaboradorId: id },
  });
  return { id };
});

export async function excluirColaborador(input: z.infer<typeof ExcluirColaboradorSchema>) {
  return _excluirColaborador(input);
}

// ── Cargos ──────────────────────────────────────────────────────────────────

const _loadCargos = protectedLoader<[any], any[]>([], async (_ctx, empresaId) => {
  const sb = await requireAdminSupabase();
  const { data, error } = await sb.from('cargos_empresa')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('eh_vaga', false) // vagas vivem no Módulo de Seleção, não na lista de cargos operacionais
    .order('nome');
  if (error) return [];
  return data || [];
});

export async function loadCargos(empresaId: any) {
  return _loadCargos(empresaId);
}

// PILOTO Fase 2 — primeira action sobre `protectedAction`: a factory força
// auth (companies.manage) + validação Zod + retorno padronizado {success,...};
// o corpo só cuida da regra de negócio (e do tenant, via assertTenantAccessAction).
// O wrapper `export async function` mantém a compat com 'use server'.
const SalvarCargoSchema = z.object({
  empresaId: z.string().uuid(),
  cargo: z.object({
    id: z.string().uuid().optional(),
    nome: z.string().trim().min(1, 'Nome do cargo é obrigatório'),
    area_depto: z.string().nullish(),
    descricao: z.string().nullish(),
    principais_entregas: z.string().nullish(),
    contexto_cultural: z.string().nullish(),
    stakeholders: z.string().nullish(),
    decisoes_recorrentes: z.string().nullish(),
    tensoes_comuns: z.string().nullish(),
    eh_lideranca: z.boolean().optional(),
    // Mig 286 (plano de cenários de 11/10/2026): opcionais. Ausentes, ficam como estão no banco.
    fronteiras: z.string().nullish(),
    casos_reais: z.array(z.union([z.string(), z.object({ texto: z.string().nullish() }).passthrough()])).nullish(),
  }),
});
type SalvarCargoInput = z.infer<typeof SalvarCargoSchema>;

const _salvarCargo = protectedAction('companies.manage', SalvarCargoSchema, async (ctx, { empresaId, cargo }) => {
  await assertTenantAccessAction(ctx, empresaId); // defense-in-depth (no-op p/ platform admin)
  const sb = await requireAdminSupabase();
  const registro = {
    ...(cargo.id ? { id: cargo.id } : {}),
    nome: cargo.nome.trim(),
    area_depto: cargo.area_depto?.trim() || null,
    descricao: cargo.descricao?.trim() || null,
    principais_entregas: cargo.principais_entregas?.trim() || null,
    contexto_cultural: cargo.contexto_cultural?.trim() || null,
    stakeholders: cargo.stakeholders?.trim() || null,
    decisoes_recorrentes: cargo.decisoes_recorrentes?.trim() || null,
    tensoes_comuns: cargo.tensoes_comuns?.trim() || null,
    eh_lideranca: cargo.eh_lideranca !== false,
    // Fronteiras e casos reais (mig 286): só o que veio no pedido; quem salva sem eles não os zera.
    ...camposNovosDoCargo(cargo),
    updated_at: new Date().toISOString(),
  };
  const saved = await upsertCargoInTenant(sb, empresaId, registro);
  if (!saved) throw new Error('cargo não encontrado nesta empresa');
  await logAdminAction({
    adminEmail: ctx.email, acao: 'cargo.salvar', empresaId,
    alvo: registro.nome,
    detalhes: { modo: cargo.id ? 'editar' : 'criar', cargoId: saved.id ?? cargo.id, eh_lideranca: registro.eh_lideranca },
  });
  return saved;
});

export async function salvarCargo(input: SalvarCargoInput) {
  return _salvarCargo(input);
}

const ExcluirCargoSchema = z.object({ empresaId: z.string().uuid(), id: z.string().uuid() });

const _excluirCargo = protectedAction('companies.manage', ExcluirCargoSchema, async (ctx, { empresaId, id }) => {
  await assertTenantAccessAction(ctx, empresaId); // defense-in-depth (no-op p/ platform admin)
  const sb = await requireAdminSupabase();
  const removido = await deleteCargoInTenant(sb, empresaId, id);
  if (!removido) throw new Error('cargo não encontrado nesta empresa');
  await logAdminAction({
    adminEmail: ctx.email, acao: 'cargo.excluir', empresaId,
    alvo: removido.nome || id, detalhes: { cargoId: id },
  });
  return { id };
});

export async function excluirCargo(input: z.infer<typeof ExcluirCargoSchema>) {
  return _excluirCargo(input);
}

const _sincronizarCargosDeColaboradores = protectedLoader<[any], { success: boolean; message?: string; error?: string }>(
  { success: false, error: 'Sessão expirada ou sem permissão' },
  async (_ctx, empresaId) => {
  const sb = await requireAdminSupabase();
  const { data: colabs } = await sb.from('colaboradores')
    .select('cargo, area_depto')
    .eq('empresa_id', empresaId)
    .not('cargo', 'is', null);

  const cargosMap: Record<string, string | null> = {};
  (colabs || []).forEach((c: any) => {
    if (c.cargo && !cargosMap[c.cargo]) {
      cargosMap[c.cargo] = c.area_depto || null;
    }
  });

  const { data: existentes } = await sb.from('cargos_empresa')
    .select('nome').eq('empresa_id', empresaId);
  const existSet = new Set((existentes || []).map((c: any) => c.nome.toLowerCase()));

  const novos = Object.entries(cargosMap)
    .filter(([nome]) => !existSet.has(nome.toLowerCase()))
    .map(([nome, area]) => ({
      empresa_id: empresaId,
      nome,
      area_depto: area,
    }));

  if (novos.length === 0) return { success: true, message: 'Todos os cargos já estavam cadastrados' };

  const { error } = await sb.from('cargos_empresa').insert(novos);
  if (error) return { success: false, error: error.message };
  return { success: true, message: `${novos.length} cargos sincronizados dos colaboradores` };
}, 'companies.manage');

export async function sincronizarCargosDeColaboradores(empresaId: any) {
  return _sincronizarCargosDeColaboradores(empresaId);
}

const _importarCargosLote = protectedLoader<[any, any[]], { success: boolean; message?: string; error?: string }>(
  { success: false, error: 'Sessão expirada ou sem permissão' },
  async (_ctx, empresaId, cargos) => {
  if (!empresaId || !cargos?.length) return { success: false, error: 'Dados incompletos' };

  const sb = await requireAdminSupabase();
  const { data: existentes, error: errExistentes } = await sb.from('cargos_empresa')
    .select('id, nome, top5_workshop').eq('empresa_id', empresaId);
  // Falha de leitura não vira "nenhum cargo existe" (o import inseriria duplicatas).
  if (errExistentes) return { success: false, error: `Não foi possível ler os cargos: ${errExistentes.message}` };

  // Cargo novo entra inteiro; cargo existente ganha só os casos reais e as fronteiras da planilha (lib/cargos-import).
  const plano = planoDoImportDeCargos(existentes || [], cargos);

  if (plano.novos.length) {
    const { error } = await sb.from('cargos_empresa').insert(plano.novos.map((c) => ({ ...c, empresa_id: empresaId })));
    if (error) return { success: false, error: error.message };
  }
  let atualizados = 0;
  for (const u of plano.atualizar) {
    const { error } = await sb.from('cargos_empresa')
      .update({ ...u.campos, updated_at: new Date().toISOString() })
      .eq('id', u.id).eq('empresa_id', empresaId);
    if (error) {
      return { success: false, error: `${plano.novos.length} cargos importados e ${atualizados} atualizados; falhou ao atualizar "${u.nome}": ${error.message}` };
    }
    atualizados++;
  }

  // Caso com competência fora do Top 5 do cargo: gravado, mas nenhum cenário o usaria. Diz qual.
  const avisos = plano.avisos.length ? ` · atenção: ${plano.avisos.slice(0, 5).join('; ')}${plano.avisos.length > 5 ? ` (e mais ${plano.avisos.length - 5})` : ''}` : '';
  if (!plano.novos.length && !atualizados) return { success: true, message: `Todos os cargos já estavam cadastrados e a planilha não trouxe casos reais nem fronteiras${avisos}` };
  return {
    success: true,
    message: `${plano.novos.length} cargos importados · ${atualizados} com casos reais ou fronteiras atualizados · ${plano.ignorados} sem mudança${avisos}`,
  };
}, 'companies.manage');

export async function importarCargosLote(empresaId: any, cargos: any[]) {
  return _importarCargosLote(empresaId, cargos);
}

/**
 * Para colaboradores com gestor_nome preenchido mas gestor_email vazio,
 * tenta achar um colaborador da mesma empresa cujo nome bate com gestor_nome
 * (ilike, case-insensitive). Quando acha, copia o email pra gestor_email.
 *
 * Resolve casos de importação onde só veio o nome do gestor, não o email.
 *
 * Retorna relatório com vinculados / não-encontrados / ambíguos (mais de 1 match).
 */
type DerivarGestorResult = {
  success: boolean;
  error?: string;
  vinculados: number;
  naoEncontrados: { colab: string; gestor_nome: string }[];
  ambiguos: { colab: string; gestor_nome: string; matches: number; motivo?: 'homonimos' | 'apenas-parcial' }[];
  /** Updates que o banco recusou — presente só quando houve alguma. */
  falhas?: { id: string; erro: string }[];
};

const _derivarGestorEmailPorNome = protectedLoader<[string], DerivarGestorResult>(
  { success: false, error: 'Sessão expirada ou sem permissão', vinculados: 0, naoEncontrados: [], ambiguos: [] },
  async (_ctx, empresaId) => {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório', vinculados: 0, naoEncontrados: [], ambiguos: [] };
  const sb = await requireAdminSupabase();

  // 1. Pega todos os colabs com gestor_nome mas sem gestor_email
  const { data: pendentes, error: errPendentes } = await sb.from('colaboradores')
    .select('id, nome_completo, gestor_nome')
    .eq('empresa_id', empresaId)
    .not('gestor_nome', 'is', null)
    .is('gestor_email', null);
  // Sem esta checagem, falha de leitura vira "nenhum pendente" — a tela diz
  // "0 vinculados" e o admin conclui que já estava tudo certo.
  if (errPendentes) {
    return { success: false, error: `Falha ao ler pendentes: ${errPendentes.message}`, vinculados: 0, naoEncontrados: [], ambiguos: [] };
  }

  if (!pendentes?.length) {
    return { success: true, vinculados: 0, naoEncontrados: [], ambiguos: [] };
  }

  // 2. Pega todos os colabs da empresa (potenciais gestores)
  const { data: todos, error: errTodos } = await sb.from('colaboradores')
    .select('id, nome_completo, email')
    .eq('empresa_id', empresaId);
  // Idem: lista vazia por falha viraria "nenhum gestor encontrado" para TODOS.
  if (errTodos) {
    return { success: false, error: `Falha ao ler colaboradores: ${errTodos.message}`, vinculados: 0, naoEncontrados: [], ambiguos: [] };
  }
  const candidatos = (todos || []).filter((c: any) => c.email);

  // Função de match: normaliza espaços, remove acentos, ilike
  const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

  const naoEncontrados: { colab: string; gestor_nome: string }[] = [];
  const ambiguos: DerivarGestorResult['ambiguos'] = [];
  const updates: { id: string; gestor_email: string }[] = [];

  // B10 (auditoria 22/08) — só o match EXATO vincula.
  //
  // O casamento antigo aceitava substring nos DOIS sentidos, e só desempatava
  // quando havia mais de um candidato: com um único parcial, "Ana" era vinculada
  // a "Mariana Souza" sem nada na tela. E `gestor_email` governa QUEM VÊ QUEM —
  // vínculo errado entrega a evolução de um liderado ao gestor errado. O campo
  // está preenchido em 299 de 400 colaboradores, ou seja, é caminho usado.
  //
  // Agora: exato vincula; parcial vira AMBÍGUO (fica visível para o admin
  // resolver, em vez de virar um vínculo silencioso).
  for (const p of pendentes as any[]) {
    const alvo = normalizar(p.gestor_nome);
    const exatos = candidatos.filter((c: any) => normalizar(c.nome_completo || '') === alvo);

    if (exatos.length === 1) {
      updates.push({ id: p.id, gestor_email: exatos[0].email.toLowerCase() });
      continue;
    }
    if (exatos.length > 1) {
      // Homônimos: ninguém pode decidir isto por nome.
      ambiguos.push({ colab: p.nome_completo, gestor_nome: p.gestor_nome, matches: exatos.length, motivo: 'homonimos' });
      continue;
    }

    const parciais = candidatos.filter((c: any) => {
      const nome = normalizar(c.nome_completo || '');
      return nome.includes(alvo) || alvo.includes(nome);
    });
    if (parciais.length === 0) {
      naoEncontrados.push({ colab: p.nome_completo, gestor_nome: p.gestor_nome });
    } else {
      ambiguos.push({ colab: p.nome_completo, gestor_nome: p.gestor_nome, matches: parciais.length, motivo: 'apenas-parcial' });
    }
  }

  // 3. Aplica updates (1 por colab) — contando ESCRITAS, não intenções.
  //
  // `vinculados: updates.length` reportava o que a função PRETENDIA fazer: o
  // laço não capturava `{ error }`, então falha de banco saía como "N vinculados".
  // O `.select('id')` faz o Postgres devolver as linhas realmente afetadas — se
  // o id não casar (linha de outro tenant, por exemplo), o update volta vazio
  // sem erro, e isso também não é vínculo.
  let vinculados = 0;
  const falhas: { id: string; erro: string }[] = [];
  for (const u of updates) {
    const { data: afetadas, error } = await sb.from('colaboradores')
      .update({ gestor_email: u.gestor_email })
      .eq('id', u.id)
      .eq('empresa_id', empresaId)
      .select('id');
    if (error) { falhas.push({ id: u.id, erro: error.message }); continue; }
    vinculados += afetadas?.length || 0;
  }

  return {
    success: true,
    vinculados,
    naoEncontrados,
    ambiguos,
    ...(falhas.length ? { falhas } : {}),
  };
}, 'users.manage');

export async function derivarGestorEmailPorNome(empresaId: string): Promise<DerivarGestorResult> {
  return _derivarGestorEmailPorNome(empresaId);
}
