'use client';

/**
 * Badge de versão fixo no canto inferior direito.
 * Versão segue SemVer: <MAJOR>.<MINOR>.<commits no repo>
 * Cada deploy automático bump'a o último número.
 */
export default function VersionBadge() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0';
  const build = process.env.NEXT_PUBLIC_BUILD_NUM || '?';
  const sha = process.env.NEXT_PUBLIC_GIT_SHA || '';
  const date = process.env.NEXT_PUBLIC_BUILD_DATE || '';

  // Versão completa: MAJOR.MINOR.BUILD (build = nº de commits)
  const [major, minor] = version.split('.');
  const versaoExibida = `v${major}.${minor}.${build}`;

  return (
    <div className="fixed bottom-2 right-2 z-40 group select-none pointer-events-auto">
      <div className="flex items-center gap-1.5 px-2 py-1 rounded text-[9px] font-mono text-gray-600 bg-black/40 border border-white/5 backdrop-blur-sm hover:text-gray-300 hover:border-white/15 transition-colors cursor-default">
        <span className="text-cyan-400/60 group-hover:text-cyan-400">●</span>
        <span>{versaoExibida}</span>
        <span className="hidden group-hover:inline text-gray-500">· {sha} · {date}</span>
      </div>
    </div>
  );
}
