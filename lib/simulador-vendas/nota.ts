/** Zero é calculado normalmente, mas a interface o representa como ausência de evidência. */
export function formatarNotaPace(
  valor: number | null | undefined,
  locale: string,
) {
  return valor == null || valor === 0
    ? '—'
    : valor.toLocaleString(locale, { maximumFractionDigits: 2 });
}
