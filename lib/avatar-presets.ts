// Presets de avatar disponíveis na tela de perfil.
// Formato leve (emoji + cor) — dá pra trocar por SVGs depois sem mudar o schema.

export const AVATAR_PRESETS = [
  { id: 'navy',     emoji: '🧑‍💼', bg: '#0F2B54' },
  { id: 'teal',     emoji: '🦸',    bg: '#0D9488' },
  { id: 'cyan',     emoji: '🐬',    bg: '#0891B2' },
  { id: 'emerald',  emoji: '🌱',    bg: '#10B981' },
  { id: 'amber',    emoji: '🦁',    bg: '#D97706' },
  { id: 'violet',   emoji: '🦉',    bg: '#7C3AED' },
  { id: 'pink',     emoji: '🌸',    bg: '#DB2777' },
  { id: 'indigo',   emoji: '🚀',    bg: '#4F46E5' },
];

export function getPreset(id) {
  return AVATAR_PRESETS.find(p => p.id === id) || AVATAR_PRESETS[0];
}
