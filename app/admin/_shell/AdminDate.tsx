'use client';

import { useEffect, useState } from 'react';

/** SSR e primeira renderização não dependem do relógio/fuso de duas máquinas. */
export default function AdminDate({ locale }: { locale: string }) {
  const [date, setDate] = useState<Date | null>(null);
  useEffect(() => { setDate(new Date()); }, []);
  return <time dateTime={date?.toISOString()}>{date
    ? date.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' })
    : '\u00a0'}</time>;
}
