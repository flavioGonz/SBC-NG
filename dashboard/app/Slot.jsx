'use client';
import { useEffect, useState } from 'react';
import { SlotText } from 'slot-text/react';

/* Todo número que cambia solo se anima como un contador de nafta.
 *
 * OJO: SlotText genera un DOM distinto del que produce el prerender del servidor, y
 * React tira "hydration mismatch" (#418/#423). Por eso el PRIMER render —el que React
 * compara contra el HTML del servidor— es texto plano, y recién después de montar en
 * el navegador pasamos al componente animado. Lo aprendimos a los golpes en PBX-NG. */
export default function Slot({ value, options, style, ...rest }) {
  const t = value == null ? '' : String(value);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span style={{ display: 'inline-flex', ...style }} {...rest}>{t}</span>;
  return <SlotText text={t} options={options} style={{ display: 'inline-flex', ...style }} {...rest} />;
}
