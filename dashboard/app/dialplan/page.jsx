'use client';
/* ============================================================================
 *  Traducción de números (dialplan)
 *
 *  Reglas que reescriben un número antes de rutearlo: normalizar a E.164, poner o
 *  sacar un prefijo de operador, mapear un corto a un destino. Cada regla vive en un
 *  "plan" (dpid) y se evalúan por prioridad.
 *
 *  IMPORTANTE: esta pantalla administra la TABLA. Para que las reglas ACTÚEN sobre las
 *  llamadas hacen falta dos cosas más, que se hacen una sola vez y se prueban con una
 *  llamada real: (1) habilitar el módulo «dialplan» en Motor, y (2) que el ruteo llame
 *  a dp_translate(). Hasta entonces, lo que se cargue acá queda guardado pero inerte.
 * ==========================================================================*/
import { useState, useEffect } from 'react';
import {
  Card, Group, Text, Badge, Table, Stack, Button, Modal, TextInput, NumberInput,
  SegmentedControl, ThemeIcon, Alert, ActionIcon, Tooltip, Code, Loader,
} from '@mantine/core';
import {
  IconArrowsExchange, IconPlus, IconTrash, IconEdit, IconInfoCircle, IconRefresh,
  IconAlertTriangle, IconArrowRight,
} from '@tabler/icons-react';
import PageHeader from '../PageHeader';
import { api } from '../api';
import { toast, toastPromise } from '../notify';

const VACIA = { dpid: 1, pr: 0, match_op: 1, match_exp: '', match_len: 0, subst_exp: '', repl_exp: '', attrs: '' };

