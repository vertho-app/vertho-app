import { CUSTO_IA_HTML } from './custo-ia-html';

/**
 * Dashboard do plano de custo IA — mesmo fonte do artefato claude.ai
 * (889943d5…), servido DENTRO do admin porque o artefato é privado à conta
 * dona no claude.ai (perfil de navegador com outra sessão → 404). Auth = o
 * gate do próprio /admin (AdminShell). iframe srcDoc: o HTML é autocontido
 * (estilos + scripts próprios, tema claro/escuro embutido).
 */
export default function CustoIaPage() {
  return (
    <iframe
      title="Plano de custo IA"
      srcDoc={CUSTO_IA_HTML}
      sandbox="allow-scripts allow-downloads"
      style={{ width: '100%', height: 'calc(100vh - 120px)', border: 0, borderRadius: 12, background: '#0a1120' }}
    />
  );
}
