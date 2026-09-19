'use client';
/**
 * Devolutiva por competência do atendimento no componente COMUM aos três
 * simuladores (18/09/2026). Antes cada simulador tinha a sua, com "N2 · 2,5/4"
 * aqui e "Nível 2" na liderança; agora a leitura é a mesma.
 */
import { useTranslations } from 'next-intl';
import RelatorioCompetencias from '@/components/simuladores/relatorio-competencias';
import type { Estado } from '@/lib/recepcao/model';
import { competenciasDoAtendimento, posicaoNaConversa } from './relatorio-matriz';

export default function MatrizAtendimento({
  relatorio,
  historico,
  nomePersona,
  dominio,
  publico = 'voce',
}: {
  relatorio: NonNullable<Estado['relatorio']>;
  historico: Array<{ id: string; role: 'user' | 'assistant' }>;
  nomePersona: string;
  dominio?: string;
  /** `voce` fala com quem treinou; `equipe` é a revisão de quem acompanha. */
  publico?: 'voce' | 'equipe';
}) {
  const t = useTranslations('SimuladorAtendimento');
  const rotulo = ({ mensagemId }: { mensagemId: string }) => {
    const p = posicaoNaConversa(historico, mensagemId);
    if (!p) return null;
    if (p.papel === 'assistant') return t('personLine', { n: p.ordem, name: nomePersona });
    return t(publico === 'voce' ? 'yourReply' : 'teamReply', { n: p.ordem });
  };
  const { competencias, media, regra } = competenciasDoAtendimento(relatorio, dominio, rotulo);
  return (
    <RelatorioCompetencias
      competencias={competencias}
      media={media}
      regra={regra}
      tema="claro"
      acento="var(--teal)"
      abrirFoco={false}
    />
  );
}
