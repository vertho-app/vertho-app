import { redirect } from 'next/navigation';

// Tela legada do funil BETT (projeto radarbett descontinuado em 25/05).
// Mantida como redirect para o funil geral do Radar.
// (Reorganização do admin, Fase 1.)
export default function FunnelBettRedirect() {
  redirect('/admin/radar/funnel');
}
