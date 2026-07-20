'use client';
/* ============================================================================
 *  Números (DIDs) de UNA troncal — se abre desde la fila de la troncal.
 *
 *  Los números son una propiedad de la troncal (el operador te asigna un pool),
 *  así que se administran acá adentro, no en un menú aparte:
 *   · la estrella marca el CallerID de salida por defecto (uno por troncal);
 *   · "Entrante va a" rutea la llamada que llega a ese DID.
 *  El CallerID por defecto entra en vigencia al tocar "Aplicar ruteo".
 * ==========================================================================*/
import { useState, useEffect } from 'react';
import {
  Group, Text, Badge, Table, Stack, Button, Modal, TextInput, Switch, ThemeIcon,
  Alert, ActionIcon, Tooltip, Loader,
} from '@mantine/core';
import {
  IconPhonePlus, IconStar, IconStarFilled, IconTrash, IconEdit, IconInfoCircle,
  IconArrowBarToDown, IconHash, IconPlayerPlay,
} from '@tabler/icons-react';
import { api } from '../app/api';
import { toast, toastPromise } from '../app/notify';

const VACIO = { number: '', label: '', inbound_dest: '', es_cid_default: false };

export default function NumerosTroncal({ trunkId, trunkName }) {
  const [nums, setNums] = useState(null);
  const [alta, setAlta] = useState(false);
  const [ed, setEd] = useState(null);
  const [f, setF] = useState(VACIO);

  const cargar = () => { setNums(null); api(`/trunks/${trunkId}/numbers`).then(setNums).catch(() => setNums([])); };
  useEffect(() => { if (trunkId != null) cargar(); }, [trunkId]); // eslint-disable-line

  const crear = () => toastPromise(
    api(`/trunks/${trunkId}/numbers`, { method: 'POST', body: f }).then(() => { setAlta(false); setF(VACIO); cargar(); }),
    { loading: 'Agregando…', success: `Número ${f.number} agregado`, error: (e) => e.message });
  const guardar = () => toastPromise(
    api(`/trunk-numbers/${ed.id}`, { method: 'PUT', body: ed }).then(() => { setEd(null); cargar(); }),
    { loading: 'Guardando…', success: 'Número actualizado', error: (e) => e.message });
  const marcarCid = (n) => toastPromise(
    api(`/trunk-numbers/${n.id}`, { method: 'PUT', body: { es_cid_default: true } }).then(() => cargar()),
    { loading: 'Fijando CallerID…', success: `${n.number} es ahora el CallerID por defecto (aplicá el ruteo)`, error: (e) => e.message });
  const borrar = (n) => {
    if (!confirm(`¿Borrar el número ${n.number}?`)) return;
    toastPromise(api(`/trunk-numbers/${n.id}`, { method: 'DELETE' }).then(() => cargar()),
      { loading: 'Borrando…', success: 'Número borrado', error: (e) => e.message });
  };
  const aplicar = () => toastPromise(
    api('/routes/apply', { method: 'POST' }),
    { loading: 'Aplicando ruteo…', success: 'Ruteo aplicado: el CallerID por defecto quedó activo', error: (e) => e.message });

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Group gap={8}>
          <ThemeIcon size={28} radius="md" variant="light" color="cyan"><IconHash size={16} /></ThemeIcon>
          <Text fw={700} size="sm">Pool de números{trunkName ? ` · ${trunkName}` : ''}</Text>
          {nums && <Badge size="sm" variant="light" color="gray">{nums.length}</Badge>}
        </Group>
        <Group gap="sm">
          <Tooltip label="Re-registra la troncal con el CallerID por defecto elegido">
            <Button size="xs" variant="default" leftSection={<IconPlayerPlay size={15} />} onClick={aplicar}>Aplicar ruteo</Button>
          </Tooltip>
          <Button size="xs" leftSection={<IconPhonePlus size={15} />} onClick={() => { setF(VACIO); setAlta(true); }}>Agregar número</Button>
        </Group>
      </Group>

      {!nums ? <Group justify="center" p="xl"><Loader /></Group> : nums.length === 0 ? (
        <Stack align="center" py="lg" gap={6}>
          <Text fw={600} size="sm">Esta troncal no tiene números cargados</Text>
          <Text size="xs" c="dimmed" ta="center" maw={480}>
            Cargá los DIDs que te asignó el operador. Marcá uno con la estrella para salir con ese CallerID, y poné un
            destino a cada uno para rutear su llamada entrante.
          </Text>
        </Stack>
      ) : (
        <Table highlightOnHover verticalSpacing="sm" fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={54}>CID</Table.Th><Table.Th>Número</Table.Th><Table.Th>Etiqueta</Table.Th>
              <Table.Th><Group gap={4}><IconArrowBarToDown size={13} /> Entrante va a</Group></Table.Th>
              <Table.Th>Estado</Table.Th><Table.Th w={80} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {nums.map((n) => (
              <Table.Tr key={n.id} style={{ opacity: n.enabled === false ? 0.55 : 1 }}>
                <Table.Td>
                  <Tooltip label={n.es_cid_default ? 'CallerID de salida por defecto' : 'Usar como CallerID por defecto'}>
                    <ActionIcon variant={n.es_cid_default ? 'light' : 'subtle'} color={n.es_cid_default ? 'yellow' : 'gray'}
                                onClick={() => !n.es_cid_default && marcarCid(n)}>
                      {n.es_cid_default ? <IconStarFilled size={16} /> : <IconStar size={16} />}
                    </ActionIcon>
                  </Tooltip>
                </Table.Td>
                <Table.Td><Text fw={700} ff="monospace">{n.number}</Text></Table.Td>
                <Table.Td c={n.label ? undefined : 'dimmed'}>{n.label || '—'}</Table.Td>
                <Table.Td ff="monospace" fz="xs" c={n.inbound_dest ? undefined : 'dimmed'}>{n.inbound_dest || 'central por defecto'}</Table.Td>
                <Table.Td>
                  <Badge size="sm" variant="dot" color={n.enabled !== false ? 'teal' : 'gray'}>{n.enabled !== false ? 'activo' : 'inactivo'}</Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap={4} justify="flex-end" wrap="nowrap">
                    <Tooltip label="Editar"><ActionIcon variant="subtle" color="gray" onClick={() => setEd({ ...n })}><IconEdit size={16} /></ActionIcon></Tooltip>
                    <Tooltip label="Borrar"><ActionIcon variant="subtle" color="red" onClick={() => borrar(n)}><IconTrash size={16} /></ActionIcon></Tooltip>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Alert variant="light" color="cyan" radius="md" icon={<IconInfoCircle size={16} />}>
        <b>Salida (CallerID).</b> La <IconStarFilled size={12} style={{ verticalAlign: -1 }} /> marca con qué número sale la
        troncal por defecto; en <b>Ruteo de salida</b> cada regla puede elegir otro. <b>Entrada (DID).</b> "Entrante va a"
        rutea la llamada que llega a ese número; vacío = a la central por defecto.
      </Alert>

      <Modal opened={alta} onClose={() => setAlta(false)} title="Agregar número" radius="md" zIndex={2200}>
        <Stack gap="md">
          <TextInput label="Número" description="Como lo exige el operador (E.164 o nacional)" placeholder="+59829001234" required
                     value={f.number} onChange={(e) => setF({ ...f, number: e.currentTarget.value })} />
          <TextInput label="Etiqueta" description="Opcional: para qué es" placeholder="Recepción"
                     value={f.label} onChange={(e) => setF({ ...f, label: e.currentTarget.value })} />
          <TextInput label="Entrante va a" description="Destino del DID: un interno, un sip:uri, o vacío = central por defecto"
                     placeholder="2001  ·  sip:2001@192.168.10.5"
                     value={f.inbound_dest} onChange={(e) => setF({ ...f, inbound_dest: e.currentTarget.value })} />
          <Switch label="Usar como CallerID de salida por defecto" checked={f.es_cid_default}
                  onChange={(e) => setF({ ...f, es_cid_default: e.currentTarget.checked })} />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAlta(false)}>Cancelar</Button>
            <Button onClick={crear} disabled={!f.number.trim()}>Agregar</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={!!ed} onClose={() => setEd(null)} title={ed ? `Editar ${ed.number}` : ''} radius="md" zIndex={2200}>
        {ed && (
          <Stack gap="md">
            <TextInput label="Número" value={ed.number} onChange={(e) => setEd({ ...ed, number: e.currentTarget.value })} />
            <TextInput label="Etiqueta" value={ed.label || ''} onChange={(e) => setEd({ ...ed, label: e.currentTarget.value })} />
            <TextInput label="Entrante va a" placeholder="central por defecto"
                       value={ed.inbound_dest || ''} onChange={(e) => setEd({ ...ed, inbound_dest: e.currentTarget.value })} />
            <Switch label="CallerID de salida por defecto" checked={!!ed.es_cid_default}
                    onChange={(e) => setEd({ ...ed, es_cid_default: e.currentTarget.checked })} />
            <Switch label="Activo" checked={ed.enabled !== false}
                    onChange={(e) => setEd({ ...ed, enabled: e.currentTarget.checked })} />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setEd(null)}>Cancelar</Button>
              <Button onClick={guardar}>Guardar</Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
