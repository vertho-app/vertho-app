'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Upload, Loader2, Users, Pencil, Trash2, X, Check, Briefcase, RefreshCw, Plus, Save } from 'lucide-react';
import {
  loadEmpresas, loadResumoEmpresa, importarColaboradoresLote, loadColaboradores, atualizarColaborador, excluirColaborador,
  loadCargos, salvarCargo, excluirCargo, sincronizarCargosDeColaboradores
} from './actions';

const CARGO_FIELDS = [
  { key: 'descricao', label: 'Descrição do Cargo', placeholder: 'Responsabilidades principais...', rows: 3 },
  { key: 'principais_entregas', label: 'Principais Entregas Esperadas', placeholder: 'Resultados que se espera do cargo...', rows: 2 },
  { key: 'stakeholders', label: 'Stakeholders', placeholder: 'Com quem interage: pares, superiores, clientes...', rows: 2 },
  { key: 'decisoes_recorrentes', label: 'Decisões Recorrentes', placeholder: 'Decisões típicas que o cargo precisa tomar...', rows: 2 },
  { key: 'tensoes_comuns', label: 'Tensões e Situações Difíceis', placeholder: 'Conflitos recorrentes, dilemas, pressões...', rows: 2 },
  { key: 'contexto_cultural', label: 'Contexto Cultural (opcional)', placeholder: 'Aspectos culturais específicos do cargo na empresa...', rows: 2 },
];

