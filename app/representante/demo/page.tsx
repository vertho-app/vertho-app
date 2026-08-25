'use client';

// Ambiente de Demonstração — o RC entra no tenant de treino (acme-demo) COMO
// uma persona, em nova aba (host separado), para treinar e apresentar a um
// prospect. A sessão do portal continua ativa aqui. Envios reais ficam
// desligados no demo (gate de tenant-demo).
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MonitorPlay, Loader2, ExternalLink, ShieldCheck, Info } from 'lucide-react';
import { listarPersonasDemo, entrarNoDemoComoPersona } from '@/actions/sales/demo-access';

type Persona = { key: string; nome: string; papel: string; cenario: string; disc: string | null; hint: string };

const DISC_COR: Record<string, string> = { D: '#EF4444', I: '#F59E0B', S: '#22C55E', C: '#3B82F6' };

export default function DemoPage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [abrindo, setAbrindo] = useState<string | null>(null);

  useEffect(() => {
    listarPersonasDemo()
      .then((r) => { if (r.success) setPersonas(r.personas); })
      .catch(() => toast.error('Não foi possível carregar o ambiente de demonstração'))
      .finally(() => setLoading(false));
  }, []);

  async function abrir(key: string) {
    setAbrindo(key);
    try {
      const r = await entrarNoDemoComoPersona(key);
      if (r.success) {
        // Nova aba no host do demo — a sessão do portal (host do app) permanece.
        window.open(r.url, '_blank', 'noopener');
        toast.success(`Abrindo a demonstração como ${r.persona.nome}…`);
      } else {
        toast.error(r.error || 'Não foi possível abrir a demonstração');
      }
    } catch {
      toast.error('Falha ao abrir a demonstração');
    } finally {
      setAbrindo(null);
    }
  }

  return (
    <div className="max-w-[1000px] mx-auto px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <MonitorPlay size={20} className="text-cyan-400" /> Ambiente de Demonstração
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Entre como uma persona para treinar o produto ou apresentar ao vivo. Abre em nova aba — seu portal continua aqui.
        </p>
      </div>

      {/* Avisos */}
      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        <div className="flex items-start gap-2 rounded-xl p-3 text-[11px] leading-relaxed"
          style={{ background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.2)', color: '#a7f3c0' }}>
          <ShieldCheck size={15} className="text-emerald-400 shrink-0 mt-0.5" />
          <span>Ambiente seguro: <b>nenhum e-mail ou WhatsApp real é enviado</b> a partir da demonstração.</span>
        </div>
        <div className="flex items-start gap-2 rounded-xl p-3 text-[11px] leading-relaxed"
          style={{ background: 'rgba(52,197,204,.06)', border: '1px solid rgba(52,197,204,.2)', color: 'rgba(255,255,255,.7)' }}>
          <Info size={15} className="text-cyan-400 shrink-0 mt-0.5" />
          <span>É um ambiente <b>compartilhado</b> e reiniciado todas as noites. Prepare sua demonstração pouco antes de apresentar.</span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-cyan-400" /></div>
      ) : personas.length === 0 ? (
        <div className="text-center py-14 text-gray-500 text-sm">Ambiente de demonstração indisponível no momento.</div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {personas.map((p) => (
            <div key={p.key} className="rounded-2xl p-4 flex flex-col"
              style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ background: `${DISC_COR[p.disc || ''] || '#64748B'}22`, color: DISC_COR[p.disc || ''] || '#94a3b8', border: `1px solid ${DISC_COR[p.disc || ''] || '#64748B'}55` }}>
                  {p.nome.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{p.nome}</p>
                  <p className="text-[11px] text-gray-400">
                    {p.papel} · {p.cenario}{p.disc ? ` · DISC ${p.disc}` : ''}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed flex-1 mb-3">{p.hint}</p>
              <button
                onClick={() => abrir(p.key)}
                disabled={!!abrindo}
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-40"
                style={{ background: 'rgba(52,197,204,.12)', border: '1px solid rgba(52,197,204,.35)', color: '#34c5cc' }}
              >
                {abrindo === p.key ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                Abrir como {p.nome.split(' ')[0]}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
