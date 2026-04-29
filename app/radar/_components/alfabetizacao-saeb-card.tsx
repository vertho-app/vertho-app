import { GraduationCap } from 'lucide-react';
import type { IcaSnapshot, SaebSnapshot } from '@/lib/radar/queries';

/**
 * Cruzamento #3 — Continuidade alfabetização → proficiência.
 * ICA mede alfabetização no 2º ano EF; Saeb 5º EF mede proficiência três
 * anos depois. Não é causa-efeito direto (alunos podem mudar de escola),
 * mas sinaliza se a "trajetória esperada" se confirma.
 */

function tomDiff(school: number | null, expected: { lo: number; hi: number }): {
  texto: string;
  cor: string;
} {
  if (school == null) return { texto: 'sem dado Saeb', cor: 'rgba(255,255,255,0.5)' };
  if (school < expected.lo) return { texto: 'abaixo do esperado', cor: '#fca5a5' };
  if (school > expected.hi) return { texto: 'acima do esperado', cor: '#86efac' };
  return { texto: 'dentro do esperado', cor: 'rgba(255,255,255,0.7)' };
}

/**
 * Faixa esperada de Saeb 5EF LP a partir do ICA municipal.
 * Heurística simples: ICA alta (>70%) → esperado Saeb 195+ ; ICA média (50-70) → 180-200; baixa (<50) → 165-185.
 */
function faixaEsperada(ica: number): { lo: number; hi: number; rotulo: string } {
  if (ica >= 70) return { lo: 195, hi: 220, rotulo: 'alfabetização alta' };
  if (ica >= 50) return { lo: 180, hi: 205, rotulo: 'alfabetização média' };
  return { lo: 165, hi: 190, rotulo: 'alfabetização baixa' };
}

export function AlfabetizacaoSaebCard({
  ica,
  saeb,
  municipio,
}: {
  ica: IcaSnapshot | null;
  saeb: SaebSnapshot[];
  municipio: string;
}) {
  // Pega Saeb 5EF LP da escola (etapa onde a continuidade ICA→Saeb é mais direta)
  const saeb5LP = saeb.filter((s) => s.etapa === '5_EF' && s.disciplina === 'LP')
    .sort((a, b) => b.ano - a.ano)[0];

  // Só mostra a seção se temos os dois dados
  if (!ica || !saeb5LP || saeb5LP.media_proficiencia == null) return null;

  const icaTaxa = ica.taxa ?? 0;
  const escolaSaeb = saeb5LP.media_proficiencia;
  const faixa = faixaEsperada(icaTaxa);
  const tom = tomDiff(escolaSaeb, faixa);

  return (
    <section className="mb-12">
      <p className="text-[11px] tracking-[0.15em] uppercase font-bold mb-3" style={{ color: '#34c5cc' }}>
        Cruzamento Vertho
      </p>
      <h2 className="text-white mb-3"
        style={{
          fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
          fontSize: 'clamp(24px, 3vw, 32px)',
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
        }}>
        Alfabetização · {municipio} → Proficiência · esta escola
      </h2>
      <p className="text-white/60 mb-6 leading-relaxed" style={{ fontSize: 15, maxWidth: 720 }}>
        ICA mede alfabetização no 2º ano EF; Saeb 5º EF mede a proficiência três anos
        depois. Não é causa-efeito direto (alunos mudam de escola), mas a tendência
        regional ajuda a contextualizar o resultado individual.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="rounded-2xl p-5 border border-white/[0.08]"
          style={{ background: 'rgba(154,226,230,0.04)', borderColor: 'rgba(154,226,230,0.15)' }}>
          <div className="flex items-center gap-2 mb-2">
            <GraduationCap size={14} style={{ color: '#9ae2e6' }} />
            <p className="text-[10px] tracking-[0.18em] uppercase font-bold" style={{ color: '#9ae2e6' }}>
              ICA · {municipio} · {ica.ano}
            </p>
          </div>
          <p className="text-white"
            style={{
              fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
              fontSize: 36, fontWeight: 600, lineHeight: 1,
            }}>
            {icaTaxa.toFixed(1)}<span className="text-base text-white/50 ml-1">%</span>
          </p>
          <p className="text-[12px] text-white/55 mt-2">crianças alfabetizadas no 2º ano EF</p>
        </div>

        <div className="rounded-2xl p-5 border border-white/[0.08] flex flex-col justify-center items-center text-center"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          <p className="text-[10px] tracking-[0.18em] uppercase font-bold text-white/40 mb-2">
            Faixa esperada
          </p>
          <p className="text-white/85"
            style={{
              fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
              fontSize: 22, fontWeight: 600, lineHeight: 1,
            }}>
            {faixa.lo}–{faixa.hi}
          </p>
          <p className="text-[12px] text-white/45 mt-2">
            saeb 5º EF LP · contexto "{faixa.rotulo}"
          </p>
        </div>

        <div className="rounded-2xl p-5 border border-white/[0.08]"
          style={{
            background: tom.cor === '#fca5a5' ? 'rgba(220,38,38,0.06)' :
                        tom.cor === '#86efac' ? 'rgba(34,197,94,0.06)' :
                        'rgba(255,255,255,0.03)',
            borderColor: tom.cor === '#fca5a5' ? 'rgba(220,38,38,0.25)' :
                         tom.cor === '#86efac' ? 'rgba(110,231,183,0.25)' :
                         'rgba(255,255,255,0.08)',
          }}>
          <p className="text-[10px] tracking-[0.18em] uppercase font-bold mb-2"
            style={{ color: tom.cor }}>
            Saeb 5º EF · LP · {saeb5LP.ano}
          </p>
          <p className="text-white"
            style={{
              fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
              fontSize: 36, fontWeight: 600, lineHeight: 1,
            }}>
            {escolaSaeb.toFixed(0)}
          </p>
          <p className="text-[12px] mt-2" style={{ color: tom.cor }}>
            {tom.texto}
          </p>
        </div>
      </div>

      <div className="rounded-xl px-4 py-3 text-[13px] leading-relaxed"
        style={{
          background: 'rgba(255,255,255,0.04)',
          borderLeft: '3px solid #9ae2e6',
          color: 'rgba(255,255,255,0.7)',
        }}>
        <strong className="text-white/85">Como ler:</strong> a faixa esperada é uma referência
        nacional aproximada por nível de alfabetização. Saeb {tom.texto} sugere que{' '}
        {tom.cor === '#86efac' ? (
          'a escola está agregando valor além do que a alfabetização do município preveria.'
        ) : tom.cor === '#fca5a5' ? (
          'a escola está perdendo alunos no caminho — vale investigar pedagogia e fluxo.'
        ) : (
          'a escola acompanha o que se espera para o nível de alfabetização da rede municipal.'
        )}
      </div>
    </section>
  );
}
