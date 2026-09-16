import { ENVIRONMENT } from './environment';
import { currentLocation, currentPerson, demo, notifyOnlineOnly, onlineOnly } from './runtime';
import { derivarArquetipo, derivarTagsExecutivas, insightsHardcoded } from '@/lib/disc-arquetipos';
import { normalizeManagerReportInsight, normalizeRhReportInsight } from '@/lib/relatorios/dashboard-insights';
import { nivelDaNota } from '@/lib/nivel-regua';
import { PROGRESSO, TRILHA } from '@/lib/status';

function colab(key?: string) {
  const person = currentPerson(key);
  return { ...person.details, id: person.key, nome: person.name, nome_completo: person.name, cargo: person.role, area_depto: person.unit, perfil_dominante: person.profile, d_natural: person.disc[0], i_natural: person.disc[1], s_natural: person.disc[2], c_natural: person.disc[3] };
}
function panorama() {
  return { empresaNome: ENVIRONMENT.name, pessoas: demo.people.length, comPerfil: demo.people.filter(p => p.profileAvailable !== false).length, comMapeamento: demo.people.filter(p => p.assessments.length).length, emJornada: Object.values(demo.tracks).filter(t => t?.status === TRILHA.ATIVA).length, emDia: Object.values(demo.tracks).filter(t => t?.status === TRILHA.ATIVA).length, atrasadas: 0, jornadasEncerradas: Object.values(demo.tracks).filter(t => t?.status === TRILHA.CONCLUIDA).length, indisponivel: false };
}
export async function loadHomeData() {
  return { dashboard: { colaborador: colab(), view: currentLocation().role === 'organization' ? 'rh' : 'colaborador', competenciaFoco: demo.weeks[0].competency },
    kpis: { fase: { numero: 4, titulo: 'Temporada', concluida: false }, pilula: { semana: 1, totalSemanas: demo.totalWeeks, titulo: demo.weeks[0].title }, proximoMarco: { label: 'Próxima pílula', diasAte: 7 } },
    panoramaRH: panorama(), relatoriosRH: { rh: { url: `${ENVIRONMENT.base}documents/rh.pdf`, em: demo.capturedAt } }, ultimosVideos: { items: [] }, pulsos: [], votacao: null, capacitacoes: [] };
}
export async function loadJornada() {
  return { colaborador: colab(), totalSemanas: demo.totalWeeks, fases: [
    { fase: 1, titulo: 'Perfil comportamental', status: 'completed', descricao: 'Seu perfil DISC' },
    { fase: 2, titulo: 'Avaliação de competências', status: 'completed', descricao: 'Mapeamento de competências concluído' },
    { fase: 3, titulo: 'PDI', status: 'completed', descricao: 'Plano de Desenvolvimento Individual' },
    { fase: 4, titulo: 'Temporada', status: 'in_progress', descricao: demo.weeks[0].competency, totalSemanas: demo.totalWeeks },
    { fase: 5, titulo: 'Evolução', status: 'pending', descricao: 'Ao concluir sua temporada' },
  ] };
}
export async function loadPDI() { return { colaborador: colab(ENVIRONMENT.participantKey), pdiAtivo: true, conteudo: demo.pdi, criadoEm: demo.capturedAt }; }
export async function baixarMeuPdiPdf() { return { url: `${ENVIRONMENT.base}documents/pdi.pdf` }; }
export async function loadPerfil() { return { colaborador: colab(), empresa: { nome: ENVIRONMENT.name } }; }
export async function loadPerfilCIS(key?: string) {
  const c = colab(key);
  return { colaborador: c, arquetipo: derivarArquetipo(c.perfil_dominante), tags: derivarTagsExecutivas(c), insights: insightsHardcoded(c.perfil_dominante), insightsCached: true, empresaPerfilExternoFonte: null, perfilComportamentalLiberado: true, audioComportamentalDisponivel: false };
}
export const loadPerfilCISGestor = loadPerfilCIS;
export async function loadBehavioralReport(key?: string) {
  const person = currentPerson(key);
  return { raw: { nome: person.name, perfil_dominante: person.profile, disc_natural: Object.fromEntries(['D','I','S','C'].map((k,i) => [k,person.disc[i]])), competencias: [] }, texts: person.report };
}
export const loadBehavioralReportGestor = loadBehavioralReport;
export async function getDiagnosticoDoDia() {
  const person = currentPerson();
  const names = [...new Set(person.assessments.map(a => a.competency))];
  return { colaborador: colab(), progresso: { pct: 100, total: names.length, respondidas: names.length }, concluiuTudo: true, temPdi: true, trilho: 'cargo', resultados: names.map(name => {
    const rows = person.assessments.filter(a => a.competency === name);
    const nota = rows.reduce((sum,a) => sum+a.score,0)/rows.length;
    return { competencia: name, avaliada: true, nivel: nivelDaNota(nota), nota, pontosFortes: [], pontosAtencao: [], feedback: '' };
  }) };
}
export async function loadTemporada(key?: string) {
  const participant = currentPerson(key || ENVIRONMENT.participantKey);
  const track = demo.tracks[participant.key];
  if (!track) return { error: 'Esta pessoa não tem uma temporada no retrato salvo da demonstração.' };
  const plano = track.temporada_plano.map(w => {
    const mediaWeek = demo.weeks.find(week => week.number === w.semana);
    return { ...w, conteudo: mediaWeek ? { formato_core: 'video', desafio_texto: mediaWeek.challenge, criterio_de_execucao: mediaWeek.evidence,
      formatos_disponiveis: Object.fromEntries(mediaWeek.formats.filter(f => f.key !== 'video').map(f => [f.key, { titulo: f.title, url: ENVIRONMENT.base+f.path }])) } : w.conteudo };
  });
  return { colaborador: colab(participant.key), trilha: { ...track, id: participant.key, temporada_plano: plano }, progresso: track.progresso, viewerRole: currentLocation().role === 'organization' ? 'rh' : 'gestor' };
}
export const loadTemporadaPorEmail = loadTemporada;
export async function resolverVideoDaSemana(_competency?: string, descriptor?: string) {
  const week = demo.weeks.find(w => w.title === descriptor);
  if (!week) return { available: false, status: 'unavailable' };
  const video = week.formats.find(f => f.key === 'video')!;
  return { available: true, status: 'done', bunny_video_id: video.path, bunny_library: 'offline', local_url: ENVIRONMENT.base+video.path, isPersonalizado: ENVIRONMENT.tenant === 'acme-demo' };
}
export async function resolverVideoDaSemanaGestor(_key: string, competency?: string, descriptor?: string) { return resolverVideoDaSemana(competency, descriptor); }
export async function getGestorHomeData() {
  const rh = currentLocation().role === 'organization';
  const team = demo.people.filter(p => rh || p.manager === ENVIRONMENT.names.manager);
  const active = team.filter(p => demo.tracks[p.key]?.status === TRILHA.ATIVA);
  return { ok: true, scope: rh ? 'rh' : 'gestor',
    kpis: { liderados: { total: team.length, em_trilha: active.length, sem_trilha: team.length-active.length }, em_andamento: { count: active.length, distribuicao_semanas: [{ semana: 1, pessoas: active.length }] }, checkpoints: { pendentes: 0, respondidos: 0 }, atividade_semana: { ativos: active.length, total: team.length } },
    alertas: [], checkpointsPendentes: [],
    equipe: team.map(p => ({ colabId: p.key, colab: p.name, cargo: p.role, status: demo.tracks[p.key]?.status === TRILHA.ATIVA ? PROGRESSO.EM_ANDAMENTO : demo.tracks[p.key]?.status || 'sem_trilha', competenciaFoco: p.assessments[0]?.competency || null, semana: demo.tracks[p.key] ? 1 : null, totalSemanas: demo.tracks[p.key]?.temporada_plano.length || null, delta: null, perfilDominante: p.profile, fontePerfilExterno: null, turma: null, motivoSemTrilha: p.profileAvailable === false ? 'sem_perfil' : 'sem_mapeamento', atrasada: false })),
    perfis: team.map(p => ({ colabId: p.key, colab: p.name, cargo: p.role, fonte: p.profileAvailable === false ? 'sem_perfil' : 'disc', letraDom: p.profile, d: p.disc[0], i:p.disc[1], s:p.disc[2], c:p.disc[3] })),
    reportDashboard: { id: 'gestor', generatedAt: demo.capturedAt, pdfUrl: `${ENVIRONMENT.base}documents/gestor.pdf`, insight: normalizeManagerReportInsight(demo.coordination) } };
}
export function rhReports() {
  const doc = (kind: string, recipient: string | null) => ({ id: kind, kind, url: `${ENVIRONMENT.base}documents/${kind}.pdf`, generatedAt: demo.capturedAt, recipient, role: null });
  return { companyName: ENVIRONMENT.name, scope: { turmas: [], turmaId: null, turmaNome: null, pessoas: demo.people.length, pessoasEmpresa: demo.people.length, insightScopeIsCompany: false },
    dashboard: { panorama: panorama(), insight: normalizeRhReportInsight(demo.direction), descriptorAnalysis: null, generatedAt: demo.capturedAt, insightUnavailable: false,
      evolucao: { cobertura: { participantes: demo.people.length, emJornada: demo.people.length, medidos: 0, percentual: 0 }, resumo: { confirmadas: 0, parciais: 0, estaveis: 0, semVeredito: 0, deltaMedio: 0, descritoresMedidos: 0 }, pessoas: [], porCompetencia: [], porDescritor: [], proximasAcoes: { precisamApoio: [], proximoCiclo: [] }, indisponivel: false } },
    organization: [doc('rh', null)], managers: [doc('gestor', ENVIRONMENT.names.manager)], people: [{...doc('pdi',ENVIRONMENT.names.participant),kind:'individual'}] };
}
export async function loadEvolucao() { return { competencias: [], metricas: {}, descritores: [], evolucao: [] }; }
export async function registrarEventoTrilha() { return { ok: true }; }
export async function jaAbriuConteudoDaSemana() { return { abriu: false }; }
// The shared viewer calls this automatically on media open. Keep the snapshot
// unchanged and suppress the write without interrupting video/audio playback.
export async function marcarConteudoConsumido() { return { ok: true }; }
export async function unavailable() { notifyOnlineOnly(); return { error: onlineOnly, ok: false, success: false }; }
export async function chatWithBeto() { return onlineOnly; }
