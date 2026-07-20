'use client';
/* ============================================================================
 *  Números (DIDs) por troncal.
 *
 *  Un operador SIP te asigna varios números. Acá administrás ese pool por troncal:
 *   · CON QUÉ NÚMERO SALÍS  → marcás uno como CallerID por defecto (estrella). La
 *     ruta de salida puede pisar ese default con su propio número.
 *   · A DÓNDE ENTRA CADA DID → destino de la llamada entrante a ese número (un
 *     interno, un sip:uri, o vacío = a la central por defecto).
 *
 *  El CallerID por defecto entra en vigencia al tocar "Aplicar ruteo" (re-registra
 *  la troncal con ese número).
 * ==========================================================================*/
import { useState, useEffect } from 'react';
import {
  Card, Group, Text, Badge, Table, Stack, Button, Modal, Select, TextInput,
  Switch, ThemeIcon, Alert, ActionIcon, Tooltip, SegmentedControl, Loader,
} from '@mantine/core';
import {
  IconPhonePlus, IconStar, IconStarFilled, IconTrash, IconEdit, IconInfoCircle,
  IconArrowBarToDown, IconArrowBarUp, IconPlugConnected, IconPlayerPlay, IconHash,
} from '@tabler/icons-react';
import PageHeader from '../PageHeader';
import { SkelFilas } from '../Skel';
import { api } from '../api';
import { toast, toastPromise } from '../notify';

const VACIO = { number: '', label: '', inbound_dest: '', es_cid_default: false };

