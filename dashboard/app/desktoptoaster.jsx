'use client';
import { Toaster } from 'sileo';

// Un único Toaster (sileo) para todo el panel, aislado en su propio componente
// cliente: renderizarlo directo desde el layout (server component) provoca
// desajustes de hidratación (#418/#423). Acá tiene su frontera de cliente limpia.
export default function DesktopToaster() {
  return <Toaster position="bottom-center" theme="system" offset={{ bottom: 24 }} />;
}
