'use client';
/* ============================================================================
 *  Red — modo de operación, interfaces, rutas y diagnóstico.
 *
 *  Cuatro cosas distintas que antes vivían apiladas en una sola pantalla larga. Cada
 *  una es una pregunta diferente: "¿qué es este equipo?", "¿cómo están las placas?",
 *  "¿por dónde salgo?", "¿desde acá se llega?". Una pestaña por pregunta.
 *
 *  ROUTER: el SBC es la frontera (WAN a internet, LAN a la central, NAT y ruteo).
 *  Sin servidor DHCP, a propósito: un SBC no es el router de la oficina.
 *
 *  SWITCH: no enruta; puentea sus placas en capa 2. El puente (br0) es una interfaz
 *  virtual más — con nombre, estado e IP — y por eso se configura EN la lista de
 *  interfaces, junto a las físicas, y no en un campo suelto en otra parte.
 * ==========================================================================*/
import { useState, useEffect } from 'react';
import {
  Card, Group, Text, Badge, Table, Stack, Button, Modal, Select, TextInput, NumberInput,
  Switch, ThemeIcon, Alert, SimpleGrid, Code, Tooltip, SegmentedControl, List,
  ActionIcon, Paper, Tabs, Loader,
} from '@mantine/core';
import {
  IconNetwork, IconRouter, IconArrowsShuffle, IconAlertTriangle, IconDeviceFloppy,
  IconPlayerPlay, IconWorld, IconServer2, IconSettings, IconRoute, IconInfoCircle,
  IconPlus, IconTrash, IconAffiliate, IconStethoscope, IconActivity, IconMapPin,
} from '@tabler/icons-react';
import PageHeader from '../PageHeader';
import { SkelFilas } from '../Skel';
import NetDiagram from '../../components/NetDiagram';
import Rj45 from '../../components/Rj45';
import { usePoll, api, fmtBps, ipDe } from '../api';
import { toast, toastPromise } from '../notify';

const ROLES = [
  { value: 'wan', label: 'WAN · da a internet' },
  { value: 'lan', label: 'LAN · da a la central' },
  { value: 'mgmt', label: 'Gestión · sólo el panel' },
  { value: 'sin_uso', label: 'Sin uso' },
];
const MODOS_IF = [
  { value: 'dhcp', label: 'DHCP (cliente)' },
  { value: 'estatica', label: 'IP fija' },
  { value: 'bridge', label: 'Miembro del puente' },
];
const RUTA_VACIA = { destino: '', gateway: '', iface: '', metrica: 100, notas: '', habilitada: true };

/* ── Diagnóstico: la pregunta que abre cualquier problema ─────────────────────
 *
 *  "¿Desde el SBC se llega al operador?" La respuesta no la tiene el que mira el
 *  panel: la tiene el equipo. El destino se valida y se pasa como argumento, nunca
 *  por shell — un campo libre que termina en un `sh -c` es una consola remota
 *  disfrazada de herramienta de diagnóstico.
 * ==========================================================================*/