export default function Numeros() {
  const [trunks, setTrunks] = useState(null);
  const [sel, setSel] = useState(null);              // trunk_id seleccionado
  const [nums, setNums] = useState(null);
  const [alta, setAlta] = useState(false);
  const [ed, setEd] = useState(null);                // número en edición
  const [f, setF] = useState(VACIO);

  useEffect(() => {
    api('/trunks').then((ts) => {
      setTrunks(ts);
      if (ts && ts.length && sel == null) setSel(ts[0].id);
    }).catch((e) => { setTrunks([]); toast(e.message, 'bad'); });
  }, []); // eslint-disable-line

  const cargar = (id) => { setNums(null); api(`/trunks/${id}/numbers`).then(setNums).catch(() => setNums([])); };
  useEffect(() => { if (sel != null) cargar(sel); }, [sel]);

  const troncal = (trunks || []).find((t) => t.id === sel);

  const crear = () => toastPromise(
    api(`/trunks/${sel}/numbers`, { method: 'POST', body: f }).then(() => { setAlta(false); setF(VACIO); cargar(sel); }),
    { loading: 'Agregando…', success: `Número ${f.number} agregado`, error: (e) => e.message });

  const guardar = () => toastPromise(
    api(`/trunk-numbers/${ed.id}`, { method: 'PUT', body: ed }).then(() => { setEd(null); cargar(sel); }),
    { loading: 'Guardando…', success: 'Número actualizado', error: (e) => e.message });

  const marcarCid = (n) => toastPromise(
    api(`/trunk-numbers/${n.id}`, { method: 'PUT', body: { es_cid_default: true } }).then(() => cargar(sel)),
    { loading: 'Fijando CallerID…', success: `${n.number} es ahora el CallerID por defecto (aplicá el ruteo)`, error: (e) => e.message });

  const borrar = (n) => {
    if (!confirm(`¿Borrar el número ${n.number}?`)) return;
    toastPromise(api(`/trunk-numbers/${n.id}`, { method: 'DELETE' }).then(() => cargar(sel)),
      { loading: 'Borrando…', success: 'Número borrado', error: (e) => e.message });
  };

  const aplicar = () => toastPromise(
    api('/routes/apply', { method: 'POST' }),
    { loading: 'Aplicando ruteo…', success: 'Ruteo aplicado: el CallerID por defecto quedó activo', error: (e) => e.message });

  // Los DIDs entrantes viven en el ruteo del motor: aplicarlos lo recarga (con
  // validación y rollback). Por eso va aparte del CallerID, que no reinicia nada.
  const aplicarDids = () => {
    const conDest = (nums || []).filter((n) => n.inbound_dest).length;
    if (!confirm(`Se van a aplicar ${conDest} número(s) con destino de entrada.\n\nEsto RECARGA el motor SIP: las llamadas en curso se cortan. ¿Seguir?`)) return;
    toastPromise(
      api('/trunk-numbers/apply', { method: 'POST' }).then((r) => { if (r && r.error) throw new Error(r.error); return r; }),
      { loading: 'Aplicando DIDs al motor (validando + rollback)…',
        success: (r) => `DIDs aplicados: ${(r && r.dids) || 0} número(s) enrutados`,
        error: (e) => e.message || 'No se pudo aplicar' });
  };

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconHash size={24} />} color="cyan"
        title="Números del operador" subtitle="Los DIDs de cada troncal: con cuál salir y a dónde entra cada uno"
        right={
          <Group gap="sm">
            <Tooltip label="Re-registra la troncal con el CallerID por defecto elegido (no corta llamadas)">
              <Button variant="default" leftSection={<IconPlayerPlay size={16} />} onClick={aplicar}>Aplicar CallerID</Button>
            </Tooltip>
            <Tooltip label="Aplica a dónde entra cada DID. Recarga el motor SIP: corta las llamadas en curso" multiline w={260}>
              <Button variant="light" color="orange" leftSection={<IconPlayerPlay size={16} />} onClick={aplicarDids}>Aplicar DIDs</Button>
            </Tooltip>
            <Button leftSection={<IconPhonePlus size={16} />} disabled={sel == null} onClick={() => { setF(VACIO); setAlta(true); }}>Agregar número</Button>
          </Group>
        }
      />

      {!trunks ? <SkelFilas filas={3} /> : trunks.length === 0 ? (
        <Alert color="gray" variant="light" radius="md" icon={<IconInfoCircle size={18} />}>
          No hay troncales todavía. Creá una en <b>Troncales</b> y después cargá acá sus números.
        </Alert>
      ) : (
        <>
          <Card p="md" className="sbc-fade-in">
            <Group gap="sm" align="center" wrap="wrap">
              <ThemeIcon size={30} radius="md" variant="light" color="cyan"><IconPlugConnected size={17} /></ThemeIcon>
              <Text fw={700} size="sm">Troncal</Text>
              <SegmentedControl size="sm" radius="md" value={String(sel)} onChange={(v) => setSel(+v)}
                data={trunks.map((t) => ({ value: String(t.id), label: t.name }))} />
              {troncal && <Text size="xs" c="dimmed" ff="monospace">{troncal.provider_host}</Text>}
            </Group>
          </Card>

          <Card p={0} className="sbc-fade-in">
            <Group p="lg" pb="sm" gap={9}>
              <ThemeIcon size={30} radius="md" variant="light" color="cyan"><IconHash size={17} /></ThemeIcon>
              <Text fw={700}>Números de {troncal ? troncal.name : ''}</Text>
              {nums && <Badge size="sm" variant="light" color="gray">{nums.length}</Badge>}
            </Group>

            {!nums ? <Group justify="center" p="xl"><Loader /></Group> : nums.length === 0 ? (
              <Stack align="center" py="xl" gap={6}>
                <Text fw={600} size="sm">Esta troncal no tiene números cargados</Text>
                <Text size="xs" c="dimmed" ta="center" maw={520}>
                  Cargá los DIDs que te asignó el operador. Marcá uno con la estrella para salir con ese CallerID,
                  y poné un destino a cada uno para rutear su llamada entrante.
                </Text>
              </Stack>
            ) : (
              <Table highlightOnHover verticalSpacing="sm" fz="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={54}>CID</Table.Th><Table.Th>Número</Table.Th><Table.Th>Etiqueta</Table.Th>
                    <Table.Th><Group gap={4}><IconArrowBarToDown size={13} /> Entrante va a</Group></Table.Th>
                    <Table.Th>Estado</Table.Th><Table.Th w={90} />
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
                      <Table.Td ff="monospace" fz="xs" c={n.inbound_dest ? undefined : 'dimmed'}>
                        {n.inbound_dest || 'central por defecto'}
                      </Table.Td>
                      <Table.Td>
                        <Badge size="sm" variant="dot" color={n.enabled !== false ? 'teal' : 'gray'}>
                          {n.enabled !== false ? 'activo' : 'inactivo'}
                        </Badge>
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
          </Card>

          <Alert variant="light" color="cyan" radius="md" icon={<IconInfoCircle size={18} />}>
            <b>Salida (CallerID).</b> La <IconStarFilled size={12} style={{ verticalAlign: -1 }} /> marca con qué número
            sale la troncal por defecto. En <b>Ruteo de salida</b>, cada regla puede elegir otro número del pool.
            &nbsp;<b>Entrada (DID).</b> "Entrante va a" rutea la llamada que llega a ese número; vacío = a la central enganchada.
          </Alert>
        </>
      )}

      {/* ── agregar ─────────────────────────────────────────────────── */}
      <Modal opened={alta} onClose={() => setAlta(false)} title="Agregar número" radius="md">
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

      {/* ── editar ──────────────────────────────────────────────────── */}
      <Modal opened={!!ed} onClose={() => setEd(null)} title={ed ? `Editar ${ed.number}` : ''} radius="md">
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
