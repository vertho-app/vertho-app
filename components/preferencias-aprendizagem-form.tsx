'use client';

import { useTranslations } from 'next-intl';

/**
 * Grade de preferências de aprendizagem: 8 formatos, 1 a 5 estrelas cada.
 *
 * Fonte única do markup — usada na última etapa do mapeamento DISC
 * (`app/dashboard/perfil-comportamental/mapeamento`) e na tela avulsa
 * (`app/dashboard/preferencias-aprendizagem`) de quem não faz o DISC nativo.
 * Os rótulos vêm de `BehavioralMapping.learning`, para os dois lugares falarem
 * igual nos 4 idiomas.
 */
export const FORMATOS_APRENDIZAGEM = [
  { id: 'video_short', icon: '🎬' },
  { id: 'text', icon: '📄' },
  { id: 'audio', icon: '🎧' },
  { id: 'infographic', icon: '📊' },
  { id: 'exercise', icon: '🎯' },
  { id: 'mentor', icon: '🤖' },
  { id: 'case', icon: '📋' },
] as const;

export function prefsVazias(): Record<string, number> {
  return Object.fromEntries(FORMATOS_APRENDIZAGEM.map(f => [f.id, 0]));
}

export default function PreferenciasAprendizagemForm({
  value,
  onChange,
}: {
  value: Record<string, number>;
  onChange: (formatId: string, star: number) => void;
}) {
  const t = useTranslations('BehavioralMapping');
  return (
    /* Duas colunas no computador; cada formato mantém sua escala completa. */
    <div className="grid gap-3 lg:grid-cols-2">
      {FORMATOS_APRENDIZAGEM.map(fmt => (
        <div key={fmt.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-3 p-4 rounded-xl" style={{ background: '#182B48' }}>
          <span className="text-[18px] shrink-0">{fmt.icon}</span>
          <span className="flex-1 text-[14px] font-semibold text-white leading-snug">{t(`learning.formats.${fmt.id}`)}</span>
          <div className="col-span-2 flex gap-2">
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                type="button"
                aria-label={t('learning.ratingLabel', { value: star, format: t(`learning.formats.${fmt.id}`) })}
                aria-pressed={value[fmt.id] === star}
                onClick={() => onChange(fmt.id, star)}
                className="h-11 flex-1 rounded-md flex items-center justify-center text-lg transition-all"
                style={{
                  background: value[fmt.id] >= star ? 'rgba(252,211,77,0.15)' : 'rgba(255,255,255,0.04)',
                  color: value[fmt.id] >= star ? '#FCD34D' : '#64748B',
                }}
              >
                ★
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
