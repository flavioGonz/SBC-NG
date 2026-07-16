'use client';
/* ============================================================================
 *  Captura a .pcap — para llevarse el paquete a Wireshark.
 *
 *  Es lo que en un AudioCodes vive en Troubleshoot → Packet Capture, y lo que en una
 *  consola es tcpdump. Cuando el operador dice "yo no recibí nada" y vos jurás que lo
 *  mandaste, la discusión se termina de una sola manera: mostrando el paquete.
 *
 *  Se puede leer acá mismo (los mensajes SIP en texto) o bajar el .pcap para abrirlo
 *  en Wireshark. El filtro no es libre a propósito: un campo de filtro libre en un
 *  panel web es una consola remota disfrazada.
 * ==========================================================================*/
import { useState } from 'react';
import {
  Card, Group, Text, Badge, Table, Stack, Button, TextInput, NumberInput, MultiSelect,
  ThemeIcon, Alert, Code, ActionIcon, Tooltip, Progress, Modal, ScrollArea, SimpleGrid,
} from '@mantine/core';
import {
  IconBug, IconPlayerRecord, IconPlayerStop, IconDownload, IconTrash, IconEye,
  IconInfoCircle, IconArrowRight, IconArrowLeft, IconAlertTriangle,
} from '@tabler/icons-react';
import Skel, { SkelFilas } from './Skel';
import { usePoll, api, fmtBytes } from './api';
import { toast, toastPromise } from './notify';

const PUERTOS = [
  { value: '5060', label: '5060 · SIP (UDP/TCP)' },
  { value: '5061', label: '5061 · SIP sobre TLS' },
  { value: '8088', label: '8088 · SIP sobre WebSocket (WebRTC)' },
];