export default function GerenciarPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const empresaParam = searchParams.get('empresa');
  const [empresas, setEmpresas] = useState([]);
  const [tenantId, setTenantId] = useState(empresaParam || null);
  const [empresaNome, setEmpresaNome] = useState('');
  const [resumo, setResumo] = useState(null);
  const [colabs, setColabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState('');
  const [tab, setTab] = useState('lista'); // lista | importar | cargos
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);

  // Cargos state
  const [cargos, setCargos] = useState([]);
  const [loadingCargos, setLoadingCargos] = useState(false);
  const [editCargo, setEditCargo] = useState(null); // cargo sendo editado
  const [savingCargo, setSavingCargo] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadEmpresas().then(data => {
      setEmpresas(data);
      if (empresaParam) {
        const emp = data.find(e => e.id === empresaParam);
        if (emp) setEmpresaNome(emp.nome);
      }
    }).finally(() => setLoading(false));
  }, [empresaParam]);

  useEffect(() => {
    if (tenantId) {
      loadResumoEmpresa(tenantId).then(setResumo);
      loadColaboradores(tenantId).then(setColabs);
    } else { setResumo(null); setColabs([]); }
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
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    const sep = (lines[0].split(';').length > lines[0].split(',').length) ? ';' : ',';
    const header = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));
    const parsed = lines.slice(1).map(line => {
      const cols = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''));
      const obj = {};
      header.forEach((h, i) => { obj[h] = cols[i]; });
      return { nome: obj.nome || obj.nome_completo, email: obj.email, cargo: obj.cargo, role: obj.role || obj.papel };
    }).filter(c => c.email);

    if (parsed.length === 0) {
      setMsg(`Nenhum colaborador no CSV. Separador detectado: "${sep}". Verifique coluna "email".`);
      setImporting(false); return;
    }

    const r = await importarColaboradoresLote(tenantId, parsed);
    setMsg(r.success ? r.message : r.error);
    setImporting(false);
    if (r.success) refresh();
  }

  function startEdit(c) {
    setEditId(c.id);
    setEditData({ nome_completo: c.nome_completo || '', email: c.email || '', cargo: c.cargo || '', area_depto: c.area_depto || '', role: c.role || 'colaborador', telefone: c.telefone || '', gestor_nome: c.gestor_nome || '', gestor_email: c.gestor_email || '', gestor_whatsapp: c.gestor_whatsapp || '' });
  }

  async function saveEdit() {
    if (!editId) return;
    setSaving(true);
    const r = await atualizarColaborador(editId, editData);
    setSaving(false);
    if (r.success) { setEditId(null); refresh(); setMsg('Colaborador atualizado'); }
    else setMsg('Erro: ' + r.error);
  }

  async function handleDelete(id, nome) {
    if (!confirm(`Excluir "${nome || 'colaborador'}"? Esta ação não pode ser desfeita.`)) return;
    const r = await excluirColaborador(id);
    if (r.success) { refresh(); setMsg('Colaborador excluído'); }
    else setMsg('Erro: ' + r.error);
  }

  async function handleSyncCargos() {
    if (!tenantId) return;
    setSyncing(true);
    const r = await sincronizarCargosDeColaboradores(tenantId);
    setSyncing(false);
    setMsg(r.success ? r.message : 'Erro: ' + r.error);
    if (r.success) refreshCargos();
  }

  async function handleSaveCargo() {
    if (!editCargo || !tenantId) return;
    setSavingCargo(true);
    const r = await salvarCargo(tenantId, editCargo);
    setSavingCargo(false);
    if (r.success) {
      setEditCargo(null);
      refreshCargos();
      setMsg('Cargo salvo');
    } else {
      setMsg('Erro: ' + r.error);
    }
  }

  async function handleDeleteCargo(id, nome) {
    if (!confirm(`Excluir cargo "${nome}"?`)) return;
    const r = await excluirCargo(id);
    if (r.success) { refreshCargos(); setMsg('Cargo excluído'); }
    else setMsg('Erro: ' + r.error);
  }

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6" style={{ minHeight: '100dvh' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-white">Gerenciar Colaboradores</h1>
          {empresaParam && empresaNome && <p className="text-xs text-gray-500">{empresaNome}</p>}
        </div>
        <button onClick={() => router.push(empresaParam ? `/admin/empresas/${empresaParam}` : '/admin/dashboard')}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white">
          <ArrowLeft size={16} /> Voltar
        </button>
      </div>

      {!empresaParam && (
        <select value={tenantId || ''} onChange={e => setTenantId(e.target.value || null)}
          className="w-full px-3 py-2.5 rounded-lg text-sm text-white border border-white/10 outline-none mb-4" style={{ background: '#091D35' }}>
          <option value="">Selecione uma empresa</option>
          {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nome}</option>)}
        </select>
      )}

      {tenantId && (
        <>
          {/* Resumo */}
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-xl px-4 py-3 border border-white/[0.06] flex items-center gap-2" style={{ background: '#0F2A4A' }}>
              <Users size={16} className="text-cyan-400" />
              <span className="text-sm font-bold text-white">{resumo?.colabs || 0} colaboradores</span>
              <span className="text-xs text-gray-500">· {resumo?.competencias || 0} competências</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-4">
            <button onClick={() => setTab('lista')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === 'lista' ? 'bg-cyan-400/15 text-cyan-400' : 'text-gray-500 hover:text-gray-300'}`}>
              Colaboradores ({colabs.length})
            </button>
            <button onClick={() => setTab('cargos')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === 'cargos' ? 'bg-cyan-400/15 text-cyan-400' : 'text-gray-500 hover:text-gray-300'}`}>
              <Briefcase size={12} /> Cargos ({cargos.length || '...'})
            </button>
            <button onClick={() => setTab('importar')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === 'importar' ? 'bg-cyan-400/15 text-cyan-400' : 'text-gray-500 hover:text-gray-300'}`}>
              Importar CSV
            </button>
          </div>

          {/* Tab: Lista */}
          {tab === 'lista' && (
            <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
              {colabs.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-gray-500">Nenhum colaborador cadastrado</p>
                  <button onClick={() => setTab('importar')} className="mt-2 text-xs text-cyan-400 hover:underline">Importar CSV</button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06] text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                        <th className="px-4 py-2 text-left">Nome</th>
                        <th className="px-4 py-2 text-left">Email</th>
                        <th className="px-4 py-2 text-left">Cargo</th>
                        <th className="px-4 py-2 text-left">Área</th>
                        <th className="px-4 py-2 text-left">Role</th>
                        <th className="px-4 py-2 text-left">WhatsApp</th>
                        <th className="px-4 py-2 text-left">Gestor</th>
                        <th className="px-4 py-2 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                      {colabs.map(c => (
                        <tr key={c.id} className="hover:bg-white/[0.02]">
                          {editId === c.id ? (
                            <>
                              <td className="px-4 py-2"><input value={editData.nome_completo} onChange={e => setEditData(p => ({ ...p, nome_completo: e.target.value }))}
                                className="w-full px-2 py-1 rounded text-xs text-white border border-white/10 bg-[#091D35] outline-none" /></td>
                              <td className="px-4 py-2"><input value={editData.email} onChange={e => setEditData(p => ({ ...p, email: e.target.value }))}
                                className="w-full px-2 py-1 rounded text-xs text-white border border-white/10 bg-[#091D35] outline-none" /></td>
                              <td className="px-4 py-2"><input value={editData.cargo} onChange={e => setEditData(p => ({ ...p, cargo: e.target.value }))}
                                className="w-full px-2 py-1 rounded text-xs text-white border border-white/10 bg-[#091D35] outline-none" /></td>
                              <td className="px-4 py-2"><input value={editData.area_depto} onChange={e => setEditData(p => ({ ...p, area_depto: e.target.value }))}
                                className="w-full px-2 py-1 rounded text-xs text-white border border-white/10 bg-[#091D35] outline-none" /></td>
                              <td className="px-4 py-2">
                                <select value={editData.role} onChange={e => setEditData(p => ({ ...p, role: e.target.value }))}
                                  className="px-2 py-1 rounded text-xs text-white border border-white/10 bg-[#091D35] outline-none">
                                  <option value="colaborador">Colaborador</option>
                                  <option value="gestor">Gestor</option>
                                  <option value="rh">RH</option>
                                </select>
                              </td>
                              <td className="px-4 py-2"><input value={editData.telefone} onChange={e => setEditData(p => ({ ...p, telefone: e.target.value }))}
                                placeholder="5511999999999"
                                className="w-full px-2 py-1 rounded text-xs text-white border border-white/10 bg-[#091D35] outline-none" /></td>
                              <td className="px-4 py-2">
                                <input value={editData.gestor_nome} onChange={e => setEditData(p => ({ ...p, gestor_nome: e.target.value }))}
                                  placeholder="Nome do gestor"
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
                                  <button onClick={() => setEditId(null)} className="text-gray-500 hover:text-white"><X size={14} /></button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-2 text-white font-semibold">{c.nome_completo || '—'}</td>
                              <td className="px-4 py-2 text-gray-400 text-xs">{c.email}</td>
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
                  Sincronizar dos Colaboradores
                </button>
                <button onClick={() => setEditCargo({ nome: '', area_depto: '', descricao: '', principais_entregas: '', stakeholders: '', decisoes_recorrentes: '', tensoes_comuns: '', contexto_cultural: '' })}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-white/10 text-gray-300 hover:border-green-400/30 hover:text-green-400 transition-all">
                  <Plus size={12} /> Novo Cargo
                </button>
              </div>

              {loadingCargos ? (
                <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-cyan-400" /></div>
              ) : cargos.length === 0 ? (
                <div className="text-center py-8">
                  <Briefcase size={32} className="text-gray-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">Nenhum cargo cadastrado</p>
                  <p className="text-xs text-gray-600 mt-1">Clique em "Sincronizar dos Colaboradores" para importar os cargos existentes</p>
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
                              {c.descricao ? '● Preenchido' : '○ Pendente'}
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
                      <h2 className="text-lg font-bold text-white">{editCargo.id ? 'Editar' : 'Novo'} Cargo</h2>
                      <button onClick={() => setEditCargo(null)} className="text-gray-500 hover:text-white"><X size={18} /></button>
                    </div>

                    <div className="space-y-4">
                      {/* Nome + Área */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Nome do Cargo *</label>
                          <input value={editCargo.nome || ''} onChange={e => setEditCargo(p => ({ ...p, nome: e.target.value }))}
                            placeholder="Ex: Consultor de Vendas"
                            className="w-full rounded-lg border border-white/10 bg-[#091D35] text-white text-sm px-3 py-2 focus:outline-none focus:border-cyan-400/50" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Área / Depto</label>
                          <input value={editCargo.area_depto || ''} onChange={e => setEditCargo(p => ({ ...p, area_depto: e.target.value }))}
                            placeholder="Ex: Comercial"
                            className="w-full rounded-lg border border-white/10 bg-[#091D35] text-white text-sm px-3 py-2 focus:outline-none focus:border-cyan-400/50" />
                        </div>
                      </div>

                      {/* Campos descritivos */}
                      {CARGO_FIELDS.map(f => (
                        <div key={f.key}>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{f.label}</label>
                          <textarea value={editCargo[f.key] || ''} onChange={e => setEditCargo(p => ({ ...p, [f.key]: e.target.value }))}
                            rows={f.rows} placeholder={f.placeholder}
                            className="w-full rounded-lg border border-white/10 bg-[#091D35] text-white text-sm px-3 py-2 focus:outline-none focus:border-cyan-400/50 resize-none" />
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end gap-2 mt-5">
                      <button onClick={() => setEditCargo(null)} className="px-4 py-2 rounded-lg text-sm text-gray-400 border border-white/10 hover:text-white transition-colors">
                        Cancelar
                      </button>
                      <button onClick={handleSaveCargo} disabled={savingCargo || !editCargo.nome?.trim()}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white bg-teal-600 hover:bg-teal-500 transition-colors disabled:opacity-50">
                        {savingCargo ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Salvar
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
                <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-2">Formato do CSV</p>
                <p className="text-xs text-gray-400 mb-2">O arquivo deve ter cabeçalho na primeira linha. Separador: vírgula ou ponto-e-vírgula (detectado automaticamente).</p>
                <div className="overflow-x-auto">
                  <table className="text-[10px] text-gray-300">
                    <thead><tr className="border-b border-white/[0.06]">
                      <th className="pr-4 py-1 text-left font-bold text-white">Coluna</th>
                      <th className="pr-4 py-1 text-left font-bold text-white">Obrigatória</th>
                      <th className="py-1 text-left font-bold text-white">Exemplo</th>
                    </tr></thead>
                    <tbody>
                      <tr><td className="pr-4 py-0.5 text-cyan-400 font-semibold">email</td><td className="pr-4">Sim</td><td>maria@empresa.com</td></tr>
                      <tr><td className="pr-4 py-0.5">nome / nome_completo</td><td className="pr-4">Não</td><td>Maria Silva</td></tr>
                      <tr><td className="pr-4 py-0.5">cargo</td><td className="pr-4">Não</td><td>Coordenadora</td></tr>
                      <tr><td className="pr-4 py-0.5">role / papel</td><td className="pr-4">Não</td><td>colaborador / gestor / rh</td></tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-gray-600 mt-2">Se <span className="text-gray-400">role</span> vier vazio, o padrão é <span className="text-cyan-400">colaborador</span>. Duplicatas por email são ignoradas.</p>
              </div>

              <label className="flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white cursor-pointer"
                style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
                {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {importing ? 'Importando...' : 'Importar CSV'}
                <input type="file" accept=".csv" onChange={handleCSV} className="hidden" disabled={importing} />
              </label>
            </>
          )}

          {msg && <p className="text-xs text-cyan-400 mt-3 text-center">{msg}</p>}
        </>
      )}
    </div>
  );
}