function Diagnostico({ sugerencias }) {
  const [host, setHost] = useState('');
  const [corriendo, setCorriendo] = useState(null);   // 'ping' | 'trace'
  const [r, setR] = useState(null);

  async function correr(que) {
    const h = host.trim();
    if (!h) { toast('Escribí un host o una IP', 'warn'); return; }
    setCorriendo(que); setR(null);
    try {
      const d = await api(`/network/${que === 'ping' ? 'ping' : 'trace'}`, { method: 'POST', body: { host: h } });
      setR({ que, ...d });
    } catch (e) {
      toast('No se pudo ejecutar', 'bad', { description: e.message });
    } finally { setCorriendo(null); }
  }

  return (
    <Stack gap="lg">
      <Alert variant="light" color="sbc" radius="lg" icon={<IconInfoCircle size={18} />}>
        Esto se ejecuta <b>desde el SBC</b>, no desde tu computadora. Es la diferencia que importa: que vos llegues al
        operador no significa nada si el que tiene que llegar es el borde.
      </Alert>

      <Card p="lg" className="sbc-fade-in">
        <Group gap={9} mb="md">
          <ThemeIcon size={30} radius="md" variant="light" color="sbc"><IconStethoscope size={17} /></ThemeIcon>
          <Text fw={700}>Probar un destino</Text>
        </Group>

        <Group align="flex-end" gap="md" wrap="wrap">
          <TextInput label="Host o IP" description="El operador, la central, el gateway de una ruta…"
                     placeholder="172.20.30.9" value={host} w={280}
                     onChange={(e) => setHost(e.currentTarget.value)}
                     onKeyDown={(e) => { if (e.key === 'Enter') correr('ping'); }} />
          <Button leftSection={<IconActivity size={16} />} loading={corriendo === 'ping'}
                  disabled={!!corriendo} onClick={() => correr('ping')}>
            Ping
          </Button>
          <Button variant="default" leftSection={<IconMapPin size={16} />} loading={corriendo === 'trace'}
                  disabled={!!corriendo} onClick={() => correr('trace')}>
            Traceroute
          </Button>
        </Group>

        {sugerencias.length > 0 && (
          <Group gap={6} mt="md">
            <Text size="xs" c="dimmed">Rápido:</Text>
            {sugerencias.map((s) => (
              <Badge key={s.host} variant="light" color="gray" style={{ cursor: 'pointer' }}
                     onClick={() => setHost(s.host)}>
                {s.host}{s.que ? ` · ${s.que}` : ''}
              </Badge>
            ))}
          </Group>
        )}

        {corriendo === 'trace' && (
          <Group gap={8} mt="md">
            <Loader size="xs" />
            <Text size="xs" c="dimmed">El traceroute tarda: cada salto que no contesta se espera 2 segundos.</Text>
          </Group>
        )}
      </Card>

      {r && (
        <Card p="lg" className="sbc-fade-in">
          <Group justify="space-between" mb="sm">
            <Group gap={9}>
              <ThemeIcon size={28} radius="md" variant="light" color={r.ok ? 'teal' : 'red'}>
                {r.que === 'ping' ? <IconActivity size={15} /> : <IconMapPin size={15} />}
              </ThemeIcon>
              <Text fw={700}>{r.que === 'ping' ? 'Ping' : 'Traceroute'}</Text>
              <Badge variant="light" color={r.ok ? 'teal' : 'red'}>
                {r.ok ? 'respondió' : 'no respondió'}
              </Badge>
            </Group>
            <Text size="xs" c="dimmed" ff="monospace">{r.ms} ms</Text>
          </Group>
          <Code block fz="11.5px" style={{ maxHeight: 340, overflow: 'auto' }}>{r.salida || '(sin salida)'}</Code>
          <Text size="10px" c="dimmed" mt={6} ff="monospace">{r.comando}</Text>
          {!r.ok && r.que === 'ping' && (
            <Alert variant="light" color="orange" radius="md" mt="md" icon={<IconAlertTriangle size={16} />}>
              Que no conteste el ping <b>no siempre</b> significa que no se llegue: hay operadores y firewalls que
              descartan el ICMP y aceptan el SIP igual. Antes de dar por muerto el enlace, mirá el traceroute y la
              captura SIP.
            </Alert>
          )}
        </Card>
      )}
    </Stack>
  );
}

/* ── la página ──────────────────────────────────────────────────────────── */

