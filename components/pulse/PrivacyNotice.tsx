'use client';

import { Shield } from 'lucide-react';

/**
 * Aviso de privacidade exibido no intro do Pulso. Texto obrigatório por spec —
 * não promete conformidade legal, deixa claro o que vai pra gestor/RH.
 */
export function PrivacyNotice() {
  return (
    <div className="flex gap-3 p-4 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04]">
      <Shield size={18} className="text-cyan-400 shrink-0 mt-0.5" />
      <p className="text-xs text-gray-300 leading-relaxed">
        Suas respostas individuais ajudam a personalizar sua jornada. Para gestores e RH,
        a Vertho mostra apenas análises agregadas da equipe, sem identificar pessoas ou
        expor respostas individuais.
      </p>
    </div>
  );
}
