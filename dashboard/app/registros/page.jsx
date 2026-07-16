'use client';
/* ============================================================================
 *  Extensiones SIP — las que se registran A TRAVÉS del borde.
 *
 *  Acá hay una confusión que vale aclarar de una vez: el SBC NO es el registrar.
 *  No guarda usuarios ni los autentica — eso lo hace la central. El SBC es un
 *  proxy: recibe el REGISTER del teléfono remoto, le arregla el NAT (contact
 *  alias) y se lo pasa a la central; si la central contesta 200, esa extensión
 *  está arriba y llega desde afuera sin exponer la central a internet.
 *
 *  Por eso `usrloc` está vacío por diseño. Lo que sí sabemos es lo que VIMOS
 *  pasar: cada REGISTER aceptado queda anotado con la IP real de donde vino, el
 *  teléfono que usa y a qué central fue. Es exactamente lo que el soporte necesita
 *  para contestar la pregunta de todos los días: "el 1004 dice que no le entran
 *  las llamadas".
 * ==========================================================================*/
import { useState } from 'react';
import {
  Card, Group, Text, Badge, Table, Stack, TextInput, Skeleton, ThemeIcon, Tooltip,
  ActionIcon, Alert, SimpleGrid,
} from '@mantine/core';
import {
  IconWaveSine, IconSearch, IconDeviceMobile, IconDeviceDesktop, IconInfoCircle, IconTrash, IconWorld, IconServer2,
} from '@tabler/icons-react';
import PageHeader from '../PageHeader';
import Slot from '../Slot';
import { usePoll, api } from '../api';
import { toastPromise } from '../notify';

const hace = (s) => {
  if (s === null || s === undefined) return '—';
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
};

export default function Extensiones() {
  const { data, cargando, recargar } = usePoll('/registrations', 8000);
  const [q, setQ] = useState('');

  const todos = (data && data.registros) || [];
  const vivos = (data && data.vivos) || 0;
  const filas = q
    ? todos.filter((r) => (r.aor + ' ' + (r.ip_origen || '') + ' ' + (r.agente || '')).toLowerCase().includes(q.toLowerCase()))
    : todos;

  const olvidar = (r) => toastPromise(
    api(`/registrations/${r.id}`, { method: 'DELETE' }).then(recargar),
    { loading: 'Olvidando…', success: `${r.aor} borrada de la lista`, error: 'No se pudo borrar' });

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconWaveSine size={24} />}
        title="Extensiones SIP"
        subtitle="Teléfonos remotos que se registran a la central pasando por el borde"
        right={
          <Group gap="sm">
            <Badge size="lg" variant="light" color={vivos ? 'teal' : 'gray'}>
              <Slot value={vivos} /> en línea
            </Badge>
            <TextInput placeholder="Buscar extensión, IP o teléfono…" leftSection={<IconSearch size={15} />}
                       value={q} onChange={(e) => setQ(e.currentTarget.value)} w={280} />
          </Group>
        }
      />

      <Alert variant="light" color="sbc" radius="lg" icon={<IconInfoCircle size={18} />}>
        El SBC <b>no es el registrar</b>: no guarda usuarios ni los autentica, eso lo hace la central. Lo que hace es
        pasarle el REGISTER y arreglarle el NAT, para que un teléfono remoto llegue sin exponer la central a internet.
        Esta lista es lo que el borde <b>vio pasar</b>: cada registro que la central aceptó, con la IP real de donde vino.
      </Alert>

      <Card p={0} className="sbc-fade-in">
        {cargando ? <Skeleton h={160} radius="lg" /> : (
          <Table highlightOnHover verticalSpacing="sm" fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Extensión</Table.Th><Table.Th>Estado</Table.Th><Table.Th>Viene de</Table.Th>
                <Table.Th>Teléfono</Table.Th><Table.Th>Central</Table.Th><Table.Th>Visto</Table.Th><Table.Th w={50} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filas.map((r) => { const soft = /sip\.?js|softphone|pbx-?ng|electron|zoiper|linphone|micro-?sip|bria|jitsi/i.test(r.agente || ''); return (
                <Table.Tr key={r.id}>
                  <Table.Td>
                    <Group gap={8} wrap="nowrap">
                      <Tooltip label={soft ? 'Softphone de escritorio' : 'Teléfono / equipo SIP'} withArrow>
                        <ThemeIcon size={28} radius="md" variant="light" color={r.vivo ? (soft ? 'grape' : 'sbc') : 'gray'}>
                          {soft ? <IconDeviceDesktop size={15} /> : <IconDeviceMobile size={15} />}
                        </ThemeIcon>
                      </Tooltip>
                      <div>
                        <Text fw={700} ff="monospace">{r.usuario || r.aor}</Text>
                        <Text size="10px" c="dimmed" ff="monospace" lineClamp={1} maw={220}>{r.aor}</Text>
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge size="sm" variant="dot" color={r.vivo ? 'teal' : 'gray'}>
                      {r.vivo ? 'registrada' : 'sin señal'}
                    </Badge>
                  </Table.Td>
                  <Table.Td ff="monospace" fz="xs">
                    <Group gap={5} wrap="nowrap">
                      <IconWorld size={13} opacity={0.5} />
                      {r.ip_origen}{r.puerto ? `:${r.puerto}` : ''}
                      {r.transporte && <Badge size="xs" variant="light" color="gray">{String(r.transporte).toUpperCase()}</Badge>}
                    </Group>
                  </Table.Td>
                  <Table.Td fz="xs">
                    <Tooltip label={r.agente || 'no informó User-Agent'} multiline w={300}>
                      <Text lineClamp={1} maw={200}>{r.agente || '—'}</Text>
                    </Tooltip>
                  </Table.Td>
                  <Table.Td fz="xs" ff="monospace" c="dimmed">
                    <Group gap={5} wrap="nowrap"><IconServer2 size={13} opacity={0.5} />{r.central || '—'}</Group>
                  </Table.Td>
                  <Table.Td fz="xs" c={r.vivo ? undefined : 'dimmed'}>{hace(r.hace_seg)}</Table.Td>
                  <Table.Td>
                    <Tooltip label="Olvidarla (se fue, o quedó colgada)">
                      <ActionIcon variant="subtle" color="red" onClick={() => olvidar(r)}><IconTrash size={15} /></ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              ); })}
              {filas.length === 0 && (
                <Table.Tr><Table.Td colSpan={7}>
                  <Stack align="center" py="xl" gap={6}>
                    <ThemeIcon size={46} radius="xl" variant="light" color="gray"><IconWaveSine size={24} /></ThemeIcon>
                    <Text fw={600}>{q ? 'Nada coincide con la búsqueda' : 'Ninguna extensión pasó por el borde todavía'}</Text>
                    <Text size="sm" c="dimmed" ta="center" maw={520}>
                      {q
                        ? 'Probá con otro término.'
                        : 'Cuando un teléfono remoto se registre apuntando al SBC (y la central lo acepte), aparece acá. Si esperabas ver extensiones, revisá que apunten al borde y no directo a la central.'}
                    </Text>
                  </Stack>
                </Table.Td></Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        )}
      </Card>
    </Stack>
  );
}
