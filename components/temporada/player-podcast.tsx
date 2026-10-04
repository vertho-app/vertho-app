'use client';

import { useEffect, useState } from 'react';
import FormatoIndisponivel, { type AlternativaDeFormato } from './formato-indisponivel';

/** Só avisa que está gerando depois disto: o áudio já pronto abre sem o aviso piscar. */
export const ATRASO_AVISO_GERANDO_MS = 2000;

/**
 * O player do podcast da semana, que diz o que está acontecendo (R-93, 04/10/2026).
 *
 * 🔴 O DEFEITO. O áudio personalizado de quem ainda não tem cópia pronta é gerado NA
 * HORA pela rota (`/api/conteudo/<id>/podcast`: p50 de 99 s, p90 de 141 s, medido em
 * 10/09/2026), e o `<audio>` ficava mudo e parado durante esse minuto e meio, sem uma
 * palavra: a pessoa concluía que não funcionava. E quando a rota respondia 404 ou 400
 * (sem áudio-base, ou o id de outro formato) o player seguia mudo para sempre.
 *
 * Agora: depois de 2 s carregando, "gerando o seu podcast, na primeira vez pode levar
 * até 2 minutos"; se o carregamento falha, a mensagem e os outros formatos da semana.
 */
export default function PlayerPodcast({
  src,
  onEnded,
  alternativas,
  t,
}: {
  src: string;
  onEnded?: () => void;
  alternativas: AlternativaDeFormato[];
  t: (chave: string, params?: Record<string, string | number>) => string;
}) {
  const [estado, setEstado] = useState<'ocioso' | 'carregando' | 'pronto' | 'erro'>('ocioso');
  const [avisar, setAvisar] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (estado !== 'carregando') { setAvisar(false); return; }
    const id = setTimeout(() => setAvisar(true), ATRASO_AVISO_GERANDO_MS);
    return () => clearTimeout(id);
  }, [estado]);

  if (estado === 'erro') {
    return (
      <FormatoIndisponivel
        mensagem={t('formats.audioFailed')}
        alternativas={alternativas}
        onTentarDeNovo={() => { setEstado('ocioso'); setTentativa((n) => n + 1); }}
        t={t}
      />
    );
  }

  return (
    <div>
      <audio
        key={tentativa}
        controls
        className="w-full"
        src={src}
        onLoadStart={() => setEstado('carregando')}
        onLoadedMetadata={(event) => { event.currentTarget.currentTime = 0; setEstado('pronto'); }}
        onCanPlay={() => setEstado('pronto')}
        onError={() => setEstado('erro')}
        onEnded={onEnded}
      />
      {estado === 'carregando' && avisar && (
        <p role="status" className="mt-2 text-[12px] leading-snug text-gray-300">
          {t('formats.audioGenerating')}
        </p>
      )}
    </div>
  );
}
