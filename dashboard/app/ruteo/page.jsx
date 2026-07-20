'use client';
/* ============================================================================
 *  Ruteo de salida — qué número sale por qué troncal.
 *
 *  Acá se tapó un agujero que daba vergüenza: la pantalla de troncales guardaba la
 *  troncal en la base, pero el dialplan de Kamailio rutea la salida con drouting,
 *  que lee OTRAS tablas. Una troncal sin regla de ruteo no existe para las llamadas:
 *  el panel decía "creada" y el borde contestaba 404. Ahora las dos cosas son la
 *  misma cosa, y "Aplicar" es lo que las vuelve verdad.
 *
 *  El prefijo es "empieza con": 09 agarra a todos los celulares. Vacío = cualquier
 *  número, y es el atrapa-todo. Si dos reglas compiten, gana la de prioridad más
 *  baja; la otra queda de respaldo y entra sola si el operador falla.
 * ==========================================================================*/
import { useState } from 'react';
import {
  Card, Group, Text, Badge, Table, Stack, Button, Modal, Select, TextInput, NumberInput,
  ThemeIcon, Alert, ActionIcon, Tooltip, Code, SimpleGrid, Divider, UnstyledButton,
} from '@mantine/core';
import {
  IconRouteAltLeft, IconPlus, IconTrash, IconPlayerPlay, IconInfoCircle, IconPlugConnected,
  IconArrowRight, IconArrowLeft, IconTarget, IconAsterisk, IconAlertTriangle, IconCheck, IconPencil,
} from '@tabler/icons-react';
import PageHeader from '../PageHeader';
import { SkelFilas } from '../Skel';
import { usePoll, api } from '../api';
import { toast, toastPromise } from '../notify';

const VACIA = { name: '', pattern: '', trunk_id: '', priority: 10, cid_number: '' };

// Modos de ruteo a nivel de digitos, con ejemplos. El wizard arranca por aca.
const MODOS = [
  { v: 'todo', t: 'Atrapa-todo', icon: IconRouteAltLeft, color: 'grape',
    d: 'Todo lo que marque la central sale por esta troncal. La regla de respaldo tipica.',
    ej: 'cualquier numero', pat: '', prio: 100 },
  { v: 'prefijo', t: 'Por prefijo', icon: IconArrowRight, color: 'cyan',
    d: 'Los numeros que EMPIEZAN con ciertos digitos salen por aca.',
    ej: '09 -> celulares', pat: '09', prio: 10 },
  { v: 'destino', t: 'Codigo puntual', icon: IconTarget, color: 'teal',
    d: 'Al marcar exactamente un codigo corto: un servicio, una sede, un DID.',
    ej: '1 -> mesa de ayuda', pat: '1', prio: 5 },
];

// Ejemplo animado en vivo: "al marcar X, la central sale por la troncal".
function FlujoRuta({ pattern, trunk }) {
  return (
    <Card withBorder radius="md" p="sm" style={{ background: 'light-dark(#f5f8ff,#0d1626)' }}>
      <svg viewBox="0 0 560 78" width="100%" style={{ display: 'block', color: 'var(--mantine-color-text)' }}>
        <defs><path id="rtpath" d="M 116 42 H 444" fill="none" stroke="none" /></defs>
        <line x1="116" y1="42" x2="256" y2="42" stroke="#7c3aed" strokeWidth="2" strokeDasharray="6 6" className="rt-flow" />
        <line x1="304" y1="42" x2="444" y2="42" stroke="#12b76a" strokeWidth="2" strokeDasharray="6 6" className="rt-flow" />
        <g transform="translate(20 20)">
          <rect width="96" height="44" rx="9" fill="light-dark(#ffffff,#132132)" stroke="#7c3aed" strokeWidth="1.6" />
          <text x="48" y="18" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#7c3aed" letterSpacing=".06em">SE MARCA</text>
          <text x="48" y="36" textAnchor="middle" fontSize="15" fontWeight="800" fontFamily="ui-monospace,monospace" fill="currentColor">{pattern ? pattern + '\u2026' : 'cualquiera'}</text>
        </g>
        <g transform="translate(280 42)">
          <circle r="23" fill="light-dark(#ffffff,#0e1c30)" stroke="#22c55e" strokeWidth="2" />
          <g transform="translate(-10 -10) scale(0.32)" fill="none" stroke="#22c55e" strokeWidth="4" strokeLinejoin="round"><path d="M32 4.5 L56 13.5 V31 c0 14.4 -9.9 25.5 -24 28.5 C17.9 56.5 8 45.4 8 31 V13.5 Z" /></g>
        </g>
        <g transform="translate(448 20)">
          <rect width="96" height="44" rx="9" fill="light-dark(#ffffff,#132132)" stroke="#12b76a" strokeWidth="1.6" />
          <text x="48" y="18" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#12b76a" letterSpacing=".06em">SALE POR</text>
          <text x="48" y="36" textAnchor="middle" fontSize="11" fontWeight="800" fill="currentColor">{(trunk || 'la troncal').slice(0, 12)}</text>
        </g>
        <circle r="4.5" fill="#7c3aed"><animateMotion dur="1.7s" repeatCount="indefinite"><mpath href="#rtpath" /></animateMotion></circle>
      </svg>
      <Text size="xs" ta="center" c="dimmed" mt={4}>Al marcar <b>{pattern ? pattern + '\u2026' : 'cualquier numero'}</b>, la central lo cursa por <b>{trunk || 'la troncal elegida'}</b>.</Text>
      <style jsx>{`.rt-flow{animation:rtf 1s linear infinite}@keyframes rtf{to{stroke-dashoffset:-24}}`}</style>
    </Card>
  );
}

