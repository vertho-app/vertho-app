'use client';

export default function Error({ error, reset }) {
  return (
    <div className="max-w-[900px] mx-auto px-4 py-10">
      <div className="rounded-xl border border-red-400/30 p-6" style={{ background: 'rgba(239,68,68,0.08)' }}>
        <p className="text-lg font-bold text-red-400 mb-2">Erro ao carregar preferências globais</p>
        <p className="text-sm text-gray-300 mb-2">
          {error?.message || 'Erro desconhecido'}
        </p>
        {error?.digest && (
          <p className="text-[10px] text-gray-500 font-mono">Digest: {error.digest}</p>
        )}
        <button onClick={reset}
          className="mt-4 px-4 py-2 rounded-lg text-sm font-semibold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10">
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
