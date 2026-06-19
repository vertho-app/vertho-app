'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Upload, Loader2, Users, Pencil, Trash2, X, Check, Briefcase, RefreshCw, Plus, Save, Link2, Download } from 'lucide-react';
import BackButton from '@/components/back-button';
import { parseSpreadsheet } from '@/lib/parse-spreadsheet';
import {
  loadEmpresas, loadResumoEmpresa, importarColaboradoresLote, loadColaboradores, atualizarColaborador, excluirColaborador,
  criarColaborador, exportarColaboradoresXLSX,
  loadCargos, salvarCargo, excluirCargo, sincronizarCargosDeColaboradores, importarCargosLote,
  derivarGestorEmailPorNome,
} from './actions';
const CARGO_FIELDS = [
  { key: 'descricao', rows: 3 },
  { key: 'principais_entregas', rows: 2 },
  { key: 'stakeholders', rows: 2 },
  { key: 'decisoes_recorrentes', rows: 2 },
  { key: 'tensoes_comuns', rows: 2 },
  { key: 'contexto_cultural', rows: 2 },
];

export default function GerenciarPage() {
  const t = useTranslations('AdminCollaborators');
  const router = useRouter();
  const searchParams = useSearchParams();
  const empresaParam = searchParams.get('empresa');
  const [empresas, setEmpresas] = useState([]);
  const [tenantId, setTenantId] = useState(empresaParam || null);
  const [empresaNome, setEmpresaNome] = useState('');
  const [resumo, setResumo] = useState(null);
  const [colabs, setColabs] = useState([]);
  const [sortBy, setSortBy] = useState<string>('nome_completo');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  function toggleSort(col: string) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  }

  const colabsSorted = [...colabs].sort((a: any, b: any) => {
    const va = (a?.[sortBy] ?? '').toString().toLowerCase();
    const vb = (b?.[sortBy] ?? '').toString().toLowerCase();
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState('');
  const [tab, setTab] = useState('lista'); // lista | importar | cargos
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [exportando, setExportando] = useState(false);

  // Cargos state
  const [cargos, setCargos] = useState([]);
  const [loadingCargos, setLoadingCargos] = useState(false);
  const [editCargo, setEditCargo] = useState(null); // cargo sendo editado
  const [savingCargo, setSavingCargo] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [vinculandoGestores, setVinculandoGestores] = useState(false);

  useEffect(() => {
    loadEmpresas().then(data => {
      setEmpresas(data);
      if (empresaParam) {
        const emp = data.find((e: any) => e.id === empresaParam);
        if (emp) setEmpresaNome(emp.nome);
      }
    }).finally(() => setLoading(false));
  }, [empresaParam]);

  useEffect(() => {
    if (tenantId) {
      loadResumoEmpresa(tenantId).then(setResumo);
      loadColaboradores(tenantId).then(setColabs);
      loadCargos(tenantId).then(setCargos);
    } else { setResumo(null); setColabs([]); setCargos([]); }
  }, [tenantId]);

  async function refresh() {
    if (!tenantId) return;
    const [r, c] = await Promise.all([loadResumoEmpresa(tenantId), loadColaboradores(tenantId)]);
    setResumo(r);
    setColabs(c);
  }

  async function refreshCargos() {
    if (!tenantId) return;
    setLoadingCargos(true);
    const data = await loadCargos(tenantId);
    setCargos(data);
    setLoadingCargos(false);
  }

  // Carregar cargos quando tab muda
  useEffect(() => {
    if (tab === 'cargos' && tenantId) refreshCargos();
  }, [tab, tenantId]);

  async function handleCSV(e) {
    const file = e.target.files?.[0];
    if (!file || !tenantId) return;
    setImporting(true); setMsg('');

    const rows = await parseSpreadsheet(file);
    const parsed = rows.map(obj => ({
      nome: obj.nome || obj.nome_completo,
      email: obj.email,
      cargo: obj.cargo,
      area_depto: obj.area_depto || obj.area || obj.departamento || obj.setor || obj.depto,
      role: obj.role || obj.papel,
      telefone: obj.telefone || obj.whatsapp || obj.celular || obj.fone,
      gestor_nome: obj.gestor_nome || obj.gestor,
      gestor_email: obj.gestor_email,
      gestor_whatsapp: obj.gestor_whatsapp || obj.gestor_telefone || obj.gestor_celular,
    }));

    if (parsed.length === 0) {
      setMsg(t('messages.noRows'));
      setImporting(false); return;
    }

    const r = await importarColaboradoresLote(tenantId, parsed);
    setMsg(r.success ? r.message : r.error);
    setImporting(false);
    e.target.value = '';
    if (r.success) refresh();
  }

  async function handleCargosCSV(e) {
    const file = e.target.files?.[0];
    if (!file || !tenantId) return;
    setImporting(true); setMsg('');

    const rows = await parseSpreadsheet(file);
    const parsed = rows.map(obj => ({
      nome: obj.nome || obj.cargo,
      area_depto: obj.area_depto || obj.area || obj.departamento,
      descricao: obj.descricao,
      principais_entregas: obj.principais_entregas || obj.entregas,
      stakeholders: obj.stakeholders,
      decisoes_recorrentes: obj.decisoes_recorrentes || obj.decisoes,
      tensoes_comuns: obj.tensoes_comuns || obj.tensoes,
      contexto_cultural: obj.contexto_cultural || obj.contexto,
      eh_lideranca: obj.eh_lideranca || obj.lideranca,
    })).filter(c => c.nome);

    if (parsed.length === 0) {
      setMsg(t('messages.noValidRoles'));
      setImporting(false); return;
    }

    const r = await importarCargosLote(tenantId, parsed);
    setMsg(r.success ? r.message : r.error);
    setImporting(false);
    e.target.value = '';
    if (r.success) { const cr = await loadCargos(tenantId); setCargos(cr as any); }
  }

  function startEdit(c) {
    setEditId(c.id);
    setEditData({ nome_completo: c.nome_completo || '', email: c.email || '', cargo: c.cargo || '', area_depto: c.area_depto || '', role: c.role || 'colaborador', telefone: c.telefone || '', gestor_nome: c.gestor_nome || '', gestor_email: c.gestor_email || '', gestor_whatsapp: c.gestor_whatsapp || '' });
  }

  function startCreate() {
    setEditId('new');
    setEditData({
      nome_completo: '', email: '', cargo: '', area_depto: '',
      role: 'colaborador', telefone: '', gestor_nome: '', gestor_email: '', gestor_whatsapp: '',
    });
  }

  async function saveEdit() {
    if (!editId) return;
    setSaving(true);
    const r = editId === 'new'
      ? await criarColaborador(tenantId, editData)
      : await atualizarColaborador(editId, editData);
    setSaving(false);
    if (r.success) {
      setEditId(null);
      refresh();
      setMsg(editId === 'new' ? t('messages.collaboratorAdded') : t('messages.collaboratorUpdated'));
    } else {
      setMsg(t('messages.error', { error: r.error }));
    }
  }

  async function handleExportXLSX() {
    if (!tenantId) return;
    setExportando(true);
    const r = await exportarColaboradoresXLSX(tenantId);
    setExportando(false);
    if (r.ok === false) { setMsg(t('messages.error', { error: r.error })); return; }
    const bytes = Uint8Array.from(atob(r.base64), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const slug = (empresaNome || 'empresa').toLowerCase().normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    a.download = `colaboradores-${slug}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg(t('messages.exported', { count: r.n }));
  }

  async function handleDelete(id, nome) {
    if (!confirm(t('confirm.deleteCollaborator', { name: nome || t('fallback.collaborator') }))) return;
    const r = await excluirColaborador(id);
    if (r.success) { refresh(); setMsg(t('messages.collaboratorDeleted')); }
    else setMsg(t('messages.error', { error: r.error }));
  }

  async function handleSyncCargos() {
    if (!tenantId) return;
    setSyncing(true);
    const r = await sincronizarCargosDeColaboradores(tenantId);
    setSyncing(false);
    setMsg(r.success ? r.message : t('messages.error', { error: r.error }));
    if (r.success) refreshCargos();
  }

  async function handleVincularGestores() {
    if (!tenantId) return;
    setVinculandoGestores(true);
    const r = await derivarGestorEmailPorNome(tenantId);
    setVinculandoGestores(false);
    if (!r.success) { setMsg(t('messages.error', { error: r.error })); return; }
    const partes = [t('messages.linkedManagers', { count: r.vinculados })];
    if (r.naoEncontrados.length > 0) {
      partes.push(t('messages.managersNoMatch', {
        count: r.naoEncontrados.length,
        names: `${r.naoEncontrados.slice(0, 2).map(x => x.gestor_nome).join(', ')}${r.naoEncontrados.length > 2 ? '...' : ''}`,
      }));
    }
    if (r.ambiguos.length > 0) {
      partes.push(t('messages.managersAmbiguous', { count: r.ambiguos.length }));
    }
    setMsg(partes.join(t('messages.separator')));
    refresh();
  }

  async function handleSaveCargo() {
    if (!editCargo || !tenantId) return;
    setSavingCargo(true);
    const r = await salvarCargo({ empresaId: tenantId, cargo: editCargo });
    setSavingCargo(false);
    if (r.success) {
      setEditCargo(null);
      refreshCargos();
      setMsg(t('messages.roleSaved'));
    } else {
      setMsg(t('messages.error', { error: r.error }));
    }
  }

  async function handleDeleteCargo(id, nome) {
    if (!confirm(t('confirm.deleteRole', { name: nome }))) return;
    const r = await excluirCargo(id);
    if (r.success) { refreshCargos(); setMsg(t('messages.roleDeleted')); }
    else setMsg(t('messages.error', { error: r.error }));
  }

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6" style={{ minHeight: '100dvh' }}>
      {/* Header */}
      <BackButton onClick={() => router.push(empresaParam ? `/admin/empresas/${empresaParam}` : '/admin/dashboard')} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-white">{t('title')}</h1>
          {empresaParam && empresaNome && <p className="text-xs text-gray-500">{empresaNome}</p>}
        </div>
      </div>

      {!empresaParam && (
        <select value={tenantId || ''} onChange={e => setTenantId(e.target.value || null)}
          className="w-full px-3 py-2.5 rounded-lg text-sm text-white border border-white/10 outline-none mb-4" style={{ background: '#091D35' }}>
          <option value="">{t('selectCompany')}</option>
          {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nome}</option>)}
        </select>
      )}

      {tenantId && (
        <>
          {/* Resumo */}
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-xl px-4 py-3 border border-white/[0.06] flex items-center gap-2" style={{ background: '#0F2A4A' }}>
              <Users size={16} className="text-cyan-400" />
              <span className="text-sm font-bold text-white">{t('summary.collaborators', { count: resumo?.colabs || 0 })}</span>
              <span className="text-xs text-gray-500">· {t('summary.competencies', { count: resumo?.competencias || 0 })}</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-4">
            <button onClick={() => setTab('lista')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === 'lista' ? 'bg-cyan-400/15 text-cyan-400' : 'text-gray-500 hover:text-gray-300'}`}>
              {t('tabs.collaborators', { count: colabs.length })}
            </button>
            <button onClick={() => setTab('cargos')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === 'cargos' ? 'bg-cyan-400/15 text-cyan-400' : 'text-gray-500 hover:text-gray-300'}`}>
              <Briefcase size={12} /> {t('tabs.roles', { count: cargos.length || '...' })}
            </button>
            <button onClick={() => setTab('importar')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === 'importar' ? 'bg-cyan-400/15 text-cyan-400' : 'text-gray-500 hover:text-gray-300'}`}>
              {t('tabs.importCsv')}
            </button>
            {tab === 'lista' && editId !== 'new' && (
              <>
                <button onClick={handleVincularGestores} disabled={vinculandoGestores}
                  title={t('actions.linkManagersTitle')}
                  className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-white/10 text-gray-300 hover:border-cyan-400/30 hover:text-cyan-400 transition-all disabled:opacity-40">
                  {vinculandoGestores ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                  {t('actions.linkManagers')}
                </button>
                <button onClick={startCreate}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-white/10 text-gray-300 hover:border-green-400/30 hover:text-green-400 transition-all">
                  <Plus size={12} /> {t('actions.addCollaborator')}
                </button>
                <button onClick={handleExportXLSX} disabled={exportando || colabs.length === 0}
                  title={t('actions.exportTitle')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-white/10 text-gray-300 hover:border-cyan-400/30 hover:text-cyan-400 transition-all disabled:opacity-40">
                  {exportando ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  {t('actions.exportXlsx')}
                </button>
              </>
            )}
          </div>

          {/* Tab: Lista */}
          {tab === 'lista' && (
            <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
              {colabs.length === 0 && editId !== 'new' ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-gray-500">{t('empty.collaborators')}</p>
                  <div className="flex items-center justify-center gap-3 mt-2">
                    <button onClick={startCreate} className="text-xs text-cyan-400 hover:underline">{t('empty.addManually')}</button>
                    <span className="text-gray-600">·</span>
                    <button onClick={() => setTab('importar')} className="text-xs text-cyan-400 hover:underline">{t('empty.importCsv')}</button>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06] text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                        <SortTh col="nome_completo" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort}>{t('table.name')}</SortTh>
                        <SortTh col="email" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort}>{t('table.email')}</SortTh>
                        <SortTh col="cargo" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort}>{t('table.role')}</SortTh>
                        <SortTh col="area_depto" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort}>{t('table.area')}</SortTh>
                        <SortTh col="role" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort}>{t('table.access')}</SortTh>
                        <SortTh col="telefone" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort}>WhatsApp</SortTh>
                        <SortTh col="gestor_nome" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort}>{t('table.manager')}</SortTh>
                        <th className="px-4 py-2 text-center">{t('table.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                      {editId === 'new' && (
                        <tr className="bg-cyan-400/5">
                          <td className="px-4 py-2"><input autoFocus value={editData.nome_completo} onChange={e => setEditData(p => ({ ...p, nome_completo: e.target.value }))}
                            placeholder={t('fields.fullName')}
                            className="w-full px-2 py-1 rounded text-xs text-white border border-white/10 bg-[#091D35] outline-none" /></td>
                          <td className="px-4 py-2"><input value={editData.email} onChange={e => setEditData(p => ({ ...p, email: e.target.value }))}
                            placeholder="email@empresa.com"
                            className="w-full px-2 py-1 rounded text-xs text-white border border-white/10 bg-[#091D35] outline-none" /></td>
                          <td className="px-4 py-2">
                            <select value={editData.cargo} onChange={e => {
                                const novoCargo = e.target.value;
                                const c = cargos.find(k => k.nome === novoCargo);
                                setEditData(p => ({ ...p, cargo: novoCargo, area_depto: c?.area_depto || p.area_depto }));
                              }}
                              className="w-full px-2 py-1 rounded text-xs text-white border border-white/10 bg-[#091D35] outline-none">
                              <option value="">{t('fields.select')}</option>
                              {cargos.map(k => <option key={k.id || k.nome} value={k.nome}>{k.nome}</option>)}
                            </select>
                            {cargos.length === 0 && (
                              <button type="button" onClick={() => setTab('cargos')} className="block mt-1 text-[9px] text-cyan-400 hover:underline">
                                {t('actions.registerRole')}
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-2"><input value={editData.area_depto} onChange={e => setEditData(p => ({ ...p, area_depto: e.target.value }))}
                            placeholder={t('fields.areaAuto')}
                            className="w-full px-2 py-1 rounded text-xs text-white border border-white/10 bg-[#091D35] outline-none" /></td>
                          <td className="px-4 py-2">
                            <select value={editData.role} onChange={e => setEditData(p => ({ ...p, role: e.target.value }))}
                              className="px-2 py-1 rounded text-xs text-white border border-white/10 bg-[#091D35] outline-none">
                              <option value="colaborador">{t('roles.collaborator')}</option>
                              <option value="gestor">{t('roles.manager')}</option>
                              <option value="rh">RH</option>
                            </select>
                          </td>
                          <td className="px-4 py-2"><input value={editData.telefone} onChange={e => setEditData(p => ({ ...p, telefone: e.target.value }))}
                            placeholder="5511999999999"
                            className="w-full px-2 py-1 rounded text-xs text-white border border-white/10 bg-[#091D35] outline-none" /></td>
                          <td className="px-4 py-2">
                            <input value={editData.gestor_nome} onChange={e => setEditData(p => ({ ...p, gestor_nome: e.target.value }))}
                              placeholder={t('fields.managerName')}
                              className="w-full px-2 py-1 rounded text-xs text-white border border-white/10 bg-[#091D35] outline-none mb-1" />
                            <input value={editData.gestor_email} onChange={e => setEditData(p => ({ ...p, gestor_email: e.target.value }))}
                              placeholder="email@gestor.com"
                              className="w-full px-2 py-1 rounded text-xs text-white border border-white/10 bg-[#091D35] outline-none mb-1" />
                            <input value={editData.gestor_whatsapp} onChange={e => setEditData(p => ({ ...p, gestor_whatsapp: e.target.value }))}
                              placeholder="5511999999999"
                              className="w-full px-2 py-1 rounded text-xs text-white border border-white/10 bg-[#091D35] outline-none" />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={saveEdit} disabled={saving || (!editData.email?.trim() && !editData.telefone?.trim())}
                                title={t('actions.addRequiresContact')}
                                className="text-green-400 hover:text-green-300 disabled:opacity-40">
                                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                              </button>
                              <button onClick={() => setEditId(null)} className="text-gray-500 hover:text-white" title={t('actions.cancel')}><X size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      )}
                      {colabsSorted.map(c => (
                        <tr key={c.id} className="hover:bg-white/[0.02]">
                          {editId === c.id ? (
                            <>
                              <td className="px-4 py-2"><input value={editData.nome_completo} onChange={e => setEditData(p => ({ ...p, nome_completo: e.target.value }))}
                                className="w-full px-2 py-1 rounded text-xs text-white border border-white/10 bg-[#091D35] outline-none" /></td>
                              <td className="px-4 py-2"><input value={editData.email} onChange={e => setEditData(p => ({ ...p, email: e.target.value }))}
                                className="w-full px-2 py-1 rounded text-xs text-white border border-white/10 bg-[#091D35] outline-none" /></td>
                              <td className="px-4 py-2">
                                <select value={editData.cargo} onChange={e => {
                                    const novoCargo = e.target.value;
                                    const c = cargos.find(k => k.nome === novoCargo);
                                    setEditData(p => ({ ...p, cargo: novoCargo, area_depto: c?.area_depto || p.area_depto }));
                                  }}
                                  className="w-full px-2 py-1 rounded text-xs text-white border border-white/10 bg-[#091D35] outline-none">
                                  <option value="">{t('fields.select')}</option>
                                  {editData.cargo && !cargos.some(k => k.nome === editData.cargo) && (
                                    <option value={editData.cargo}>{t('fields.outsideCatalog', { role: editData.cargo })}</option>
                                  )}
                                  {cargos.map(k => <option key={k.id || k.nome} value={k.nome}>{k.nome}</option>)}
                                </select>
                              </td>
                              <td className="px-4 py-2"><input value={editData.area_depto} onChange={e => setEditData(p => ({ ...p, area_depto: e.target.value }))}
                                className="w-full px-2 py-1 rounded text-xs text-white border border-white/10 bg-[#091D35] outline-none" /></td>
                              <td className="px-4 py-2">
                                <select value={editData.role} onChange={e => setEditData(p => ({ ...p, role: e.target.value }))}
                                  className="px-2 py-1 rounded text-xs text-white border border-white/10 bg-[#091D35] outline-none">
                                  <option value="colaborador">{t('roles.collaborator')}</option>
                                  <option value="gestor">{t('roles.manager')}</option>
                                  <option value="rh">RH</option>
                                </select>
                              </td>
                              <td className="px-4 py-2"><input value={editData.telefone} onChange={e => setEditData(p => ({ ...p, telefone: e.target.value }))}
                                placeholder="5511999999999"
                                className="w-full px-2 py-1 rounded text-xs text-white border border-white/10 bg-[#091D35] outline-none" /></td>
                              <td className="px-4 py-2">
                                <input value={editData.gestor_nome} onChange={e => setEditData(p => ({ ...p, gestor_nome: e.target.value }))}
                                  placeholder={t('fields.managerName')}
                                  className="w-full px-2 py-1 rounded text-xs text-white border border-white/10 bg-[#091D35] outline-none mb-1" />
                                <input value={editData.gestor_email} onChange={e => setEditData(p => ({ ...p, gestor_email: e.target.value }))}
                                  placeholder="email@gestor.com"
                                  className="w-full px-2 py-1 rounded text-xs text-white border border-white/10 bg-[#091D35] outline-none mb-1" />
                                <input value={editData.gestor_whatsapp} onChange={e => setEditData(p => ({ ...p, gestor_whatsapp: e.target.value }))}
                                  placeholder="5511999999999"
                                  className="w-full px-2 py-1 rounded text-xs text-white border border-white/10 bg-[#091D35] outline-none" />
                              </td>
                              <td className="px-4 py-2 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button onClick={saveEdit} disabled={saving} className="text-green-400 hover:text-green-300">
                                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                  </button>
                                  <button onClick={() => setEditId(null)} className="text-gray-500 hover:text-white" title={t('actions.cancel')}><X size={14} /></button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-2 text-white font-semibold">{c.nome_completo || '—'}</td>
                              <td className="px-4 py-2 text-gray-400 text-xs">
                                {c.login_por_whatsapp
                                  ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-400/10 text-green-400">{t('badges.whatsappOnly')}</span>
                                  : (c.email || '—')}
                              </td>
                              <td className="px-4 py-2 text-gray-400 text-xs">{c.cargo || '—'}</td>
                              <td className="px-4 py-2 text-gray-400 text-xs">{c.area_depto || '—'}</td>
                              <td className="px-4 py-2">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                  c.role === 'rh' ? 'bg-purple-400/10 text-purple-400' :
                                  c.role === 'gestor' ? 'bg-amber-400/10 text-amber-400' :
                                  'bg-gray-400/10 text-gray-400'
                                }`}>{c.role}</span>
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-500">{c.telefone || '—'}</td>
                              <td className="px-4 py-2 text-xs text-gray-500">{c.gestor_nome || '—'}</td>
                              <td className="px-4 py-2 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button onClick={() => startEdit(c)} className="text-gray-600 hover:text-cyan-400"><Pencil size={13} /></button>
                                  <button onClick={() => handleDelete(c.id, c.nome_completo)} className="text-gray-600 hover:text-red-400"><Trash2 size={13} /></button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab: Cargos */}
          {tab === 'cargos' && (
            <div>
              {/* Ações */}
              <div className="flex items-center gap-2 mb-4">
                <button onClick={handleSyncCargos} disabled={syncing}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-white/10 text-gray-300 hover:border-cyan-400/30 hover:text-cyan-400 transition-all disabled:opacity-50">
                  {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  {t('actions.syncRoles')}
                </button>
                <button onClick={() => setEditCargo({ nome: '', area_depto: '', descricao: '', principais_entregas: '', stakeholders: '', decisoes_recorrentes: '', tensoes_comuns: '', contexto_cultural: '' })}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-white/10 text-gray-300 hover:border-green-400/30 hover:text-green-400 transition-all">
                  <Plus size={12} /> {t('actions.newRole')}
                </button>
              </div>

              {loadingCargos ? (
                <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-cyan-400" /></div>
              ) : cargos.length === 0 ? (
                <div className="text-center py-8">
                  <Briefcase size={32} className="text-gray-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">{t('empty.roles')}</p>
                  <p className="text-xs text-gray-600 mt-1">{t('empty.syncRolesHint')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cargos.map(c => (
                    <div key={c.id} className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
                      <div className="flex items-center gap-3 px-4 py-3">
                        <Briefcase size={14} className="text-cyan-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white">{c.nome}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {c.area_depto && <span className="text-[10px] text-gray-400">{c.area_depto}</span>}
                            <span className={`text-[10px] ${c.descricao ? 'text-green-400' : 'text-amber-400'}`}>
                              {c.descricao ? t('badges.filled') : t('badges.pending')}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => setEditCargo({ ...c })} className="text-gray-500 hover:text-cyan-400"><Pencil size={13} /></button>
                          <button onClick={() => handleDeleteCargo(c.id, c.nome)} className="text-gray-500 hover:text-red-400"><Trash2 size={13} /></button>
                        </div>
                      </div>
                      {/* Preview dos campos preenchidos */}
                      {c.descricao && (
                        <div className="px-4 pb-3 text-[11px] text-gray-400 truncate max-w-2xl">
                          {c.descricao}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Modal edição de cargo */}
              {editCargo && (
                <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.7)' }}>
                  <div className="w-full max-w-[650px] rounded-2xl border border-white/[0.08] p-6 mb-10" style={{ background: '#0A1D35' }}
                    onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-5">
                      <h2 className="text-lg font-bold text-white">{editCargo.id ? t('modal.editRole') : t('modal.newRole')}</h2>
                      <button onClick={() => setEditCargo(null)} className="text-gray-500 hover:text-white"><X size={18} /></button>
                    </div>

                    <div className="space-y-4">
                      {/* Nome + Área */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t('fields.roleNameRequired')}</label>
                          <input value={editCargo.nome || ''} onChange={e => setEditCargo(p => ({ ...p, nome: e.target.value }))}
                            placeholder={t('fields.roleNamePlaceholder')}
                            className="w-full rounded-lg border border-white/10 bg-[#091D35] text-white text-sm px-3 py-2 focus:outline-none focus:border-cyan-400/50" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t('fields.areaDept')}</label>
                          <input value={editCargo.area_depto || ''} onChange={e => setEditCargo(p => ({ ...p, area_depto: e.target.value }))}
                            placeholder={t('fields.areaPlaceholder')}
                            className="w-full rounded-lg border border-white/10 bg-[#091D35] text-white text-sm px-3 py-2 focus:outline-none focus:border-cyan-400/50" />
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer select-none">
                        <input type="checkbox"
                          checked={editCargo.eh_lideranca !== false}
                          onChange={e => setEditCargo(p => ({ ...p, eh_lideranca: e.target.checked }))} />
                        <span className="font-semibold">{t('fields.leadershipRole')}</span>
                        <span className="text-gray-500 text-[10px] ml-1">{t('fields.leadershipRoleHint')}</span>
                      </label>

                      {/* Campos descritivos */}
                      {CARGO_FIELDS.map(f => (
                        <div key={f.key}>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t(`cargoFields.${f.key}.label`)}</label>
                          <textarea value={editCargo[f.key] || ''} onChange={e => setEditCargo(p => ({ ...p, [f.key]: e.target.value }))}
                            rows={f.rows} placeholder={t(`cargoFields.${f.key}.placeholder`)}
                            className="w-full rounded-lg border border-white/10 bg-[#091D35] text-white text-sm px-3 py-2 focus:outline-none focus:border-cyan-400/50 resize-none" />
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end gap-2 mt-5">
                      <button onClick={() => setEditCargo(null)} className="px-4 py-2 rounded-lg text-sm text-gray-400 border border-white/10 hover:text-white transition-colors">
                        {t('actions.cancel')}
                      </button>
                      <button onClick={handleSaveCargo} disabled={savingCargo || !editCargo.nome?.trim()}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white bg-teal-600 hover:bg-teal-500 transition-colors disabled:opacity-50">
                        {savingCargo ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        {t('actions.save')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab: Importar */}
          {tab === 'importar' && (
            <>
              <div className="rounded-xl p-4 border border-white/[0.06] mb-4" style={{ background: '#0F2A4A' }}>
                <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-2">{t('import.collaboratorsTitle')}</p>
                <p className="text-xs text-gray-400 mb-2">{t('import.collaboratorsDescription')}</p>
                <div className="overflow-x-auto">
                  <table className="text-[10px] text-gray-300">
                    <thead><tr className="border-b border-white/[0.06]">
                      <th className="pr-4 py-1 text-left font-bold text-white">{t('import.column')}</th>
                      <th className="pr-4 py-1 text-left font-bold text-white">{t('import.required')}</th>
                      <th className="py-1 text-left font-bold text-white">{t('import.example')}</th>
                    </tr></thead>
                    <tbody>
                      <tr><td className="pr-4 py-0.5 text-cyan-400 font-semibold">email</td><td className="pr-4">{t('import.yesStar')}</td><td>maria@empresa.com</td></tr>
                      <tr><td className="pr-4 py-0.5">nome / nome_completo</td><td className="pr-4">{t('import.no')}</td><td>Maria Silva</td></tr>
                      <tr><td className="pr-4 py-0.5">cargo</td><td className="pr-4">{t('import.no')}</td><td>Coordenadora</td></tr>
                      <tr><td className="pr-4 py-0.5">role / papel</td><td className="pr-4">{t('import.no')}</td><td>colaborador / gestor / rh</td></tr>
                      <tr><td className="pr-4 py-0.5 text-cyan-400 font-semibold">telefone / whatsapp / celular</td><td className="pr-4">{t('import.yesStar')}</td><td>5511999998888</td></tr>
                      <tr><td className="pr-4 py-0.5">gestor_nome / gestor</td><td className="pr-4">{t('import.no')}</td><td>João Souza</td></tr>
                      <tr><td className="pr-4 py-0.5">gestor_email</td><td className="pr-4">{t('import.no')}</td><td>joao@empresa.com</td></tr>
                      <tr><td className="pr-4 py-0.5">gestor_whatsapp / gestor_telefone</td><td className="pr-4">{t('import.no')}</td><td>5511988887777</td></tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-gray-600 mt-2">{t.rich('import.defaultRoleHint', {
                  role: chunks => <span className="text-gray-400">{chunks}</span>,
                  collaborator: chunks => <span className="text-cyan-400">{chunks}</span>,
                })}</p>
                <p className="text-[10px] text-amber-300/80 mt-1">{t.rich('import.contactRequiredHint', {
                  strong: chunks => <span className="text-gray-300">{chunks}</span>,
                })}</p>
              </div>

              <label className="flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white cursor-pointer"
                style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
                {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {importing ? t('actions.importing') : t('actions.importCollaboratorsCsv')}
                <input type="file" accept=".csv,.xlsx,.xls" onChange={handleCSV} className="hidden" disabled={importing} />
              </label>

              {/* Importar Cargos */}
              <div className="rounded-xl p-4 border border-white/[0.06] mt-6 mb-4" style={{ background: '#0F2A4A' }}>
                <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-2">{t('import.rolesTitle')}</p>
                <p className="text-xs text-gray-400 mb-2">{t('import.rolesDescription')}</p>
                <div className="overflow-x-auto">
                  <table className="text-[10px] text-gray-300">
                    <thead><tr className="border-b border-white/[0.06]">
                      <th className="pr-4 py-1 text-left font-bold text-white">{t('import.column')}</th>
                      <th className="pr-4 py-1 text-left font-bold text-white">{t('import.required')}</th>
                      <th className="py-1 text-left font-bold text-white">{t('import.example')}</th>
                    </tr></thead>
                    <tbody>
                      <tr><td className="pr-4 py-0.5 text-purple-400 font-semibold">nome / cargo</td><td className="pr-4">{t('import.yes')}</td><td>Gerente Comercial</td></tr>
                      <tr><td className="pr-4 py-0.5">area_depto / area</td><td className="pr-4">{t('import.no')}</td><td>Comercial</td></tr>
                      <tr><td className="pr-4 py-0.5">descricao</td><td className="pr-4">{t('import.no')}</td><td>Responsável por...</td></tr>
                      <tr><td className="pr-4 py-0.5">principais_entregas</td><td className="pr-4">{t('import.no')}</td><td>Meta de vendas, pipeline...</td></tr>
                      <tr><td className="pr-4 py-0.5">stakeholders</td><td className="pr-4">{t('import.no')}</td><td>Diretoria, clientes...</td></tr>
                      <tr><td className="pr-4 py-0.5">eh_lideranca</td><td className="pr-4">{t('import.no')}</td><td>{t('import.leadershipExample')}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <label className="flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white cursor-pointer"
                style={{ background: 'linear-gradient(135deg, #9E4EDD, #3B0A6D)' }}>
                {importing ? <Loader2 size={14} className="animate-spin" /> : <Briefcase size={14} />}
                {importing ? t('actions.importing') : t('actions.importRolesCsv')}
                <input type="file" accept=".csv,.xlsx,.xls" onChange={handleCargosCSV} className="hidden" disabled={importing} />
              </label>
            </>
          )}

          {msg && <p className="text-xs text-cyan-400 mt-3 text-center whitespace-pre-line">{msg}</p>}
        </>
      )}
    </div>
  );
}


function SortTh({ col, sortBy, sortDir, onClick, children }: {
  col: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  onClick: (col: string) => void;
  children: React.ReactNode;
}) {
  const active = sortBy === col;
  return (
    <th className="px-4 py-2 text-left">
      <button
        type="button"
        onClick={() => onClick(col)}
        className={`inline-flex items-center gap-1 transition-colors ${active ? "text-cyan-300" : "text-gray-500 hover:text-gray-300"}`}
      >
        <span>{children}</span>
        <span className="text-[8px] opacity-70">
          {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}