export default function Dialplan() {
  const [reglas, setReglas] = useState(null);
  const [abierta, setAbierta] = useState(false);
  const [f, setF] = useState(VACIA);
  const [editId, setEditId] = useState(null);

  async function cargar() {
    try { setReglas(await api('/dialplan/rules')); }
    catch (e) { toast(e.message, 'bad'); setReglas([]); }
  }
  useEffect(() => { cargar(); }, []);

  const abrirNueva = () => { setF(VACIA); setEditId(null); setAbierta(true); };
  const abrirEditar = (r) => { setF({ ...r }); setEditId(r.id); setAbierta(true); };

  const guardar = () => {
    if (!f.match_exp.trim()) return toast('Escribí la expresión a buscar', 'bad');
    const body = { ...f, dpid: parseInt(f.dpid, 10) || 1, pr: parseInt(f.pr, 10) || 0, match_len: parseInt(f.match_len, 10) || 0 };
    toastPromise(
      api(editId ? `/dialplan/rules/${editId}` : '/dialplan/rules', { method: editId ? 'PUT' : 'POST', body })
        .then(() => { setAbierta(false); cargar(); }),
      { loading: 'Guardando…', success: 'Regla guardada (acordate de Recargar)', error: (e) => e.message });
  };
  const borrar = (r) => toastPromise(
    api(`/dialplan/rules/${r.id}`, { method: 'DELETE' }).then(cargar),
    { loading: 'Borrando…', success: 'Regla borrada', error: 'No se pudo borrar' });
  const recargar = () => toastPromise(
    api('/dialplan/reload', { method: 'POST' }),
    { loading: 'Recargando en Kamailio…', success: 'Tabla recargada (si el módulo está activo)', error: 'No se pudo recargar' });

  const planes = [...new Set((reglas || []).map((r) => r.dpid))].sort((a, b) => a - b);

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconArrowsExchange size={24} />}
        title="Traducción de números"
        subtitle="Reglas de dialplan · reescritura por plan (dpid)"
        right={
          <Group gap="sm">
            <Button variant="default" leftSection={<IconRefresh size={16} />} onClick={recargar}>Recargar en Kamailio</Button>
            <Button leftSection={<IconPlus size={16} />} onClick={abrirNueva}>Nueva regla</Button>
          </Group>
        }
      />

      <Alert color="orange" variant="light" radius="lg" icon={<IconAlertTriangle size={18} />}>
        Esto administra la tabla. Para que las reglas actúen sobre las llamadas: habilitá el módulo <b>dialplan</b> en
        <b> Motor</b> y probá con una llamada real (el ruteo tiene que llamar <Code>dp_translate()</Code>). Hasta entonces,
        lo que cargues acá queda guardado pero <b>no cambia</b> ninguna llamada.
      </Alert>

      <Card p={0} withBorder radius="lg">
        {reglas === null ? (
          <Group justify="center" py="xl"><Loader /></Group>
        ) : reglas.length === 0 ? (
          <Stack align="center" py="xl" gap={6}>
            <ThemeIcon size={44} radius="md" variant="light" color="gray"><IconArrowsExchange size={22} /></ThemeIcon>
            <Text fw={600}>Sin reglas de traducción</Text>
            <Text size="sm" c="dimmed" ta="center" maw={560}>
              Ejemplo típico: en el plan 1, una regla regex <Code>^0(.*)$</Code> que sustituye <Code>^0(.*)$</Code> →
              <Code>598$1</Code> para pasar un nacional a E.164. Creá la primera con «Nueva regla».
            </Text>
          </Stack>
        ) : (
          <Table highlightOnHover verticalSpacing="sm" fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Plan</Table.Th><Table.Th>Pr.</Table.Th><Table.Th>Tipo</Table.Th>
                <Table.Th>Busca</Table.Th><Table.Th>Reemplazo</Table.Th><Table.Th>Atributos</Table.Th><Table.Th w={80} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {reglas.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td><Badge variant="light" color="grape">{r.dpid}</Badge></Table.Td>
                  <Table.Td><Badge size="sm" variant="light" color="gray">{r.pr}</Badge></Table.Td>
                  <Table.Td><Badge size="sm" variant="light" color={r.match_op === 1 ? 'blue' : 'teal'}>{r.match_op === 1 ? 'regex' : 'exacto'}</Badge></Table.Td>
                  <Table.Td><Code>{r.match_exp}</Code></Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      {r.subst_exp ? <Code fz="11px">{r.subst_exp}</Code> : <Text size="xs" c="dimmed">—</Text>}
                      <IconArrowRight size={12} style={{ opacity: .5 }} />
                      {r.repl_exp ? <Code fz="11px">{r.repl_exp}</Code> : <Text size="xs" c="dimmed">—</Text>}
                    </Group>
                  </Table.Td>
                  <Table.Td fz="xs" c="dimmed">{r.attrs || '—'}</Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap" justify="flex-end">
                      <ActionIcon variant="subtle" color="gray" onClick={() => abrirEditar(r)}><IconEdit size={15} /></ActionIcon>
                      <Tooltip label="Borrar la regla"><ActionIcon variant="subtle" color="red" onClick={() => borrar(r)}><IconTrash size={15} /></ActionIcon></Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      {planes.length > 0 && (
        <Text size="xs" c="dimmed">Planes en uso (dpid): {planes.join(', ')}. En el ruteo, cada dp_translate() apunta a un plan.</Text>
      )}

      <Modal opened={abierta} onClose={() => setAbierta(false)} title={editId ? 'Editar regla' : 'Nueva regla de traducción'} size="lg">
        <Stack gap="md">
          <Group grow>
            <NumberInput label="Plan (dpid)" description="Agrupa reglas que se evalúan juntas" min={1}
                         value={f.dpid} onChange={(v) => setF({ ...f, dpid: v || 1 })} />
            <NumberInput label="Prioridad" description="Menor = se evalúa antes" min={0}
                         value={f.pr} onChange={(v) => setF({ ...f, pr: v || 0 })} />
            <div>
              <Text size="sm" fw={500} mb={4}>Coincidencia</Text>
              <SegmentedControl fullWidth value={String(f.match_op)} onChange={(v) => setF({ ...f, match_op: parseInt(v, 10) })}
                data={[{ value: '1', label: 'Regex' }, { value: '0', label: 'Texto exacto' }]} />
            </div>
          </Group>
          <TextInput label="Expresión que busca (match_exp)" placeholder="^0(.*)$"
                     value={f.match_exp} onChange={(e) => setF({ ...f, match_exp: e.currentTarget.value })} required />
          <Group grow>
            <TextInput label="Regex de sustitución (subst_exp)" placeholder="^0(.*)$"
                       value={f.subst_exp} onChange={(e) => setF({ ...f, subst_exp: e.currentTarget.value })} />
            <TextInput label="Reemplazo (repl_exp)" placeholder="598\\1"
                       value={f.repl_exp} onChange={(e) => setF({ ...f, repl_exp: e.currentTarget.value })} />
          </Group>
          <Group grow>
            <NumberInput label="Largo esperado (match_len)" description="0 = no chequear" min={0}
                         value={f.match_len} onChange={(v) => setF({ ...f, match_len: v || 0 })} />
            <TextInput label="Atributos (attrs)" description="Opcional, quedan disponibles tras traducir"
                       value={f.attrs} onChange={(e) => setF({ ...f, attrs: e.currentTarget.value })} />
          </Group>
          <Alert variant="light" color="sbc" radius="md" icon={<IconInfoCircle size={16} />}>
            Con <b>Regex</b>: «busca» filtra y «sustitución/reemplazo» hacen el cambio (grupos con <Code>\\1</Code>, <Code>\\2</Code>).
            Con <b>Texto exacto</b>: coincide literal y reemplaza por «reemplazo».
          </Alert>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAbierta(false)}>Cancelar</Button>
            <Button onClick={guardar}>{editId ? 'Guardar cambios' : 'Agregar regla'}</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
