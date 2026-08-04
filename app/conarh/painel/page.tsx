'use client';

// CONARH 52 — painel diário: os 5 números do dia + funil por porta. Uma tela
// que o sócio abre às 18h e entende em 5 minutos. Auto-refresh 60 s.

import { useCallback, useEffect, useState } from 'react';
import { AvisoSync, buscarComCache, PortaoChave, ShellEquipe, useChaveEquipe } from '../_components/equipe';
import { COR, SANS, SERIF } from '../_components/tema';

// Espelha EXATAMENTE o corpo de GET /api/conarh/painel. A versão anterior
// desta interface era outro formato (números na raiz, funil como array,
// divergencias_media) — o `buscarComCache<PainelDados>` é um cast, não uma
// validação, então o descasamento passou pelo typecheck e só apareceria no
// estande: `funil_por_porta.map is not a function` derruba a tela inteira.
interface PainelDados {
  ok: boolean;
  dia: string;
  numeros: {
    rotas_concluidas: number;
    leads_a: number;
    leads_b: number;
    reunioes_com_data: number;
    total_capturas: number;
  };
  funil_por_porta: Record<string, number>;
  cenario_porta2: {
    sessoes: number;
    abaixo_da_meta: number;
    nivel_medio_aceito: number | null;
    por_competencia: Record<string, number>;
    amostra_suficiente: boolean;
  };
}

// v3 (04/08/2026): a etapa 2 trocou o registro escrito pelo cenário, então o
// bloco medido deixou de ser `divergencias_porta2`. Chave nova — um tablet com
// cache velho renderizaria o formato antigo e quebraria a tela no estande.
const CACHE = 'conarh:cache-painel-v3';

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

  const funil = Object.entries(dados?.funil_por_porta ?? {})
    .map(([porta, total]) => ({ porta: Number(porta), total }))
    .sort((a, b) => a.porta - b.porta);
  const maiorFunil = Math.max(1, ...funil.map((f) => f.total));

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
            <Numero rotulo="Rotas concluídas" valor={dados.numeros.rotas_concluidas} />
            <Numero rotulo="Leads A" valor={dados.numeros.leads_a} cor={COR.verde} />
            <Numero rotulo="Leads B" valor={dados.numeros.leads_b} cor={COR.ambar} />
            <Numero rotulo="Reuniões marcadas" valor={dados.numeros.reunioes_com_data} cor={COR.acento} />
            <Numero rotulo="Capturas" valor={dados.numeros.total_capturas} />
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
              {funil.map((f) => (
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
              Aceitaram abaixo da meta (N3)
            </p>
            <p style={{ color: COR.texto, fontFamily: SERIF, fontSize: 40, fontWeight: 600, margin: 0 }}>
              {dados.cenario_porta2.sessoes === 0
                ? '—'
                : `${dados.cenario_porta2.abaixo_da_meta} de ${dados.cenario_porta2.sessoes}`}
            </p>
            <p style={{ color: COR.texto2, fontSize: 16, fontFamily: SANS, marginTop: 6, marginBottom: 0 }}>
              Quantos gestores aceitariam, de alguém do time deles, uma resposta que a régua lê
              abaixo da meta — a distância entre o padrão que se cobra e o que se diz querer.
            </p>
            <p style={{ color: COR.texto3, fontSize: 15, fontFamily: SANS, marginTop: 8, marginBottom: 0 }}>
              Nível médio aceito:{' '}
              {dados.cenario_porta2.nivel_medio_aceito === null
                ? '—'
                : `N${dados.cenario_porta2.nivel_medio_aceito.toFixed(1)}`}
              .{' '}
              {Object.entries(dados.cenario_porta2.por_competencia)
                .map(([comp, n]) => `${comp}: ${n}`)
                .join(' · ')}
              {!dados.cenario_porta2.amostra_suficiente && (
                <> Amostra ainda menor que 7 — não publicar.</>
              )}
            </p>
          </div>
        </>
      )}
    </ShellEquipe>
  );
}
