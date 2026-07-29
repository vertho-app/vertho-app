'use client';

// CONARH 52 — painel diário: os 5 números do dia + funil por porta. Uma tela
// que o sócio abre às 18h e entende em 5 minutos. Auto-refresh 60 s.

import { useCallback, useEffect, useState } from 'react';
import { AvisoSync, buscarComCache, PortaoChave, ShellEquipe, useChaveEquipe } from '../_components/equipe';
import { COR, SANS, SERIF } from '../_components/tema';

interface PainelDados {
  rotas_concluidas: number;
  leads_a: number;
  leads_b: number;
  reunioes: number;
  capturas: number;
  funil_por_porta: Array<{ porta: number; total: number }>;
  divergencias_media: number;
}

const CACHE = 'conarh:cache-painel-v1';

function Numero({ rotulo, valor, cor }: { rotulo: string; valor: number; cor?: string }) {
  return (
    <div
      className="rounded-3xl border p-6"
      style={{ background: COR.card, borderColor: COR.borda, minWidth: 160, flex: '1 1 160px' }}
    >
      <p
        className="uppercase font-bold"
        style={{ color: COR.texto3, fontSize: 13, letterSpacing: '0.16em', fontFamily: SANS, margin: 0 }}
      >
        {rotulo}
      </p>
      <p
        style={{
          color: cor ?? COR.texto,
          fontFamily: SERIF,
          fontSize: 56,
          fontWeight: 600,
          lineHeight: 1.05,
          margin: '8px 0 0',
        }}
      >
        {valor}
      </p>
    </div>
  );
}

export default function PainelPage() {
  const { key, pronto, definir } = useChaveEquipe();
  const [dados, setDados] = useState<PainelDados | null>(null);
  const [sincronizadoEm, setSincronizadoEm] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!key) return;
    const r = await buscarComCache<PainelDados>(
      `/api/conarh/painel?key=${encodeURIComponent(key)}`,
      CACHE,
    );
    if (r.dados) setDados(r.dados);
    setSincronizadoEm(r.sincronizadoEm);
    setErro(r.erro);
  }, [key]);

  useEffect(() => {
    carregar();
    const intervalo = setInterval(carregar, 60_000);
    return () => clearInterval(intervalo);
  }, [carregar]);

  const maiorFunil = Math.max(1, ...(dados?.funil_por_porta.map((f) => f.total) ?? [1]));

  return (
    <ShellEquipe titulo="Painel do dia" sub="Os cinco números que importam — lidos em 5 minutos às 18h.">
      {!pronto ? null : !key ? (
        <PortaoChave onDefinir={definir} />
      ) : !dados ? (
        <AvisoSync sincronizadoEm={sincronizadoEm} erro={erro} />
      ) : (
        <>
          <AvisoSync sincronizadoEm={sincronizadoEm} erro={erro} />

          <div className="flex flex-wrap gap-4 mt-6">
            <Numero rotulo="Rotas concluídas" valor={dados.rotas_concluidas} />
            <Numero rotulo="Leads A" valor={dados.leads_a} cor={COR.verde} />
            <Numero rotulo="Leads B" valor={dados.leads_b} cor={COR.ambar} />
            <Numero rotulo="Reuniões marcadas" valor={dados.reunioes} cor={COR.acento} />
            <Numero rotulo="Capturas" valor={dados.capturas} />
          </div>

          <div
            className="rounded-3xl border p-6 mt-6"
            style={{ background: COR.card, borderColor: COR.borda }}
          >
            <p
              className="uppercase font-bold mb-4"
              style={{ color: COR.texto3, fontSize: 13, letterSpacing: '0.16em', fontFamily: SANS }}
            >
              Funil por porta
            </p>
            <div className="space-y-3">
              {dados.funil_por_porta.map((f) => (
                <div key={f.porta} className="flex items-center gap-4">
                  <span style={{ color: COR.texto2, fontSize: 17, fontWeight: 700, fontFamily: SANS, width: 70 }}>
                    Porta {f.porta}
                  </span>
                  <div className="flex-1 rounded-full" style={{ background: 'rgba(255,255,255,0.07)', height: 18 }}>
                    <div
                      className="rounded-full"
                      style={{
                        background: `linear-gradient(90deg, ${COR.acento}, ${COR.acentoEscuro})`,
                        height: 18,
                        width: `${(f.total / maiorFunil) * 100}%`,
                        minWidth: f.total > 0 ? 18 : 0,
                      }}
                    />
                  </div>
                  <strong style={{ color: COR.texto, fontSize: 18, fontFamily: SANS, width: 40, textAlign: 'right' }}>
                    {f.total}
                  </strong>
                </div>
              ))}
            </div>
          </div>

          <div
            className="rounded-3xl border p-6 mt-6"
            style={{ background: COR.card, borderColor: COR.borda }}
          >
            <p
              className="uppercase font-bold mb-1"
              style={{ color: COR.texto3, fontSize: 13, letterSpacing: '0.16em', fontFamily: SANS }}
            >
              Divergências por sessão (média)
            </p>
            <p style={{ color: COR.texto, fontFamily: SERIF, fontSize: 40, fontWeight: 600, margin: 0 }}>
              {dados.divergencias_media.toFixed(1)}
            </p>
            <p style={{ color: COR.texto2, fontSize: 16, fontFamily: SANS, marginTop: 6, marginBottom: 0 }}>
              Quantas vezes, em média, o instinto do visitante divergiu da leitura criteriosa — o
              tamanho da dor que a matriz resolve.
            </p>
          </div>
        </>
      )}
    </ShellEquipe>
  );
}