export default function PcapPanel() {
  const { data, cargando, recargar } = usePoll('/capture', 2000);
  const [host, setHost] = useState('');
  const [puertos, setPuertos] = useState(['5060', '5061', '8088']);
  const [segundos, setSegundos] = useState(60);
  const [viendo, setViendo] = useState(null);
  const [msgs, setMsgs] = useState([]);

  const corriendo = !!(data && data.corriendo);
  const capturas = (data && data.capturas) || [];
  const avance = corriendo && data.segundos ? Math.min(100, Math.round((data.transcurrido / data.segundos) * 100)) : 0;

  const iniciar = () => toastPromise(
    api('/capture/start', { method: 'POST', body: { host: host || null, puertos: puertos.map(Number), segundos } }).then(recargar),
    { loading: 'Arrancando la captura…', success: 'Capturando. Hacé la llamada que falla ahora.', error: (e) => e.message });

  const detener = () => toastPromise(
    api('/capture/stop', { method: 'POST' }).then(recargar),
    { loading: 'Cortando…', success: 'Captura cortada', error: (e) => e.message });

  const borrar = (n) => toastPromise(
    api(`/capture/${n}`, { method: 'DELETE' }).then(recargar),
    { loading: 'Borrando…', success: 'Captura borrada', error: (e) => e.message });

  async function ver(n) {
    setViendo(n); setMsgs(null);
    try { setMsgs(await api(`/capture/${n}/messages`)); }
    catch (e) { toast('No se pudieron leer los mensajes', 'bad', { description: e.message }); setMsgs([]); }
  }

  return (
    <Stack gap="lg">
      <Group justify="flex-end">
        {corriendo
          ? <Button color="red" leftSection={<IconPlayerStop size={16} />} onClick={detener}>Cortar la captura</Button>
          : <Button color="red" variant="light" leftSection={<IconPlayerRecord size={16} />} onClick={iniciar}>
              Empezar a capturar
            </Button>}
      </Group>

      <Alert variant="light" color="sbc" radius="lg" icon={<IconInfoCircle size={18} />}>
        La captura ve el tráfico <b>real</b> del SBC, con las IPs de verdad. Se puede leer acá mismo o bajar el
        <b> .pcap</b> para abrirlo en Wireshark. Tiene freno de mano —máximo 300 s y 50 MB— porque una captura
        olvidada en producción llena el disco y tira el equipo: el remedio matando al enfermo.
      </Alert>

      {/* ── qué capturar ────────────────────────────────────────────────── */}
      <Card p="lg" className="sbc-fade-in">
        <Group gap={9} mb="md">
          <ThemeIcon size={30} radius="md" variant="light" color="red"><IconPlayerRecord size={17} /></ThemeIcon>
          <Text fw={700}>Qué capturar</Text>
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <TextInput label="Host (opcional)" description="Sólo el tráfico con esta IP. Vacío = todo."
                     placeholder="190.64.60.10" value={host} disabled={corriendo}
                     onChange={(e) => setHost(e.currentTarget.value)} />
          <MultiSelect label="Puertos" description="Los tres del SIP. Sacá los que no uses."
                       data={PUERTOS} value={puertos} disabled={corriendo} onChange={setPuertos} />
          <NumberInput label="Duración (s)" description="Se corta sola. Máximo 300."
                       min={5} max={300} value={segundos} disabled={corriendo}
                       onChange={(v) => setSegundos(v || 60)} />
        </SimpleGrid>

        {corriendo && (
          <Stack gap={6} mt="md">
            <Group justify="space-between">
              <Group gap={8}>
                <span className="sbc-pip sbc-pulse" style={{ background: '#f04438' }} />
                <Text size="sm" fw={600}>Capturando… hacé ahora la llamada que falla</Text>
              </Group>
              <Text size="xs" c="dimmed">
                {data.transcurrido}s de {data.segundos}s · {fmtBytes(data.bytes)}
              </Text>
            </Group>
            <Progress value={avance} color="red" animated size="md" radius="xl" />
            <Code fz="11px">{data.filtro}</Code>
          </Stack>
        )}
      </Card>

      {/* ── capturas guardadas ──────────────────────────────────────────── */}
      <Card p={0} className="sbc-fade-in">
        <Group p="lg" pb="sm" gap={9}>
          <ThemeIcon size={30} radius="md" variant="light" color="grape"><IconBug size={17} /></ThemeIcon>
          <Text fw={700}>Capturas guardadas</Text>
          <Text size="xs" c="dimmed">se guardan las últimas 20</Text>
        </Group>

        <Skel cargando={cargando}>
          <Table highlightOnHover verticalSpacing="sm" fz="sm">
            <Table.Thead>
              <Table.Tr><Table.Th>Archivo</Table.Th><Table.Th>Cuándo</Table.Th><Table.Th>Tamaño</Table.Th><Table.Th w={140} /></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {capturas.map((c) => (
                <Table.Tr key={c.nombre}>
                  <Table.Td><Code fz="11px">{c.nombre}</Code></Table.Td>
                  <Table.Td fz="xs" c="dimmed">{new Date(c.fecha).toLocaleString('es-UY')}</Table.Td>
                  <Table.Td fz="xs">{fmtBytes(c.bytes)}</Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap">
                      <Tooltip label="Leer los mensajes SIP acá">
                        <ActionIcon variant="subtle" color="sbc" onClick={() => ver(c.nombre)}><IconEye size={16} /></ActionIcon>
                      </Tooltip>
                      <Tooltip label="Bajar el .pcap (Wireshark)">
                        <ActionIcon variant="subtle" color="gray"
                                    component="a" href={`/backend/api/v1/capture/${c.nombre}/download`}>
                          <IconDownload size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Borrar">
                        <ActionIcon variant="subtle" color="red" onClick={() => borrar(c.nombre)}><IconTrash size={16} /></ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
              {capturas.length === 0 && (
                <Table.Tr><Table.Td colSpan={4}>
                  <Stack align="center" py="xl" gap={6}>
                    <ThemeIcon size={44} radius="xl" variant="light" color="gray"><IconBug size={22} /></ThemeIcon>
                    <Text fw={600}>Todavía no capturaste nada</Text>
                    <Text size="sm" c="dimmed" ta="center" maw={480}>
                      Arrancá una captura, reproducí la llamada que falla, y después leé los mensajes acá o bajate el
                      pcap. Es la forma más rápida de cerrar una discusión con un operador.
                    </Text>
                  </Stack>
                </Table.Td></Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Skel>
      </Card>

      {/* ── los mensajes SIP en texto ───────────────────────────────────── */}
      <Modal opened={!!viendo} onClose={() => setViendo(null)} size="80%" title={`Mensajes SIP · ${viendo || ''}`}>
        {msgs === null ? <SkelFilas filas={6} /> : (
          <ScrollArea h="70vh">
            <Stack gap="sm">
              {msgs.map((m, i) => (
                <Card key={i} p="sm" withBorder radius="md">
                  <Group gap={8} mb={6} wrap="nowrap">
                    <ThemeIcon size={22} radius="md" variant="light" color={m.esRespuesta ? 'teal' : 'sbc'}>
                      {m.esRespuesta ? <IconArrowLeft size={12} /> : <IconArrowRight size={12} />}
                    </ThemeIcon>
                    <Text fw={700} size="xs" ff="monospace">{m.inicio}</Text>
                    <Badge size="xs" variant="light" color="gray" ff="monospace">
                      {m.origen} → {m.destino}
                    </Badge>
                    <Text size="10px" c="dimmed" ml="auto">{m.hora}</Text>
                  </Group>
                  <Code block fz="10.5px" style={{ maxHeight: 260, overflow: 'auto' }}>{m.texto}</Code>
                </Card>
              ))}
              {msgs.length === 0 && (
                <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />}>
                  No se encontraron mensajes SIP en esa captura. Si la llamada no pasó por el borde, acá no va a estar:
                  fijate que el teléfono o el operador realmente estén apuntando al SBC.
                </Alert>
              )}
            </Stack>
          </ScrollArea>
        )}
      </Modal>
    </Stack>
  );
}
