/**
 * Pré-aquece os artefatos que as três visões da demo Grupo Sinal consomem.
 * Idempotente: reutiliza arquivos válidos e só gera o que estiver faltando.
 *
 * Uso: npx --yes tsx scripts/_prewarm-gruposinal-artifacts.ts
 */
import './_env';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from '@/actions/ai-client';
import { extractJSON } from '@/actions/utils';
import { CIS_COLUMNS, mapSupabaseToCISRawData } from '@/lib/supabase/mapCISProfile';
import { derivarArquetipo, derivarTagsExecutivas, insightsHardcoded } from '@/lib/disc-arquetipos';
import { promptDevolutivaComportamental } from '@/lib/prompts/devolutiva-comportamental';
import { extractNarration, generateNarrationAudio } from '@/lib/gemini-tts';
import { getModelForTask } from '@/lib/ai-tasks';
import { storageSlug } from '@/lib/storage-slug';
import { gerarRelatorioIndividualCore } from '@/lib/relatorios/individual-core';
import { RELATORIO_GESTOR_SYSTEM, RELATORIO_RH_SYSTEM } from '@/lib/relatorios/prompts';
import { getLogoCoverBase64 } from '@/lib/pdf-assets';
import RelatorioGestorPDF from '@/components/pdf/RelatorioGestor';
import RelatorioRHPDF from '@/components/pdf/RelatorioRH';
import RelatorioComportamentalPDF from '@/components/pdf/RelatorioComportamental';
import { aggregatePerfilOrg } from '@/lib/perfil-organizacional/aggregate';
import { renderPerfilOrgPDF } from '@/lib/perfil-organizacional-pdf';
import { aggregateDna } from '@/lib/dna-organizacional/aggregate';
import { gerarNarrativaDna } from '@/lib/dna-organizacional/narrative';
import { renderDnaPDF } from '@/lib/dna-organizacional-pdf';
import { colaboradoresComMapeamentoCompleto } from '@/lib/mapeamento-competencias';

const SLUG = 'gruposinal';
const PDF_BUCKET = 'relatorios-pdf';
const CONTENT_BUCKET = 'conteudos';
const TARGET_PDIS = new Set(['bruna.demo@vertho.ai', 'mariana.demo@vertho.ai']);
const FINANCE_FOCUS = [
  'Controle, Precisão e Confiabilidade dos Dados',
  'Análise de Indicadores Financeiros',
];
const FORCE_DERIVED = process.argv.includes('--force-derived');
const ONLY_DNA = process.argv.includes('--only-dna');

type SummaryItem = { tipo: string; alvo: string; status: 'gerado' | 'cache' | 'erro'; path?: string | null; error?: string };

const summary: SummaryItem[] = [];
const sb = createSupabaseAdmin();

function todayBR(): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

async function storageExists(bucket: string, path: string | null | undefined): Promise<boolean> {
  if (!path) return false;
  const parts = path.split('/');
  const name = parts.pop()!;
  const folder = parts.join('/');
  const { data, error } = await sb.storage.from(bucket).list(folder, { limit: 20, search: name });
  if (error) return false;
  return (data || []).some((item: any) => item.name === name && Number(item.metadata?.size || 0) > 0);
}

async function latestTenantPdf(folder: string, empresaId: string): Promise<string | null> {
  const { data, error } = await sb.storage.from(CONTENT_BUCKET).list(folder, { limit: 100, search: empresaId });
  if (error) throw new Error(`${folder}: ${error.message}`);
  const name = (data || [])
    .filter((item: any) => item.name.startsWith(`${empresaId}-`) && item.name.endsWith('.pdf') && Number(item.metadata?.size || 0) > 0)
    .sort((a: any, b: any) => b.name.localeCompare(a.name))[0]?.name;
  return name ? `${folder}/${name}` : null;
}

