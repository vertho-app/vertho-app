'use client';

// Portal do Representante — Inteligência Comercial (materiais, playbooks, cases).
import { useEffect, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { listActiveSalesMaterials } from '@/actions/sales/materials';
import { MATERIAL_CATEGORIES } from '@/lib/sales/constants';
import type { SalesMaterial } from '@/lib/sales/types';
import PlaybookSection from '@/components/sales/playbook-section';

function Skeleton() {
  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 animate-pulse">
      <div className="h-9 w-72 max-w-full rounded-lg" style={{ background: 'rgba(255,255,255,.05)' }} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-36 rounded-2xl" style={{ background: 'rgba(255,255,255,.04)' }} />
        ))}
      </div>
    </div>
  );
}

export default function InteligenciaComercialPage() {
  const [materials, setMaterials] = useState<SalesMaterial[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listActiveSalesMaterials()
      .then((res) => {
        if (!alive) return;
        if (res.success) setMaterials(res.data || []);
        else setError((res as any).error || 'Falha ao carregar os materiais');
      })
      .catch((e) => { if (alive) setError(e?.message || 'Falha ao carregar os materiais'); });
    return () => { alive = false; };
  }, []);

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-2xl p-6 text-center" style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.3)' }}>
          <p className="text-sm font-bold text-white">Não foi possível carregar os materiais</p>
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,.6)' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!materials) return <Skeleton />;

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-white">Inteligência Comercial</h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,.55)' }}>
          Materiais, playbooks, respostas a objeções e cases para acelerar suas conversas comerciais.
        </p>
      </div>

      {materials.length === 0 ? (
        <div
          className="rounded-2xl p-8 text-center flex flex-col items-center gap-3"
          style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}
        >
          <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(52,197,204,.1)', color: '#34c5cc' }}>
            <Lightbulb size={18} />
          </span>
          <p className="text-sm font-bold text-white">Materiais em preparação</p>
          <p className="text-xs max-w-sm leading-relaxed" style={{ color: 'rgba(255,255,255,.55)' }}>
            A Vertho está publicando os materiais do canal. Assim que estiverem disponíveis, eles aparecem aqui.
          </p>
        </div>
      ) : (
        MATERIAL_CATEGORIES.map((category) => (
          <PlaybookSection
            key={category}
            category={category}
            materials={materials.filter((m) => m.category === category)}
          />
        ))
      )}
    </div>
  );
}
