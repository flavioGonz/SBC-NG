'use client';
/* ============================================================================
 *  Skeletons — boneyard-js.
 *
 *  La gracia de boneyard es que NO se describe el esqueleto a mano: se envuelve el
 *  componente real y la librería fotografía su layout. El hueso sale con la forma
 *  exacta de lo que va a aparecer, así que cuando llegan los datos no hay salto —
 *  cero layout shift. Un skeleton dibujado a mano siempre termina mintiendo un
 *  poquito, y ese poquito es el salto que hace que la pantalla se sienta barata.
 *
 *  Uso:
 *     <Skel cargando={cargando}>
 *       <TablaDeVerdad datos={datos} />
 *     </Skel>
 *
 *  Si por lo que sea la librería no puede envolver algo (SSR, un componente que
 *  todavía no montó), cae a un bloque neutro con el pulso de siempre: preferimos
 *  un skeleton feo a una pantalla en blanco.
 * ==========================================================================*/
import { Skeleton as Boneyard } from 'boneyard-js/react';
import { Skeleton as MantineSkeleton } from '@mantine/core';

export default function Skel({ cargando, children, alto = 160, radius = 'lg' }) {
  if (!cargando) return children;

  try {
    return <Boneyard loading>{children}</Boneyard>;
  } catch (_) {
    // Plan B: el hueso genérico. Nunca dejamos la pantalla vacía.
    return <MantineSkeleton h={alto} radius={radius} />;
  }
}

/* Para los casos en que todavía no hay un componente real que envolver (una tabla
 * vacía en la primera carga), un hueso con la forma de N filas. */
export function SkelFilas({ filas = 5, alto = 44 }) {
  return (
    <div>
      {Array.from({ length: filas }).map((_, i) => (
        <MantineSkeleton key={i} h={alto} radius="md" mb={8} />
      ))}
    </div>
  );
}