async function uploadReportPdf(empresaId: string, tipo: 'gestor' | 'rh', label: string, buffer: Buffer): Promise<string> {
  const path = `${empresaId}/${tipo}-${storageSlug(label, tipo)}-${Date.now()}.pdf`;
  const { error } = await sb.storage.from(PDF_BUCKET).upload(path, buffer, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (error) throw new Error(`upload ${tipo}: ${error.message}`);
  return path;
}

async function ensureBehavioralPdf(empresaId: string, colab: any) {
  if (await storageExists(PDF_BUCKET, colab.comportamental_pdf_path)) {
    summary.push({ tipo: 'pdf-comportamental', alvo: colab.nome_completo, status: 'cache', path: colab.comportamental_pdf_path });
    return;
  }
  const { data: fullRow, error: colabError } = await sb.from('colaboradores')
    .select(CIS_COLUMNS)
    .eq('id', colab.id)
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (colabError || !fullRow) throw new Error(colabError?.message || 'colaborador não encontrado');
  const full: any = fullRow;
  if (!full.report_texts) throw new Error('relatório comportamental sem textos congelados');

  const raw = mapSupabaseToCISRawData(full);
  const arquetipo = derivarArquetipo(full.perfil_dominante);
  const tags = derivarTagsExecutivas(full);
  const insights = Array.isArray((full as any).insights_executivos) && (full as any).insights_executivos.length
    ? (full as any).insights_executivos
    : insightsHardcoded(full.perfil_dominante);
  const buffer = await renderToBuffer(React.createElement(RelatorioComportamentalPDF, {
    data: { raw, texts: full.report_texts, arquetipo, tags, insights },
  }) as any);
  const path = `${empresaId}/comportamental-${storageSlug(full.nome_completo, 'relatorio')}-${Date.now()}.pdf`;
  const { error: uploadError } = await sb.storage.from(PDF_BUCKET).upload(path, buffer, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (uploadError) throw new Error(`upload comportamental: ${uploadError.message}`);
  const { error: updateError } = await sb.from('colaboradores')
    .update({ comportamental_pdf_path: path })
    .eq('id', full.id)
    .eq('empresa_id', empresaId);
  if (updateError) throw new Error(`persistir PDF comportamental: ${updateError.message}`);
  summary.push({ tipo: 'pdf-comportamental', alvo: colab.nome_completo, status: 'gerado', path });
}

async function validateDemoFocus(empresaId: string) {
  const { data: cargos, error: cargoError } = await sb.from('cargos_empresa')
    .select('id,nome,top5_workshop,competencia_foco,competencias_foco')
    .eq('empresa_id', empresaId)
    .in('nome', ['Representante Comercial', 'Analista Financeiro', 'Coordenador de Operações', 'Gerente Comercial']);
  if (cargoError) throw new Error(cargoError.message);
  for (const cargo of cargos || []) {
    const top5 = new Set(Array.isArray(cargo.top5_workshop) ? cargo.top5_workshop : []);
    const focos = Array.isArray(cargo.competencias_foco) && cargo.competencias_foco.length > 0
      ? cargo.competencias_foco
      : [cargo.competencia_foco].filter(Boolean);
    if (focos.length === 0 || focos.some((foco: string) => !top5.has(foco))) {
      throw new Error(`foco inválido em ${cargo.nome}: ${focos.join(', ') || '(vazio)'}`);
    }
  }
  const financeiro = (cargos || []).find((cargo: any) => cargo.nome === 'Analista Financeiro');
  if (!FINANCE_FOCUS.every((foco) => financeiro?.competencias_foco?.includes(foco))) {
    throw new Error('focos esperados do Financeiro não foram semeados pelo reset');
  }
}

async function ensureBehavioralAudio(empresa: any, colabRow: any) {
  if (await storageExists(PDF_BUCKET, colabRow.comportamental_audio_path)) {
    summary.push({ tipo: 'audio-comportamental', alvo: colabRow.nome_completo, status: 'cache', path: colabRow.comportamental_audio_path });
    return;
  }

  const { data: colabData, error: colabError } = await sb.from('colaboradores')
    .select(CIS_COLUMNS)
    .eq('id', colabRow.id)
    .eq('empresa_id', empresa.id)
    .maybeSingle();
  if (colabError || !colabData) throw new Error(colabError?.message || 'colaborador não encontrado');
  const colab: any = colabData;
  if (!colab.report_texts) throw new Error('relatório comportamental sem textos congelados');

  const raw = mapSupabaseToCISRawData(colab);
  const { data: cargoRow, error: cargoError } = await sb.from('cargos_empresa')
    .select('nome, area_depto, descricao, principais_entregas, stakeholders, decisoes_recorrentes, tensoes_comuns, contexto_cultural, eh_lideranca')
    .eq('empresa_id', empresa.id)
    .ilike('nome', colab.cargo)
    .limit(1)
    .maybeSingle();
  if (cargoError) throw new Error(`contexto do cargo: ${cargoError.message}`);

  const arquetipo = derivarArquetipo(colab.perfil_dominante);
  const primeiroNome = String(colab.nome_completo || 'você').split(' ')[0];
  const { system, user } = promptDevolutivaComportamental({
    primeiroNome,
    arquetipo,
    raw,
    texts: colab.report_texts,
    cargo: cargoRow || { nome: colab.cargo },
    empresaNome: empresa.nome,
  });
  const model = await getModelForTask(empresa.id, 'devolutiva_comportamental');
  const roteiro = await callAI(system, user, { model }, 1500, {
    taskKey: 'devolutiva_comportamental', empresaId: empresa.id, colaboradorId: colab.id,
  });
  const narracao = extractNarration(roteiro);
  if (!narracao.trim()) throw new Error('roteiro da devolutiva vazio');

  const audio = await generateNarrationAudio(narracao, {
    voice: process.env.GEMINI_TTS_DEVOLUTIVA_VOICE || 'Achird',
    style: 'Narre em português do Brasil, com voz masculina brasileira acolhedora, segura e íntima, ritmo moderado e pausas reflexivas naturais, como um mentor falando diretamente com a pessoa',
  });
  const path = `${empresa.id}/devolutiva-${storageSlug(colab.nome_completo, 'colab')}-${Date.now()}.mp3`;
  const { error: uploadError } = await sb.storage.from(PDF_BUCKET).upload(path, audio.buffer, {
    contentType: audio.contentType,
    upsert: true,
  });
  if (uploadError) throw new Error(`upload da devolutiva: ${uploadError.message}`);
  const audioAt = new Date().toISOString();
  const { error: updateError } = await sb.from('colaboradores')
    .update({ comportamental_audio_path: path, comportamental_audio_at: audioAt })
    .eq('id', colab.id)
    .eq('empresa_id', empresa.id);
  if (updateError) throw new Error(`persistir devolutiva: ${updateError.message}`);
  summary.push({ tipo: 'audio-comportamental', alvo: colab.nome_completo, status: 'gerado', path });
}

async function ensurePdi(empresaId: string, colab: any) {
  const { data: existing, error: existingError } = await sb.from('relatorios')
    .select('id,pdf_path,conteudo')
    .eq('empresa_id', empresaId)
    .eq('colaborador_id', colab.id)
    .eq('tipo', 'individual')
    .order('gerado_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  const competencias = Array.isArray(existing?.conteudo?.competencias) ? existing.conteudo.competencias : [];
  const niveisValidos = competencias.length > 0 && competencias.every((comp: any) => {
    const nivel = Number(comp?.nivel ?? comp?.nivel_atual);
    return Number.isInteger(nivel) && nivel >= 1 && nivel <= 4;
  });
  if (!FORCE_DERIVED && niveisValidos && existing?.pdf_path && await storageExists(PDF_BUCKET, existing.pdf_path)) {
    summary.push({ tipo: 'pdi', alvo: colab.nome_completo, status: 'cache', path: existing.pdf_path });
    return;
  }
  const result = await gerarRelatorioIndividualCore(sb as any, empresaId, colab.id);
  if (!result.success) throw new Error(result.error || 'PDI não gerado');
  const { data: generated, error: generatedError } = await sb.from('relatorios')
    .select('pdf_path')
    .eq('empresa_id', empresaId)
    .eq('colaborador_id', colab.id)
    .eq('tipo', 'individual')
    .order('gerado_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (generatedError || !generated?.pdf_path || !(await storageExists(PDF_BUCKET, generated.pdf_path))) {
    throw new Error(generatedError?.message || 'PDI salvo sem PDF');
  }
  summary.push({ tipo: 'pdi', alvo: colab.nome_completo, status: 'gerado', path: generated.pdf_path });
}

async function ensureManagerReport(empresa: any, colabs: any[]) {
  const gestora = colabs.find((c) => c.email === 'carla.demo@vertho.ai');
  if (!gestora) throw new Error('Carla não encontrada');
  const { data: existing, error: existingError } = await sb.from('relatorios')
    .select('id,pdf_path').eq('empresa_id', empresa.id).eq('colaborador_id', gestora.id).eq('tipo', 'gestor').maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (!FORCE_DERIVED && existing?.pdf_path && await storageExists(PDF_BUCKET, existing.pdf_path)) {
    summary.push({ tipo: 'relatorio-gestor', alvo: gestora.nome_completo, status: 'cache', path: existing.pdf_path });
    return;
  }

  const equipe = colabs.filter((c) => String(c.gestor_email || '').toLowerCase() === gestora.email);
  const { data: respostas, error: respostasError } = await sb.from('respostas')
    .select('colaborador_id,competencia_nome,avaliacao_ia,nivel_ia4')
    .eq('empresa_id', empresa.id)
    .not('avaliacao_ia', 'is', null);
  if (respostasError) throw new Error(respostasError.message);
  const porColab = new Map<string, any[]>();
  for (const resposta of respostas || []) {
    const items = porColab.get(resposta.colaborador_id) || [];
    items.push(resposta);
    porColab.set(resposta.colaborador_id, items);
  }
  const { data: cargos, error: cargosError } = await sb.from('cargos_empresa')
    .select('nome,top5_workshop')
    .eq('empresa_id', empresa.id);
  if (cargosError) throw new Error(cargosError.message);
  const totalPorCargo = new Map((cargos || []).map((cargo: any) => [
    String(cargo.nome || '').trim().toLocaleLowerCase('pt-BR'),
    Array.isArray(cargo.top5_workshop) ? cargo.top5_workshop.length : 0,
  ]));
  const membros = equipe.map((c) => ({
    nome: c.nome_completo,
    cargo: c.cargo,
    disc_dominante: c.perfil_dominante || '—',
    progresso_avaliacao: `${new Set((porColab.get(c.id) || []).map((r: any) => r.competencia_nome)).size}/${totalPorCargo.get(String(c.cargo || '').trim().toLocaleLowerCase('pt-BR')) || 0}`,
    status_avaliacao: (() => {
      const feitas = new Set((porColab.get(c.id) || []).map((r: any) => r.competencia_nome)).size;
      const total = totalPorCargo.get(String(c.cargo || '').trim().toLocaleLowerCase('pt-BR')) || 0;
      return total > 0 && feitas === total ? 'concluída' : feitas > 0 ? 'em andamento' : 'não iniciada';
    })(),
    competencias_avaliadas: (porColab.get(c.id) || []).map((r: any) => {
      const avaliacao = typeof r.avaliacao_ia === 'string' ? JSON.parse(r.avaliacao_ia) : r.avaliacao_ia;
      return { competencia: r.competencia_nome || '—', nivel: avaliacao?.consolidacao?.nivel_geral || r.nivel_ia4 || 0 };
    }),
  }));
  const disc = { D: 0, I: 0, S: 0, C: 0 } as Record<string, number>;
  for (const pessoa of equipe) {
    const key = String(pessoa.perfil_dominante || '').charAt(0).toUpperCase();
    if (key in disc) disc[key]++;
  }
  const user = `EMPRESA: ${empresa.nome} (${empresa.segmento || 'corporativo'})\nGESTOR: ${gestora.nome_completo} (${gestora.email})\nTOTAL EQUIPE: ${membros.length}\nDISC: D=${disc.D} I=${disc.I} S=${disc.S} C=${disc.C}\n\nDADOS DA EQUIPE:\n${JSON.stringify(membros, null, 2)}`;
  const model = await getModelForTask(empresa.id, 'relatorio_gestor');
  const raw = await callAI(RELATORIO_GESTOR_SYSTEM, user, { model }, 64000, { taskKey: 'relatorio_gestor', empresaId: empresa.id });
  const conteudo: any = await extractJSON(raw);
  if (!conteudo) throw new Error('IA não retornou o relatório do gestor em JSON');
  const geradoEm = new Date().toISOString();
  const buffer = await renderToBuffer(React.createElement(RelatorioGestorPDF, {
    data: { conteudo, gestor_nome: gestora.nome_completo, gerado_em: geradoEm },
    empresaNome: empresa.nome,
    logoBase64: getLogoCoverBase64() || undefined,
  }) as any);
  const path = await uploadReportPdf(empresa.id, 'gestor', `${empresa.nome}-${gestora.nome_completo}`, buffer);
  const { error: saveError } = await sb.from('relatorios').upsert({
    empresa_id: empresa.id,
    colaborador_id: gestora.id,
    tipo: 'gestor',
    conteudo: { ...conteudo, gestor_email: gestora.email, gestor_nome: gestora.nome_completo },
    pdf_path: path,
    gerado_em: geradoEm,
  }, { onConflict: 'empresa_id,colaborador_id,tipo' });
  if (saveError) throw new Error(`salvar relatório gestor: ${saveError.message}`);
  summary.push({ tipo: 'relatorio-gestor', alvo: gestora.nome_completo, status: 'gerado', path });
}

async function ensureRhReport(empresa: any, colabs: any[]) {
  const { data: existing, error: existingError } = await sb.from('relatorios')
    .select('id,pdf_path').eq('empresa_id', empresa.id).eq('tipo', 'rh').is('colaborador_id', null).maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (!FORCE_DERIVED && existing?.pdf_path && await storageExists(PDF_BUCKET, existing.pdf_path)) {
    summary.push({ tipo: 'relatorio-rh', alvo: empresa.nome, status: 'cache', path: existing.pdf_path });
    return;
  }
  const { data: respostasRaw, error: respostasError } = await sb.from('respostas')
    .select('colaborador_id,competencia_id,avaliacao_ia,nivel_ia4,nota_ia4')
    .eq('empresa_id', empresa.id)
    .not('avaliacao_ia', 'is', null);
  if (respostasError) throw new Error(respostasError.message);
  const [{ data: cargos, error: cargosError }, { data: assessments, error: assessmentsError }] = await Promise.all([
    sb.from('cargos_empresa').select('nome,top5_workshop').eq('empresa_id', empresa.id),
    sb.from('descriptor_assessments').select('colaborador_id,competencia').eq('empresa_id', empresa.id),
  ]);
  if (cargosError || assessmentsError) throw new Error(cargosError?.message || assessmentsError?.message);
  const completos = colaboradoresComMapeamentoCompleto(colabs, cargos || [], assessments || []);
  const respostas = (respostasRaw || []).filter((resposta: any) => completos.has(resposta.colaborador_id));
  if (!respostas?.length) throw new Error('nenhuma avaliação para o relatório RH');
  const colabMap = Object.fromEntries(colabs.map((c) => [c.id, c]));
  const compIds = [...new Set(respostas.map((r) => r.competencia_id).filter(Boolean))];
  const { data: comps, error: compsError } = await sb.from('competencias')
    .select('id,nome').eq('empresa_id', empresa.id).in('id', compIds);
  if (compsError) throw new Error(compsError.message);
  const compMap = Object.fromEntries((comps || []).map((c: any) => [c.id, c]));
  const nivel = (r: any) => {
    const avaliacao = typeof r.avaliacao_ia === 'string' ? JSON.parse(r.avaliacao_ia) : r.avaliacao_ia;
    return Number(avaliacao?.consolidacao?.nivel_geral || r.nivel_ia4 || 0);
  };
  const niveis = respostas.map(nivel).filter((n) => n > 0);
  const media = niveis.length ? Math.round((niveis.reduce((a, b) => a + b, 0) / niveis.length) * 100) / 100 : 0;
  const dist = { n1: 0, n2: 0, n3: 0, n4: 0 } as Record<string, number>;
  niveis.forEach((n) => { const key = `n${Math.round(n)}`; if (key in dist) dist[key]++; });
  const porCargo = new Map<string, number[]>();
  for (const r of respostas) {
    const cargo = colabMap[r.colaborador_id]?.cargo || '—';
    const values = porCargo.get(cargo) || [];
    values.push(nivel(r));
    porCargo.set(cargo, values);
  }
  const cargosData = [...porCargo.entries()].map(([cargo, values]) => {
    const valid = values.filter((n) => n > 0);
    return { cargo, total: values.length, media: valid.length ? Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100) / 100 : 0 };
  });
  const registros = respostas.map((r) => ({
    nome: colabMap[r.colaborador_id]?.nome_completo || '—',
    cargo: colabMap[r.colaborador_id]?.cargo || '—',
    competencia: compMap[r.competencia_id]?.nome || '—',
    nivel: nivel(r),
  }));
  const disc = { D: 0, I: 0, S: 0, C: 0 } as Record<string, number>;
  for (const c of colabs.filter((p) => p.role !== 'rh')) {
    const key = String(c.perfil_dominante || '').charAt(0).toUpperCase();
    if (key in disc) disc[key]++;
  }
  const avaliados = new Set(respostas.map((r) => r.colaborador_id)).size;
  const user = `EMPRESA: ${empresa.nome} (${empresa.segmento || 'corporativo'})\nTOTAL AVALIADOS: ${avaliados}\nTOTAL AVALIACOES: ${respostas.length}\nMEDIA GERAL: ${media}\nDISTRIBUICAO: N1=${dist.n1} N2=${dist.n2} N3=${dist.n3} N4=${dist.n4}\nDISC ORGANIZACIONAL: D=${disc.D} I=${disc.I} S=${disc.S} C=${disc.C}\n\nPOR CARGO:\n${JSON.stringify(cargosData, null, 2)}\n\nREGISTROS INDIVIDUAIS:\n${JSON.stringify(registros, null, 2)}`;
  const model = await getModelForTask(empresa.id, 'relatorio_rh');
  const raw = await callAI(RELATORIO_RH_SYSTEM, user, { model }, 64000, { taskKey: 'relatorio_rh', empresaId: empresa.id });
  const conteudo: any = await extractJSON(raw);
  if (!conteudo) throw new Error('IA não retornou o relatório RH em JSON');
  const geradoEm = new Date().toISOString();
  const buffer = await renderToBuffer(React.createElement(RelatorioRHPDF, {
    data: { conteudo, gerado_em: geradoEm },
    empresaNome: empresa.nome,
    logoBase64: getLogoCoverBase64() || undefined,
  }) as any);
  const path = await uploadReportPdf(empresa.id, 'rh', empresa.nome, buffer);
  const payload = { empresa_id: empresa.id, colaborador_id: null, tipo: 'rh', conteudo, pdf_path: path, gerado_em: geradoEm };
  const save = existing?.id
    ? await sb.from('relatorios').update(payload).eq('id', existing.id).eq('empresa_id', empresa.id)
    : await sb.from('relatorios').insert(payload);
  if (save.error) throw new Error(`salvar relatório RH: ${save.error.message}`);
  summary.push({ tipo: 'relatorio-rh', alvo: empresa.nome, status: 'gerado', path });
}

async function ensurePerfilOrg(empresa: any) {
  const cached = await latestTenantPdf('final/perfil-org', empresa.id);
  if (!FORCE_DERIVED && cached) {
    summary.push({ tipo: 'perfil-organizacional', alvo: empresa.nome, status: 'cache', path: cached });
    return;
  }
  const perfil = await aggregatePerfilOrg(sb as any, empresa.id);
  if (perfil.semDados || perfil.avaliados === 0) throw new Error('perfil organizacional sem dados');
  const buffer = await renderPerfilOrgPDF({ empresaNome: empresa.nome, dataRef: todayBR(), p: perfil });
  const path = `final/perfil-org/${empresa.id}-${Date.now()}.pdf`;
  const { error } = await sb.storage.from(CONTENT_BUCKET).upload(path, Buffer.from(buffer), { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(error.message);
  summary.push({ tipo: 'perfil-organizacional', alvo: empresa.nome, status: 'gerado', path });
}

async function ensureDna(empresa: any) {
  const cached = await latestTenantPdf('final/dna', empresa.id);
  if (!FORCE_DERIVED && cached) {
    summary.push({ tipo: 'dna-organizacional', alvo: empresa.nome, status: 'cache', path: cached });
    return;
  }
  const dna = await aggregateDna(sb as any, empresa.id);
  if (dna.semDados || dna.avaliados === 0) throw new Error('DNA organizacional sem dados');
  const model = await getModelForTask(empresa.id, 'dna_organizacional');
  const narrativa = await gerarNarrativaDna(dna, { empresaNome: empresa.nome, segmento: empresa.segmento, aiConfig: { model } });
  const buffer = await renderDnaPDF({ empresaNome: empresa.nome, dataRef: todayBR(), segmento: empresa.segmento, dna, narrativa });
  const path = `final/dna/${empresa.id}-${Date.now()}.pdf`;
  const { error } = await sb.storage.from(CONTENT_BUCKET).upload(path, Buffer.from(buffer), { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(error.message);
  summary.push({ tipo: 'dna-organizacional', alvo: empresa.nome, status: 'gerado', path });
}

async function runStep(tipo: string, alvo: string, fn: () => Promise<void>) {
  process.stdout.write(`\n[${tipo}] ${alvo}...\n`);
  try {
    await fn();
    const last = summary[summary.length - 1];
    console.log(`  ${last?.status === 'cache' ? 'cache' : 'ok'}${last?.path ? ` · ${last.path}` : ''}`);
  } catch (error: any) {
    const message = error?.message || String(error);
    summary.push({ tipo, alvo, status: 'erro', error: message });
    console.error(`  ERRO · ${message}`);
  }
}

async function main() {
  const { data: empresa, error: empresaError } = await sb.from('empresas')
    .select('id,nome,slug,segmento,is_demo').eq('slug', SLUG).maybeSingle();
  if (empresaError || !empresa) throw new Error(empresaError?.message || 'tenant não encontrado');
  if (empresa.is_demo !== true) throw new Error('guardrail: o tenant não está marcado como demo');

  const { data: colabs, error: colabsError } = await sb.from('colaboradores')
    .select('id,nome_completo,email,role,cargo,gestor_email,perfil_dominante,comportamental_pdf_path,comportamental_audio_path')
    .eq('empresa_id', empresa.id)
    .order('nome_completo');
  if (colabsError || !colabs) throw new Error(colabsError?.message || 'colaboradores não encontrados');
  if (ONLY_DNA) {
    await runStep('dna-organizacional', empresa.nome, () => ensureDna(empresa));
    const erros = summary.filter((item) => item.status === 'erro');
    console.log('\nRESUMO\n' + JSON.stringify({ empresa: { id: empresa.id, slug: empresa.slug }, itens: summary }, null, 2));
    process.exit(erros.length ? 1 : 0);
  }
  const participantes = colabs.filter((c) => c.perfil_dominante);

  for (const colab of participantes) {
    await runStep('pdf-comportamental', colab.nome_completo, () => ensureBehavioralPdf(empresa.id, colab));
  }
  for (const colab of participantes) {
    await runStep('audio-comportamental', colab.nome_completo, () => ensureBehavioralAudio(empresa, colab));
  }
  await validateDemoFocus(empresa.id);
  for (const colab of colabs.filter((c) => TARGET_PDIS.has(c.email))) {
    await runStep('pdi', colab.nome_completo, () => ensurePdi(empresa.id, colab));
  }
  await runStep('relatorio-gestor', 'Carla Menezes', () => ensureManagerReport(empresa, colabs));
  await runStep('relatorio-rh', empresa.nome, () => ensureRhReport(empresa, colabs));
  await runStep('perfil-organizacional', empresa.nome, () => ensurePerfilOrg(empresa));
  await runStep('dna-organizacional', empresa.nome, () => ensureDna(empresa));

  const errors = summary.filter((item) => item.status === 'erro');
  console.log('\nRESUMO');
  console.log(JSON.stringify({
    empresa: { id: empresa.id, slug: empresa.slug },
    gerados: summary.filter((item) => item.status === 'gerado').length,
    cache: summary.filter((item) => item.status === 'cache').length,
    erros: errors.length,
    itens: summary,
  }, null, 2));
  process.exit(errors.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