export default function Red() {
  const { data, cargando, recargar } = usePoll('/network/config', 6000);
  const [cfg, setCfg] = useState(null);
  const [ifaces, setIfaces] = useState([]);
  const [sel, setSel] = useState(null);
  const [plan, setPlan] = useState(null);
  const [sucio, setSucio] = useState(false);
  const [rutaAbierta, setRutaAbierta] = useState(false);
  const [nr, setNr] = useState(RUTA_VACIA);

  useEffect(() => {
    if (!data || sucio) return;
    setCfg(data.cfg);
    setIfaces(data.interfaces || []);
  }, [data, sucio]);

  // `cargando` se apaga en cuanto llega la respuesta, pero `cfg` se llena en el useEffect,
  // o sea DESPUES de este render: sin esperar a la copia local, el primer render explota.
  if (cargando || !data || !cfg) return <SkelFilas filas={6} />;

  const estaticas = data.estaticas || [];
  const bridge = cfg.bridge || 'br0';
  const enRouter = cfg.modo === 'router';

  const editar = (nombre, campo, valor) => {
    setSucio(true);
    setIfaces((xs) => xs.map((i) => (i.name === nombre ? { ...i, [campo]: valor } : i)));
  };
  const editarCfg = (campo, valor) => { setSucio(true); setCfg((c) => ({ ...c, [campo]: valor })); };

  // El puente es una interfaz más. Si todavía no existe en el kernel (nunca se aplicó el
  // modo switch), igual se muestra: es lo que VA a existir, y hay que poder nombrarlo
  // desde el mismo lugar donde se configura todo lo demás.
  const fisicas = ifaces.filter((i) => i.name !== bridge);
  const puenteReal = ifaces.find((i) => i.name === bridge);
  const filas = enRouter
    ? fisicas
    : [...fisicas, puenteReal || { name: bridge, estado: 'apagada', pendiente: true }];

  const sugerencias = [
    ...estaticas.filter((r) => r.gateway).slice(0, 2).map((r) => ({ host: r.gateway, que: 'gateway' })),
    ...(data.rutas || []).filter((r) => r.destino === 'default' && r.via).slice(0, 1)
      .map((r) => ({ host: r.via, que: 'salida por defecto' })),
  ];

  const guardar = () => toastPromise(
    api('/network/config', { method: 'PUT', body: { ...cfg, interfaces: ifaces } })
      .then(() => { setSucio(false); recargar(); }),
    { loading: 'Guardando…', success: 'Guardado (todavía no aplicado)', error: 'No se pudo guardar' });

  const verPlan = async () => {
    try { setPlan(await api('/network/plan', { method: 'POST', body: cfg })); }
    catch (e) { toast(e.message, 'bad', { icon: 'enlace' }); }
  };

  const aplicar = () => toastPromise(
    api('/network/apply', { method: 'POST', body: { confirmar: true } }).then((r) => {
      setPlan(null); recargar();
      if (!r.ok) throw new Error(r.fallo || 'falló un paso');
      return r;
    }),
    { loading: 'Aplicando…', success: 'Modo de red y rutas aplicados', error: (e) => `No se pudo aplicar: ${e.message}` });

  const crearRuta = () => toastPromise(
    api('/network/routes', { method: 'POST', body: nr }).then(() => { setRutaAbierta(false); setNr(RUTA_VACIA); recargar(); }),
    { loading: 'Guardando la ruta…', success: 'Ruta agregada (falta aplicar)', error: (e) => e.message });

  const borrarRuta = (r) => toastPromise(
    api(`/network/routes/${r.id}`, { method: 'DELETE' }).then(recargar),
    { loading: 'Borrando…', success: `Ruta a ${r.destino} borrada`, error: 'No se pudo borrar' });

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconNetwork size={24} />}
        title="Red"
        subtitle="Modo de operación, interfaces, rutas y diagnóstico"
        right={
          <Group gap="sm">
            <Button variant="default" leftSection={<IconDeviceFloppy size={16} />} onClick={guardar} disabled={!sucio}>
              Guardar
            </Button>
            <Button leftSection={<IconPlayerPlay size={16} />} onClick={verPlan}>Aplicar…</Button>
          </Group>
        }
      />

      {/* ═══ MODO: el dibujo con los controles encima, y las INTERFACES justo debajo.
           No son pestañas: el modo y las placas se leen de un vistazo, juntos —
           cambiás una placa a WAN y la ves moverse en el diagrama de arriba. ═══ */}
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" style={{ alignItems: 'start' }}>
          <Card p={0} className="sbc-fade-in" style={{ position: 'relative', overflow: 'hidden', border: '1px solid light-dark(#dce4f3, rgba(120,140,190,.16))', background: 'radial-gradient(130% 120% at 50% -10%, light-dark(#eef4ff,#0f1a2c) 0%, light-dark(#e7edfb,#0a1120) 70%)' }}>
            <Paper p={4} radius="xl" withBorder
                   style={{ position: 'absolute', top: 12, right: 12, zIndex: 2, backdropFilter: 'blur(8px)',
                            background: 'light-dark(rgba(255,255,255,.85), rgba(16,22,32,.8))' }}>
              {/* Texto plano en los labels: con un ícono adentro, el SegmentedControl le da
                  distinta altura a cada opción y las etiquetas dejan de alinearse. */}
              <SegmentedControl
                size="sm" radius="xl" value={cfg.modo} onChange={(v) => editarCfg('modo', v)}
                data={[{ value: 'router', label: 'Router' }, { value: 'switch', label: 'Switch' }]}
              />
            </Paper>

            <Paper p="xs" px="sm" radius="lg" withBorder maw={340}
                   style={{ position: 'absolute', top: 12, left: 12, zIndex: 2, backdropFilter: 'blur(8px)',
                            background: 'light-dark(rgba(255,255,255,.85), rgba(16,22,32,.8))' }}>
              <Group gap={8} wrap="nowrap" align="flex-start">
                <ThemeIcon size={26} radius="md" variant="light" color={enRouter ? 'orange' : 'cyan'}>
                  {enRouter ? <IconRouter size={15} /> : <IconArrowsShuffle size={15} />}
                </ThemeIcon>
                <div>
                  <Text size="xs" fw={700} lh={1.2}>{enRouter ? 'El SBC es la frontera' : 'El SBC es transparente'}</Text>
                  <Text size="10.5px" c="dimmed" lh={1.35}>
                    {enRouter
                      ? 'Entra por la WAN, sale por la LAN a la central, y enmascara. Sin servidor DHCP: un SBC no es el router de la oficina.'
                      : `Las placas quedan unidas por ${bridge} en capa 2. Sin NAT, sin ruteo: para cuando ya hay un firewall adelante.`}
                  </Text>
                </div>
              </Group>
            </Paper>

            <div style={{ padding: '56px 16px 12px' }}>
              <NetDiagram modo={cfg.modo} interfaces={ifaces} estaticas={estaticas} bridge={bridge}
                          seleccion={sel} onSelect={setSel} />
            </div>

            {enRouter ? (
              <Group gap="md" p="sm" px="md" wrap="wrap"
                     style={{ borderTop: '1px solid light-dark(#eef1f7, rgba(120,130,150,.14))' }}>
                <Select size="xs" w={190} label="Interfaz WAN" leftSection={<IconWorld size={14} />}
                        data={fisicas.map((i) => i.name)}
                        value={cfg.wan_if || null} onChange={(v) => editarCfg('wan_if', v)} />
                <Select size="xs" w={190} label="Interfaz LAN" leftSection={<IconServer2 size={14} />}
                        data={fisicas.map((i) => i.name)}
                        value={cfg.lan_if || null} onChange={(v) => editarCfg('lan_if', v)} />
                <Switch size="sm" mt={18} label="NAT de salida" checked={!!cfg.nat}
                        onChange={(e) => editarCfg('nat', e.currentTarget.checked)} />
                <Switch size="sm" mt={18} label="Ruteo entre placas" checked={!!cfg.forward}
                        onChange={(e) => editarCfg('forward', e.currentTarget.checked)} />
              </Group>
            ) : (
              <Group gap={8} p="sm" px="md"
                     style={{ borderTop: '1px solid light-dark(#eef1f7, rgba(120,130,150,.14))' }}>
                <IconAffiliate size={15} style={{ opacity: .6 }} />
                <Text size="xs" c="dimmed">
                  El puente <b>{bridge}</b> es una interfaz virtual: se configura en la pestaña
                  <b> Interfaces</b>, junto a las físicas.
                </Text>
              </Group>
            )}
          </Card>

        {/* ═══ INTERFACES (el puente es una más), directo debajo del diagrama ══ */}
          <Card p={0} className="sbc-fade-in">
            <Group p="lg" pb="sm" gap={9}>
              <ThemeIcon size={30} radius="md" variant="light" color="cyan"><IconSettings size={17} /></ThemeIcon>
              <Text fw={700}>Interfaces</Text>
              <Text size="xs" c="dimmed">el estado sale del kernel; el rol y la IP los definís vos</Text>
            </Group>
            <Table highlightOnHover verticalSpacing="sm" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Placa</Table.Th><Table.Th>Tipo</Table.Th><Table.Th>Enlace</Table.Th><Table.Th>Rol</Table.Th>
                  <Table.Th>Modo</Table.Th><Table.Th>IP</Table.Th><Table.Th>VLAN</Table.Th><Table.Th>Tráfico</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filas.map((i) => {
                  const dir = ipDe(i);
                  const esPuente = i.name === bridge;
                  return (
                    <Table.Tr key={i.name} onClick={() => setSel(i.name)}
                              style={{ background: sel === i.name ? 'var(--mantine-color-default-hover)' : undefined }}>
                      <Table.Td>
                        <Group gap={8} wrap="nowrap">
                          {esPuente
                            ? <ThemeIcon size={34} radius="md" variant="light" color="cyan"><IconAffiliate size={18} /></ThemeIcon>
                            : <Rj45 estado={i.estado} rx={i.rx_bps} tx={i.tx_bps} size={34} />}
                          {esPuente ? (
                            <div>
                              {/* El nombre del puente se edita ACA, que es donde el técnico lo
                                  busca: en la lista de interfaces, no en un campo suelto. */}
                              <TextInput size="xs" w={130} value={bridge} ff="monospace" fw={700}
                                         onChange={(e) => editarCfg('bridge', e.currentTarget.value)} />
                              <Text size="10px" c="dimmed" mt={2}>
                                {i.pendiente ? 'todavía no existe: se crea al aplicar' : (dir ? dir.ip : 'sin dirección')}
                              </Text>
                            </div>
                          ) : (
                            <div>
                              <Text fw={700} ff="monospace" size="sm">{i.name}</Text>
                              <Text size="10px" c="dimmed">{dir ? dir.ip : 'sin dirección'}</Text>
                            </div>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Badge size="sm" variant="light" color={esPuente ? 'cyan' : 'gray'}>
                          {esPuente ? 'virtual · puente' : 'física'}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Badge size="sm" variant="dot"
                               color={i.estado === 'conectada' ? 'teal' : i.estado === 'sin_cable' ? 'red' : 'gray'}>
                          {i.estado === 'conectada' ? 'enlace' : i.estado === 'sin_cable' ? 'sin cable' : (i.estado || '—')}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        {esPuente
                          ? <Text size="xs" c="dimmed">une a las de abajo</Text>
                          : <Select size="xs" w={180} data={ROLES} value={i.rol || 'sin_uso'}
                                    onChange={(v) => editar(i.name, 'rol', v)} />}
                      </Table.Td>
                      <Table.Td>
                        {esPuente
                          ? <Badge size="sm" variant="light" color="cyan">capa 2</Badge>
                          : <Select size="xs" w={160} data={MODOS_IF} value={i.modo || 'dhcp'}
                                    onChange={(v) => editar(i.name, 'modo', v)} />}
                      </Table.Td>
                      <Table.Td>
                        {esPuente
                          ? <Text size="xs" c="dimmed" ff="monospace">{dir ? dir.ip : '—'}</Text>
                          : <TextInput size="xs" w={145} placeholder="192.168.1.10/24" disabled={i.modo !== 'estatica'}
                                       value={i.ip_config || ''}
                                       onChange={(e) => editar(i.name, 'ip_config', e.currentTarget.value)} />}
                      </Table.Td>
                      <Table.Td>
                        {esPuente ? <Text size="xs" c="dimmed">—</Text> : (
                          <NumberInput size="xs" w={78} placeholder="—" min={1} max={4094} disabled={enRouter}
                                       value={i.vlan || ''} onChange={(v) => editar(i.name, 'vlan', v || null)} />
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" ff="monospace" c="dimmed">
                          {fmtBps(i.rx_bps)} ↓<br />{fmtBps(i.tx_bps)} ↑
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Card>
      </SimpleGrid>

      {/* ═══ RUTAS y DIAGNÓSTICO sí van en pestañas: son tareas puntuales, no
           el estado del equipo que se mira de un vistazo. ═══════════════════ */}
      <Tabs defaultValue="rutas" variant="pills" radius="md" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="rutas" leftSection={<IconRoute size={15} />}>
            Rutas estáticas
            {estaticas.length > 0 && <Badge size="xs" variant="light" color="grape" ml={6}>{estaticas.length}</Badge>}
          </Tabs.Tab>
          <Tabs.Tab value="diag" leftSection={<IconStethoscope size={15} />}>Diagnóstico</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="rutas">
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" style={{ alignItems: 'start' }}>
            <Card p={0} className="sbc-tabin">
              <Group p="lg" pb="sm" justify="space-between">
                <Group gap={9}>
                  <ThemeIcon size={30} radius="md" variant="light" color="grape"><IconRoute size={17} /></ThemeIcon>
                  <div>
                    <Text fw={700}>Rutas estáticas</Text>
                    <Text size="xs" c="dimmed">
                      para alcanzar gateways que tengan troncales SIP detrás, o centrales en otra red
                    </Text>
                  </div>
                </Group>
                <Button size="xs" variant="default" leftSection={<IconPlus size={15} />} onClick={() => setRutaAbierta(true)}>
                  Nueva ruta
                </Button>
              </Group>

              <Table highlightOnHover verticalSpacing="sm" fz="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Destino</Table.Th><Table.Th>Gateway</Table.Th><Table.Th>Placa</Table.Th>
                    <Table.Th>Métrica</Table.Th><Table.Th>Para qué</Table.Th><Table.Th w={50} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {estaticas.map((r) => (
                    <Table.Tr key={r.id}>
                      <Table.Td><Code fw={700}>{r.destino}</Code></Table.Td>
                      <Table.Td ff="monospace" c={r.gateway ? undefined : 'dimmed'}>{r.gateway || 'directo'}</Table.Td>
                      <Table.Td ff="monospace" fz="xs">{r.iface || '—'}</Table.Td>
                      <Table.Td><Badge size="sm" variant="light" color="gray">{r.metrica}</Badge></Table.Td>
                      <Table.Td fz="xs" c="dimmed">{r.notas || '—'}</Table.Td>
                      <Table.Td>
                        <Tooltip label="Borrar la ruta (también del kernel)">
                          <ActionIcon variant="subtle" color="red" onClick={() => borrarRuta(r)}><IconTrash size={15} /></ActionIcon>
                        </Tooltip>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                  {estaticas.length === 0 && (
                    <Table.Tr><Table.Td colSpan={6}>
                      <Stack align="center" py="lg" gap={4}>
                        <Text fw={600} size="sm">Sin rutas estáticas</Text>
                        <Text size="xs" c="dimmed" ta="center" maw={520}>
                          Todo sale por la ruta por defecto. Agregá una cuando un operador te entregue el SIP por un
                          enlace aparte, o cuando una central viva detrás de otro router: si no, esos paquetes salen
                          por la WAN y no vuelven — y el síntoma es el peor de todos, "registra pero no hay audio".
                        </Text>
                      </Stack>
                    </Table.Td></Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Card>

            <Card p="lg" className="sbc-fade-in">
              <Group gap={9} mb="sm">
                <ThemeIcon size={30} radius="md" variant="light" color="gray"><IconRoute size={17} /></ThemeIcon>
                <Text fw={700}>Tabla de rutas del sistema</Text>
                <Text size="xs" c="dimmed">lo que el kernel está usando en este momento</Text>
              </Group>
              <Table verticalSpacing="xs" fz="sm">
                <Table.Thead>
                  <Table.Tr><Table.Th>Destino</Table.Th><Table.Th>Gateway</Table.Th><Table.Th>Interfaz</Table.Th></Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(data.rutas || []).map((r, n) => (
                    <Table.Tr key={n}>
                      <Table.Td ff="monospace">
                        {r.destino === 'default'
                          ? <Badge size="sm" variant="light" color="orange">default</Badge>
                          : r.destino}
                      </Table.Td>
                      <Table.Td ff="monospace" c={r.via ? undefined : 'dimmed'}>{r.via || 'directo'}</Table.Td>
                      <Table.Td ff="monospace" fw={600}>{r.dev}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Card>
          </SimpleGrid>
        </Tabs.Panel>

        <Tabs.Panel value="diag"><Diagnostico sugerencias={sugerencias} /></Tabs.Panel>
      </Tabs>

      {/* ── nueva ruta ──────────────────────────────────────────────────────── */}
      <Modal opened={rutaAbierta} onClose={() => setRutaAbierta(false)} title="Nueva ruta estática">
        <Stack gap="md">
          <TextInput label="Red destino" description="En CIDR. Ej: 10.20.0.0/16 · 190.64.60.5/32"
                     placeholder="10.20.0.0/16" value={nr.destino}
                     onChange={(e) => setNr({ ...nr, destino: e.currentTarget.value })} required />
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <TextInput label="Gateway" description="El router que sabe llegar" placeholder="192.168.1.254"
                       value={nr.gateway} onChange={(e) => setNr({ ...nr, gateway: e.currentTarget.value })} />
            <Select label="Placa de salida" description="Opcional: el kernel la deduce del gateway"
                    data={ifaces.map((i) => i.name)} value={nr.iface || null} clearable
                    onChange={(v) => setNr({ ...nr, iface: v || '' })} />
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <NumberInput label="Métrica" description="Si hay dos rutas al mismo destino, gana la menor"
                         value={nr.metrica} min={1} max={9999}
                         onChange={(v) => setNr({ ...nr, metrica: v || 100 })} />
            <TextInput label="Para qué es" description="Tu yo del futuro te lo va a agradecer"
                       placeholder="SIP de Antel por el enlace dedicado" value={nr.notas}
                       onChange={(e) => setNr({ ...nr, notas: e.currentTarget.value })} />
          </SimpleGrid>
          <Alert variant="light" color="sbc" radius="md" icon={<IconInfoCircle size={16} />}>
            La ruta se guarda ahora, pero entra en vigencia cuando toques <b>Aplicar</b> arriba: se agrega al kernel
            junto con el resto de la configuración de red.
          </Alert>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRutaAbierta(false)}>Cancelar</Button>
            <Button onClick={crearRuta}>Agregar ruta</Button>
          </Group>
        </Stack>
      </Modal>

      {/* ── el plan, antes de romper nada ───────────────────────────────────── */}
      <Modal opened={!!plan} onClose={() => setPlan(null)} title="Esto es lo que se va a ejecutar" size="lg">
        <Alert color="red" variant="light" radius="md" icon={<IconAlertTriangle size={18} />} mb="md">
          Cambiar el modo de red puede <b>cortar tu propia sesión</b> con el panel: si entrás por la placa que estás
          por reconfigurar, vas a perder la pantalla. Tené a mano la consola del hipervisor.
        </Alert>
        <List size="sm" spacing="sm" mb="lg">
          {(plan && plan.pasos ? plan.pasos : []).map((p, n) => (
            <List.Item key={n} icon={<ThemeIcon size={20} radius="xl" variant="light" color="sbc">{n + 1}</ThemeIcon>}>
              <Text size="sm" fw={600}>{p.desc}</Text>
              <Code block fz="11px" mt={4}>{p.texto}</Code>
            </List.Item>
          ))}
        </List>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setPlan(null)}>Cancelar</Button>
          <Button color="red" leftSection={<IconPlayerPlay size={16} />} onClick={aplicar}>Aplicar de verdad</Button>
        </Group>
      </Modal>
    </Stack>
  );
}
                                                                                                                                                                                                                                                                                