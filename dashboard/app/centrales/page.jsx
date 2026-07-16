'use client';
/* ============================================================================
 *  Centrales — las PBX que viven detras del SBC.
 *
 *  Enganchar una central hace DOS cosas a la vez, y siempre las dos:
 *    · entra al dispatcher  → el SBC sabe a donde mandarle las entrantes
 *    · entra a `address`    → el SBC le acepta las salientes (allow_source_address)
 *  Ese fue siempre el error de configurar SBCs a mano: hacer una y olvidarse de la
 *  otra. Editar y borrar tambien rehacen las dos, juntas.
 * ==========================================================================*/
import { useState } from 'react';
import {
  Card, Group, Text, Badge, Table, Stack, Button, Modal, TextInput, NumberInput,
  Skeleton, Alert, Code, ThemeIcon, ActionIcon, Tooltip, SimpleGrid, Switch,
} from '@mantine/core';
import { IconServer2, IconPlus, IconInfoCircle, IconArrowsLeftRight, IconPencil, IconTrash } from '@tabler/icons-react';
import PageHeader from '../PageHeader';
import { usePoll, api } from '../api';
import { useMonitor, MonCell } from '../Mon';
import { toast, toastPromise } from '../notify';

const VACIA = { name: '', sip_uri: '', priority: 10, context: 'from-trunk', enabled: true };

export default function Centrales() {
  const { data, cargando, recargar } = usePoll('/pbx', 10000);
  const mon = useMonitor();
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState(VACIA);
  const [editando, setEditando] = useState(null);   // id, o null = alta nueva

  const centrales = data || [];

  const abrirAlta = () => { setEditando(null); setF(VACIA); setAbierto(true); };
  const abrirEdicion = (c) => {
    setEditando(c.id);
    setF({ name: c.name, sip_uri: c.sip_uri, priority: c.priority || 10, context: c.context || 'from-trunk', enabled: !!c.enabled });
    setAbierto(true);
  };

  async function guardar() {
    if (!f.name || !f.sip_uri) { toast('Faltan el nombre y la URI SIP', 'warn'); return; }
    const alta = editando === null;
    await toastPromise(
      api(alta ? '/attach' : `/pbx/${editando}`, { method: alta ? 'POST' : 'PUT', body: f })
        .then(() => { setAbierto(false); setF(VACIA); setEditando(null); recargar(); }),
      {
        loading: alta ? 'Enganchando la central...' : 'Guardando los cambios...',
        success: alta ? 'Central enganchada: dispatcher + IP de confianza' : 'Central actualizada (dispatcher y confianza rehechos)',
        error: alta ? 'No se pudo enganchar' : 'No se pudo guardar',
      },
    );
  }

  async function borrar(c) {
    if (!confirm(`Sacar ${c.name} del SBC? Deja de recibir llamadas y de poder sacarlas.`)) return;
    await toastPromise(
      api(`/pbx/${c.id}`, { method: 'DELETE' }).then(recargar),
      { loading: 'Sacando la central...', success: `${c.name} desenganchada`, error: 'No se pudo sacar' },
    );
  }

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconServer2 size={24} />}
        title="Centrales"
        subtitle="Las PBX que atienden las llamadas que pasan por este borde"
        right={<Button leftSection={<IconPlus size={16} />} onClick={abrirAlta}>Enganchar central</Button>}
      />

      <Alert variant="light" color="sbc" radius="lg" icon={<IconInfoCircle size={18} />}>
        Enganchar una central hace dos cosas de una: la agrega al <b>dispatcher</b> (para mandarle las llamadas
        entrantes) y a la lista de <b>IPs de confianza</b> (para aceptarle las salientes). Editarla o sacarla rehace
        las dos — nunca queda una sin la otra. Una central tambien puede engancharse sola contra
        {' '}<Code>POST /api/v1/attach</Code> con su token de API.
      </Alert>

      <Card p={0} className="sbc-fade-in">
        {cargando ? <Skeleton h={140} radius="lg" /> : (
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Nombre</Table.Th><Table.Th>URI SIP</Table.Th><Table.Th>Prioridad</Table.Th>
                <Table.Th>Contexto</Table.Th><Table.Th>Habilitada</Table.Th><Table.Th>Monitoreo (OPTIONS · latencia · MOS)</Table.Th>
                <Table.Th w={90} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {centrales.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td>
                    <Group gap={8}>
                      <ThemeIcon size={26} radius="md" variant="light" color={c.enabled ? 'teal' : 'gray'}>
                        <IconArrowsLeftRight size={14} />
                      </ThemeIcon>
                      <Text fw={650}>{c.name}</Text>
                    </Group>
                  </Table.Td>
                  <Table.Td ff="monospace" fz="xs">{c.sip_uri}</Table.Td>
                  <Table.Td>{c.priority}</Table.Td>
                  <Table.Td ff="monospace" fz="xs">{c.context}</Table.Td>
                  <Table.Td><Badge variant="light" color={c.enabled ? 'teal' : 'gray'}>{c.enabled ? 'activa' : 'deshabilitada'}</Badge></Table.Td>
                  <Table.Td><MonCell e={mon['pbx' + c.id]} /></Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap">
                      <Tooltip label="Editar">
                        <ActionIcon variant="subtle" color="gray" onClick={() => abrirEdicion(c)}><IconPencil size={16} /></ActionIcon>
                      </Tooltip>
                      <Tooltip label="Sacar del SBC">
                        <ActionIcon variant="subtle" color="red" onClick={() => borrar(c)}><IconTrash size={16} /></ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
              {centrales.length === 0 && (
                <Table.Tr><Table.Td colSpan={7}>
                  <Stack align="center" py="xl" gap={6}>
                    <ThemeIcon size={46} radius="xl" variant="light" color="gray"><IconServer2 size={24} /></ThemeIcon>
                    <Text fw={600}>Todavia no hay ninguna central</Text>
                    <Text size="sm" c="dimmed">El SBC esta de pie, pero no tiene a quien entregarle las llamadas.</Text>
                  </Stack>
                </Table.Td></Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      <Modal opened={abierto} onClose={() => setAbierto(false)}
             title={editando === null ? 'Enganchar una central' : `Editar ${f.name}`} size="lg">
        <Stack gap="lg">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <TextInput label="Nombre" description="Como la vas a reconocer en el panel"
                       placeholder="PBX Infratec" value={f.name} required
                       onChange={(e) => setF({ ...f, name: e.currentTarget.value })} />
            <TextInput label="URI SIP" description="IP y puerto donde escucha la central (sin el sip:)"
                       placeholder="192.168.99.10:5060" value={f.sip_uri} required
                       onChange={(e) => setF({ ...f, sip_uri: e.currentTarget.value })} />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <NumberInput label="Prioridad" description="Menor numero = primero en el dispatcher"
                         value={f.priority} min={1} max={100}
                         onChange={(v) => setF({ ...f, priority: v || 10 })} />
            <TextInput label="Contexto" description="El contexto del dialplan al que entran las llamadas"
                       value={f.context} onChange={(e) => setF({ ...f, context: e.currentTarget.value })} />
          </SimpleGrid>

          <Switch label="Activa" checked={f.enabled}
                  description="Si la apagas, sale del dispatcher y de las IPs de confianza: no recibe ni saca llamadas"
                  onChange={(e) => setF({ ...f, enabled: e.currentTarget.checked })} />

          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={guardar}>{editando === null ? 'Enganchar' : 'Guardar cambios'}</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