export default function Ruteo() {
  const { data: rutas, cargando, recargar } = usePoll('/routes', 0);
  const { data: troncales } = usePoll('/trunks', 0);
  const { data: vivo, recargar: recargarVivo } = usePoll('/routes/live', 15000);
  const [abierta, setAbierta] = useState(false);
  const [f, setF] = useState(VACIA);
  const [editando, setEditando] = useState(null);
  const [pasoR, setPasoR] = useState(2);
  const [modoR, setModoR] = useState('prefijo');

  if (cargando) return <SkelFilas filas={6} />;

  const tr = troncales || [];
  const rs = rutas || [];
  const opciones = tr.map((t) => ({ value: String(t.id), label: `${t.name} · ${t.provider_host}` }));

  // La verdad la tiene el motor, no nuestra tabla: si el reload no entró, esto lo delata.
  const enMotor = (vivo && vivo.reglas) || [];
  const desfasado = enMotor.length !== rs.filter((r) => r.enabled).length;

  const abrirNueva = () => { setEditando(null); setF(VACIA); setPasoR(1); setAbierta(true); };
  const abrirEditar = (r) => {
    setEditando(r.id);
    setF({ name: r.name || '', pattern: r.pattern || '', trunk_id: String(r.trunk_id || ''), priority: r.priority || 10, cid_number: r.cid_number || '' });
    setPasoR(2); setAbierta(true);
  };
  const crear = () => {
    if (!f.trunk_id) { toast('Elegí por qué troncal sale', 'warn'); return; }
    const ruta = editando ? `/routes/${editando}` : '/routes';
    const metodo = editando ? 'PUT' : 'POST';
    return toastPromise(
      api(ruta, { method: metodo, body: { ...f, trunk_id: +f.trunk_id } })
        .then(() => { setAbierta(false); setF(VACIA); setEditando(null); recargar(); }),
      { loading: 'Guardando…', success: editando ? 'Regla guardada · falta aplicar' : 'Regla creada · falta aplicar', error: (e) => e.message });
  };

  const borrar = (id) => toastPromise(
    api(`/routes/${id}`, { method: 'DELETE' }).then(recargar),
    { loading: 'Borrando…', success: 'Regla borrada · falta aplicar', error: (e) => e.message });

  const aplicar = () => toastPromise(
    api('/routes/apply', { method: 'POST' }).then((r) => { recargar(); recargarVivo(); return r; }),
    {
      loading: 'Volcando al motor y recargando…',
      success: (r) => `${r.troncales} troncal(es) y ${r.rutas} regla(s) en el motor`,
      error: (e) => e.message,
    });

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconRouteAltLeft size={24} />}
        title="Ruteo de salida"
        subtitle="Qué número sale por qué troncal"
        right={
          <Group gap="sm">
            <Button variant="default" leftSection={<IconPlus size={16} />} onClick={abrirNueva}>
              Nueva regla
            </Button>
            <Button color="orange" leftSection={<IconPlayerPlay size={16} />} onClick={aplicar}>
              Aplicar
            </Button>
          </Group>
        }
      />

      <Alert variant="light" color="sbc" radius="lg" icon={<IconInfoCircle size={18} />}>
        El <b>prefijo</b> es "empieza con": <Code fz="11px">09</Code> agarra a todos los celulares.
        Vacío es el <b>atrapa-todo</b>. Si dos reglas compiten por el mismo número gana la de
        <b> prioridad más baja</b>, y la otra queda de respaldo: entra sola si el operador falla.
        Nada de esto rige hasta que tocás <b>Aplicar</b>.
      </Alert>

      {desfasado && (
        <Alert variant="light" color="orange" radius="lg" icon={<IconAlertTriangle size={18} />}>
          Lo que ves acá <b>no es lo que está ruteando el motor ahora mismo</b>: hay cambios sin aplicar.
          El borde sigue con las {enMotor.length} regla(s) de antes.
        </Alert>
      )}

      <Card p={0} className="sbc-fade-in">
        <Table highlightOnHover verticalSpacing="sm" fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={80}>Prioridad</Table.Th>
              <Table.Th>Los números que…</Table.Th>
              <Table.Th w={40} />
              <Table.Th>Salen por</Table.Th>
              <Table.Th>Al marcar, la troncal</Table.Th>
              <Table.Th>En el motor</Table.Th>
              <Table.Th w={50} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rs.map((r) => {
              const t = tr.find((x) => x.id === r.trunk_id);
              const puesta = enMotor.some((m) => m.ruleid === r.id);
              return (
                <Table.Tr key={r.id}>
                  <Table.Td><Badge variant="light" color="gray">{r.priority}</Badge></Table.Td>
                  <Table.Td>
                    <Text fw={650} size="sm">
                      {r.pattern ? <>empiezan con <Code fz="11px">{r.pattern}</Code></> : 'cualquier número'}
                    </Text>
                    {r.name && <Text size="10px" c="dimmed">{r.name}</Text>}
                  </Table.Td>
                  <Table.Td><IconArrowRight size={14} style={{ opacity: .45 }} /></Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <ThemeIcon size={22} radius="md" variant="light" color="cyan"><IconPlugConnected size={12} /></ThemeIcon>
                      <div>
                        <Text fw={650} size="sm">{r.trunk_name || '—'}</Text>
                        <Text size="10px" c="dimmed" ff="monospace">{r.provider_host}</Text>
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td fz="xs" c="dimmed">
                    {t && (t.outbound_strip || t.outbound_prefix)
                      ? <>
                          {t.outbound_strip ? `saca ${t.outbound_strip} dígito(s)` : ''}
                          {t.outbound_strip && t.outbound_prefix ? ' y ' : ''}
                          {t.outbound_prefix ? <>antepone <Code fz="10px">{t.outbound_prefix}</Code></> : ''}
                        </>
                      : 'manda el número tal cual'}
                  </Table.Td>
                  <Table.Td>
                    {puesta
                      ? <Badge size="sm" variant="light" color="teal" leftSection={<IconCheck size={11} />}>aplicada</Badge>
                      : <Badge size="sm" variant="light" color="orange">sin aplicar</Badge>}
                  </Table.Td>
                  <Table.Td>
                    <Group gap={2} wrap="nowrap">
                      <Tooltip label="Editar">
                        <ActionIcon variant="subtle" color="sbc" onClick={() => abrirEditar(r)}><IconPencil size={16} /></ActionIcon>
                      </Tooltip>
                      <Tooltip label="Borrar la regla">
                        <ActionIcon variant="subtle" color="red" onClick={() => borrar(r.id)}><IconTrash size={16} /></ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
            {rs.length === 0 && (
              <Table.Tr><Table.Td colSpan={7}>
                <Stack align="center" py="xl" gap={6}>
                  <ThemeIcon size={44} radius="xl" variant="light" color="gray"><IconRouteAltLeft size={22} /></ThemeIcon>
                  <Text fw={600}>No hay ninguna regla de salida</Text>
                  <Text size="sm" c="dimmed" ta="center" maw={520}>
                    Sin reglas, el SBC no sabe por dónde sacar las llamadas de la central y contesta
                    <Code fz="11px" mx={4}>404 No route to PSTN</Code>. Empezá por una regla atrapa-todo
                    (prefijo vacío) hacia tu troncal.
                  </Text>
                </Stack>
              </Table.Td></Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Card>

      {/* Lo que el motor tiene cargado ahora. La pantalla no puede mentir si muestra esto. */}
      <Card p="lg" className="sbc-fade-in">
        <Group gap={9} mb="sm">
          <ThemeIcon size={28} radius="md" variant="light" color="grape"><IconPlayerPlay size={15} /></ThemeIcon>
          <Text fw={700}>Lo que el motor tiene cargado</Text>
          <Text size="xs" c="dimmed">no lo que dice nuestra tabla: lo que Kamailio va a usar en la próxima llamada</Text>
        </Group>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <div>
            <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={6}>Salidas (gateways)</Text>
            {((vivo && vivo.gateways) || []).map((g) => (
              <Group key={g.gwid} gap={8} py={4}>
                <Badge size="xs" variant="light" color="cyan">#{g.gwid}</Badge>
                <Code fz="11px">{g.address}</Code>
                <Text size="xs" c="dimmed">{g.description}</Text>
              </Group>
            ))}
            {!(vivo && vivo.gateways && vivo.gateways.length) && <Text size="xs" c="dimmed">ninguna</Text>}
          </div>
          <div>
            <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={6}>Reglas</Text>
            {enMotor.map((m) => (
              <Group key={m.ruleid} gap={8} py={4}>
                <Badge size="xs" variant="light" color="gray">{m.priority}</Badge>
                <Code fz="11px">{m.prefix || '(todo)'}</Code>
                <IconArrowRight size={12} style={{ opacity: .5 }} />
                <Text size="xs">salida #{m.gwlist}</Text>
              </Group>
            ))}
            {enMotor.length === 0 && <Text size="xs" c="dimmed">ninguna</Text>}
          </div>
        </SimpleGrid>
      </Card>

      <Modal opened={abierta} onClose={() => setAbierta(false)} size="lg" title={editando ? 'Editar la regla' : 'Nueva regla de salida'}>
        <Stack gap="md">
          {!editando && pasoR === 1 ? (
            <div className="sbc-fade-in" key="rw1">
              <Text ta="center" fw={800} size="lg" lh={1.2}>¿Cómo querés rutear las llamadas de salida?</Text>
              <Text ta="center" size="sm" c="dimmed" mt={4} mb="lg">Elegí a nivel de dígitos. Después elegís por qué troncal salen.</Text>
              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                {MODOS.map((m) => (
                  <UnstyledButton key={m.v} onClick={() => { setModoR(m.v); setF((x) => ({ ...x, pattern: m.pat, priority: m.prio })); setPasoR(2); }}
                    style={{ borderRadius: 16, padding: 18, textAlign: 'center', border: `2px solid ${'var(--mantine-color-' + m.color + '-5)'}33`,
                             background: `var(--mantine-color-${m.color}-light)`, transition: 'transform .16s, box-shadow .16s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 14px 30px -16px rgba(0,0,0,.4)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
                    <ThemeIcon size={52} radius="xl" variant="light" color={m.color} style={{ margin: '0 auto 10px' }}><m.icon size={26} /></ThemeIcon>
                    <Text fw={800}>{m.t}</Text>
                    <Text size="xs" c="dimmed" mt={5} lh={1.45}>{m.d}</Text>
                    <Badge mt={10} size="sm" variant="light" color={m.color}>{m.ej}</Badge>
                  </UnstyledButton>
                ))}
              </SimpleGrid>
            </div>
          ) : (
            <div className="sbc-fade-in" key="rw2">
              <Stack gap="md">
                {!editando && (
                  <Button variant="subtle" color="gray" size="xs" w="fit-content" leftSection={<IconArrowLeft size={14} />} onClick={() => setPasoR(1)}>Cambiar el tipo de ruteo</Button>
                )}
                <Select label="Sale por la troncal" description="El operador que va a cursar estas llamadas."
                        data={opciones} value={f.trunk_id} searchable leftSection={<IconPlugConnected size={15} />}
                        onChange={(v) => setF({ ...f, trunk_id: v })}
                        nothingFoundMessage="Todavía no cargaste ninguna troncal" />
                <TextInput label="CallerID de salida (opcional)"
                           description="Con qué número de la troncal salir en ESTA regla. Vacío = el número por defecto de la troncal (se elige en Números)."
                           placeholder="+59829001234" value={f.cid_number}
                           onChange={(e) => setF({ ...f, cid_number: e.currentTarget.value })} />
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  {modoR !== 'todo' && (
                    <TextInput label={modoR === 'destino' ? 'Código exacto' : 'Prefijo (empieza con)'} leftSection={<IconAsterisk size={14} />}
                               description={modoR === 'destino' ? 'Los dígitos que se marcan para este destino.' : '"Empieza con". Ej: 09, 00, 0.'}
                               placeholder={modoR === 'destino' ? '1' : '09'} value={f.pattern}
                               onChange={(e) => setF({ ...f, pattern: e.currentTarget.value })} />
                  )}
                  <NumberInput label="Prioridad" description="Más bajo = se intenta antes." leftSection={<IconArrowRight size={14} />}
                               min={0} max={999} value={f.priority}
                               onChange={(v) => setF({ ...f, priority: v || 0 })} />
                </SimpleGrid>
                <TextInput label="Nombre (opcional)" description="Para que dentro de un año se entienda qué es esto."
                           placeholder="Celulares por Antel" value={f.name}
                           onChange={(e) => setF({ ...f, name: e.currentTarget.value })} />
                <FlujoRuta pattern={f.pattern} trunk={(tr.find((t) => String(t.id) === f.trunk_id) || {}).name} />
                <Text size="xs" c="dimmed">
                  Los dígitos a sacar y el prefijo que exige el operador se configuran <b>en la troncal</b>, no acá.
                </Text>
                <Group justify="flex-end">
                  <Button variant="default" onClick={() => setAbierta(false)}>Cancelar</Button>
                  <Button leftSection={<IconCheck size={16} />} onClick={crear}>{editando ? 'Guardar' : 'Crear la regla'}</Button>
                </Group>
              </Stack>
            </div>
          )}
        </Stack>
      </Modal>
    </Stack>
  );
}
