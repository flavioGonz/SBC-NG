'use client';
/* ============================================================================
 *  Seguridad — la puerta.
 *
 *  Todo lo que golpea el 5060 desde internet pasa por acá: escaneos de sipvicious,
 *  intentos de registro a fuerza bruta, INVITEs a números caros. pike + htable(ipban)
 *  los frena en el borde; secfilter tira los User-Agent conocidos de los escáneres.
 *  Esta pantalla muestra a quién frenamos y permite soltarlo si fue un falso positivo.
 * ==========================================================================*/
import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  Card, Group, Text, Badge, Table, Stack, Button, Skeleton, ThemeIcon, TextInput,
  SimpleGrid, Tooltip, Code, Timeline, Tabs, NumberInput, Switch, Alert, TagsInput, Divider,
  Select, ActionIcon, SegmentedControl, Progress, RingProgress, Grid, Box, Anchor, Modal,
} from '@mantine/core';
import {
  IconShieldCheck, IconSearch, IconLockOpen, IconAlertTriangle, IconBan, IconActivity,
  IconAdjustments, IconDeviceFloppy, IconPlayerPlay, IconServerCog, IconRefresh, IconWorld,
  IconList, IconPlus, IconTrash, IconRobot, IconCheck, IconFlame,
  IconMapPin, IconLockOff, IconShieldX, IconRadar2, IconWaveSine, IconKey, IconPhoneOff,
  IconHandStop, IconServer2, IconExternalLink, IconInfoCircle,
} from '@tabler/icons-react';
import PageHeader from '../PageHeader';
import LiveLog from '../LiveLog';
import AttackMap from '../AttackMap';
import Skel, { SkelFilas } from '../Skel';
import Slot from '../Slot';
import { usePoll, api } from '../api';
import { toast, toastPromise } from '../notify';

const SEV = { crit: 'red', warn: 'orange', info: 'sbc' };

/* ── Ajustes del borde: los umbrales con los que se defiende ──────────────── */
function Ajustes() {
  const { data, cargando, recargar } = usePoll('/security/settings', 0);
  const [s, setS] = useState(null);
  const [sucio, setSucio] = useState(false);
  useEffect(() => { if (data && !sucio) setS(data); }, [data, sucio]);
  // `s` se llena en el useEffect, o sea despues del render en que `cargando` se apaga.
  if (cargando || !s) return <SkelFilas filas={6} />;

  const set = (k, v) => { setSucio(true); setS((x) => ({ ...x, [k]: v })); };

  const guardar = () => toastPromise(
    api('/security/settings', { method: 'PUT', body: s }).then(() => { setSucio(false); recargar(); }),
    { loading: 'Guardando…', success: 'Guardado. Falta aplicar.', error: 'No se pudo guardar' });
  const aplicar = () => toastPromise(
    api('/security/apply', { method: 'POST' }).then(recargar),
    { loading: 'Recargando el borde…', success: 'Umbrales aplicados', error: (e) => e.message });

  return (
    <Card p="lg" className="sbc-tabin">
      <Group justify="space-between" mb="md">
        <div>
          <Text fw={700}>Defensa del borde</Text>
          <Text size="sm" c="dimmed">Qué tiene que hacer alguien para que lo bloqueemos, y por cuánto tiempo.</Text>
        </div>
        <Group gap="sm">
          <Button variant="default" leftSection={<IconDeviceFloppy size={16} />} onClick={guardar} disabled={!sucio}>Guardar</Button>
          <Button color="orange" leftSection={<IconPlayerPlay size={16} />} onClick={aplicar}>Aplicar</Button>
        </Group>
      </Group>

      {/* Sólo los umbrales que el borde REALMENTE usa. Si un control no mueve nada
          abajo, no va en la pantalla: un panel con perillas que no hacen nada es peor
          que un panel sin esas perillas. (El bloqueo por país queda pendiente de
          integrar GeoIP; hasta entonces no se ofrece.) */}
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <NumberInput label="Pedidos permitidos" description="Cuántos mensajes SIP tolera una IP…" min={1}
                     value={s.pike_req} onChange={(v) => set('pike_req', v)} />
        <NumberInput label="…en esta ventana (s)" description="…antes de considerarlo una avalancha" min={1}
                     value={s.pike_seg} onChange={(v) => set('pike_seg', v)} />
        <NumberInput label="Duración del bloqueo (s)" description="Cuánto queda afuera. 3600 = una hora." min={60}
                     value={s.ban_seg} onChange={(v) => set('ban_seg', v)} />
      </SimpleGrid>

      <Divider my="md" />

      <Stack gap="sm">
        <Switch label="Filtrar escáneres conocidos (secfilter)" checked={!!s.secfilter}
                onChange={(e) => set('secfilter', e.currentTarget.checked)}
                description="Tira los mensajes de sipvicious, friendly-scanner y compañía por su User-Agent. Es gratis y saca el 90% del ruido de fondo de internet." />
        <Switch label="Exigir TLS" checked={!!s.solo_tls} onChange={(e) => set('solo_tls', e.currentTarget.checked)}
                description="Rechaza la señalización en claro que venga de afuera. Ojo: un teléfono viejo que no habla TLS deja de registrar." />
      </Stack>

      <Alert variant="light" color="orange" radius="md" mt="md" icon={<IconAlertTriangle size={16} />}>
        Aplicar reescribe la configuración del borde y reinicia Kamailio: las llamadas en curso se cortan.
        No es una operación de horario pico.
      </Alert>
    </Card>
  );
}

/* ── Motores: qué está corriendo y reinicio manual ───────────────────────── */
function Motores() {
  const { data, cargando, recargar } = usePoll('/engines', 10000);
  if (cargando) return <SkelFilas filas={6} />;
  if (data && !data.docker) {
    return (
      <Alert color="orange" variant="light" radius="lg" icon={<IconAlertTriangle size={18} />}>
        El control-plane no llega al socket de Docker, así que puede guardar configuración pero no reiniciar los motores
        para aplicarla. Revisá que el compose monte <Code>/var/run/docker.sock</Code>.
      </Alert>
    );
  }
  const reiniciar = (m) => toastPromise(
    api(`/engines/${m}/restart`, { method: 'POST' }).then(recargar),
    { loading: `Reiniciando ${m}…`, success: `${m} reiniciado`, error: (e) => e.message });

  return (
    <Card p={0} className="sbc-tabin">
      <Table highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr><Table.Th>Motor</Table.Th><Table.Th>Estado</Table.Th><Table.Th>Desde</Table.Th><Table.Th>Reinicios</Table.Th><Table.Th /></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {((data && data.motores) || []).map((m) => (
            <Table.Tr key={m.motor}>
              <Table.Td>
                <Group gap={8}>
                  <ThemeIcon size={26} radius="md" variant="light" color={m.corriendo ? 'teal' : 'red'}><IconServerCog size={14} /></ThemeIcon>
                  <Text fw={650}>{m.motor}</Text>
                </Group>
              </Table.Td>
              <Table.Td><Badge variant="light" color={m.corriendo ? 'teal' : 'red'}>{m.corriendo ? 'corriendo' : 'detenido'}</Badge></Table.Td>
              <Table.Td fz="xs" c="dimmed">{m.desde ? new Date(m.desde).toLocaleString('es-UY') : '—'}</Table.Td>
              <Table.Td>{m.reinicios ?? 0}</Table.Td>
              <Table.Td>
                <Tooltip label="Reiniciar: corta las llamadas en curso">
                  <Button size="compact-sm" variant="light" color="orange" leftSection={<IconRefresh size={14} />}
                          onClick={() => reiniciar(m.motor)}>Reiniciar</Button>
                </Tooltip>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Card>
  );
}

/* ── Listas: al que se delata solo ────────────────────────────────────────────
 *
 *  El ipban del pike frena al que INSISTE (muchos intentos en pocos segundos). Esto
 *  frena al que se DELATA en el primer paquete: el que viene con User-Agent
 *  "sipvicious", el que llega de una IP que ya conocemos, el que marca a un destino
 *  que no queremos. Es mas barato que el ipban —se descarta antes de procesar nada— y
 *  no necesita que el atacante haga ruido.
 *
 *  La lista BLANCA gana siempre: es la valvula de escape para cuando un cliente real
 *  quedo del lado equivocado de una regla.
 * ==========================================================================*/
const TIPOS = [
  { value: '0', label: 'User-Agent', ayuda: 'El teléfono dice qué es. Los escáneres no se molestan en mentir: "sipvicious", "friendly-scanner".' },
  { value: '3', label: 'Dirección IP', ayuda: 'Bloquea todo lo que venga de esa IP, sin importar qué mande.' },
  { value: '2', label: 'Dominio', ayuda: 'El dominio del From o del R-URI.' },
  { value: '4', label: 'Usuario', ayuda: 'El usuario marcado o el que llama. Sirve para tapar destinos caros.' },
  { value: '1', label: 'País', ayuda: 'Código de país (requiere geoip cargado en el motor).' },
];
const nombreTipo = (t) => (TIPOS.find((x) => x.value === String(t)) || {}).label || String(t);

function Listas() {
  const { data, cargando, recargar } = usePoll('/security/filters', 0);
  const [tipo, setTipo] = useState('0');
  const [lista, setLista] = useState('negra');
  const [dato, setDato] = useState('');

  if (cargando) return <SkelFilas filas={6} />;
  const filas = data || [];
  const negras = filas.filter((f) => !f.action);
  const blancas = filas.filter((f) => f.action);

  const agregar = () => {
    if (!dato.trim()) { toast('Falta el dato a filtrar', 'warn'); return; }
    return toastPromise(
      api('/security/filters', { method: 'POST', body: { type: +tipo, action: lista === 'blanca' ? 1 : 0, data: dato.trim() } })
        .then(() => { setDato(''); recargar(); }),
      { loading: 'Agregando…', success: 'Agregado y aplicado en el motor', error: (e) => e.message });
  };

  const borrar = (id) => toastPromise(
    api(`/security/filters/${id}`, { method: 'DELETE' }).then(recargar),
    { loading: 'Sacando…', success: 'Sacado y aplicado en el motor', error: (e) => e.message });

  const tabla = (fs, vacio) => (
    <Table highlightOnHover verticalSpacing="xs" fz="sm">
      <Table.Thead>
        <Table.Tr><Table.Th w={130}>Tipo</Table.Th><Table.Th>Valor</Table.Th><Table.Th w={50} /></Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {fs.map((f) => (
          <Table.Tr key={f.id}>
            <Table.Td><Badge size="sm" variant="light" color="gray">{nombreTipo(f.type)}</Badge></Table.Td>
            <Table.Td><Code fz="11px">{f.data}</Code></Table.Td>
            <Table.Td>
              <ActionIcon variant="subtle" color="red" onClick={() => borrar(f.id)}><IconTrash size={15} /></ActionIcon>
            </Table.Td>
          </Table.Tr>
        ))}
        {fs.length === 0 && (
          <Table.Tr><Table.Td colSpan={3}><Text size="sm" c="dimmed" ta="center" py="md">{vacio}</Text></Table.Td></Table.Tr>
        )}
      </Table.Tbody>
    </Table>
  );

  return (
    <Stack gap="lg">
      <Alert variant="light" color="sbc" radius="lg" icon={<IconRobot size={18} />}>
        Esto se aplica <b>en el primer paquete</b>, antes de procesar nada: es la defensa más barata que tiene el
        borde. La <b>lista blanca gana siempre</b> — es la válvula de escape para cuando un cliente real queda del
        lado equivocado de una regla. Los cambios entran solos: no hay que aplicar nada.
      </Alert>

      <Card p="lg" className="sbc-fade-in">
        <Group gap={9} mb="md">
          <ThemeIcon size={30} radius="md" variant="light" color="red"><IconPlus size={17} /></ThemeIcon>
          <Text fw={700}>Agregar a una lista</Text>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="md" style={{ alignItems: 'end' }}>
          <Select label="Qué mirar" description="Por dónde se lo reconoce" data={TIPOS} value={tipo}
                  onChange={(v) => setTipo(v || '0')} />
          <TextInput label="Valor" description="Exacto, sin comodines" placeholder="sipvicious"
                     value={dato} onChange={(e) => setDato(e.currentTarget.value)} />
          <div>
            <Text size="sm" fw={500} mb={2}>Lista</Text>
            <Text size="xs" c="dimmed" mb={6}>Negra bloquea; blanca deja pasar</Text>
            <SegmentedControl fullWidth value={lista} onChange={setLista}
              data={[{ label: 'Negra', value: 'negra' }, { label: 'Blanca', value: 'blanca' }]} />
          </div>
          <Button leftSection={<IconPlus size={16} />} onClick={agregar}>Agregar</Button>
        </SimpleGrid>
        <Text size="xs" c="dimmed" mt="sm">
          {(TIPOS.find((t) => t.value === tipo) || {}).ayuda}
        </Text>
      </Card>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <Card p={0} className="sbc-fade-in">
          <Group p="lg" pb="xs" gap={9}>
            <ThemeIcon size={28} radius="md" variant="light" color="red"><IconBan size={15} /></ThemeIcon>
            <Text fw={700}>Lista negra</Text>
            <Badge size="sm" variant="light" color="red">{negras.length}</Badge>
          </Group>
          {tabla(negras, 'La lista negra está vacía: hoy no se descarta a nadie por delatarse.')}
        </Card>

        <Card p={0} className="sbc-fade-in">
          <Group p="lg" pb="xs" gap={9}>
            <ThemeIcon size={28} radius="md" variant="light" color="teal"><IconCheck size={15} /></ThemeIcon>
            <Text fw={700}>Lista blanca</Text>
            <Badge size="sm" variant="light" color="teal">{blancas.length}</Badge>
          </Group>
          {tabla(blancas, 'Nadie tiene pase libre. Está bien: la lista blanca es la excepción, no la norma.')}
        </Card>
      </SimpleGrid>
    </Stack>
  );
}

/* ── SOC — el centro de operaciones de seguridad del borde ─────────────────── */
const sevColor = (sv) => ({ crit: 'red', warn: 'orange', info: 'sbc' }[sv] || 'gray');
const ccFlag = (cc) => (cc && cc.length === 2) ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '';

/* Bandera como IMAGEN (flagcdn) y no emoji: Windows/Chrome no tiene glifos de banderas
   y el emoji se ve como el código de país (US, CA…). La imagen se ve en todos lados. */
function Flag({ cc, size = 20 }) {
  const c = (cc || '').toLowerCase();
  const w = size, h = Math.round(size * 0.72);
  const box = { width: w, height: h, minWidth: w, flex: `0 0 ${w}px`, borderRadius: 3, display: 'inline-block', verticalAlign: 'middle' };
  if (!/^[a-z]{2}$/.test(c)) return <span style={{ ...box, background: 'var(--mantine-color-gray-2)' }} />;
  return (
    <img src={`https://flagcdn.com/${c}.svg`} alt={cc} width={w} height={h}
      style={{ ...box, objectFit: 'cover', boxShadow: '0 0 0 1px rgba(0,0,0,.12)' }}
      onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
  );
}

/* Motivo de la penalización: cada tipo de detección con su ícono, color y una
   explicación simple en tooltip. Clasifica por palabras clave del `reason`. */
const MOTIVOS = [
  { re: /flood|anti-?flood|pike|rate|too many/i,        key: 'flood',     color: 'red',    Icon: IconWaveSine,  label: 'Flood / abuso de tráfico', desc: 'Mandó muchísimos mensajes en poco tiempo (inundación). El anti-flood lo frenó para proteger la central.' },
  { re: /scan|secfilter|friendly|sipvicious|sipcli|vicious|sql|inject/i, key: 'secfilter', color: 'orange', Icon: IconRadar2, label: 'Escáner / sonda maliciosa', desc: 'Herramienta de escaneo buscando extensiones o agujeros (tipo sipvicious). Se bloqueó por firma.' },
  { re: /auth|password|cred|nonce|401|407/i,            key: 'auth',      color: 'yellow', Icon: IconKey,       label: 'Auth fallida', desc: 'Intentó autenticarse repetidas veces con credenciales inválidas (fuerza bruta).' },
  { re: /fraud|toll|premium|caro/i,                     key: 'fraude',    color: 'grape',  Icon: IconPhoneOff,  label: 'Sospecha de fraude', desc: 'Patrón de llamada asociado a fraude telefónico / destinos premium.' },
  { re: /geo|país|country|país bloqueado/i,             key: 'geo',       color: 'blue',   Icon: IconWorld,     label: 'País bloqueado', desc: 'La IP viene de un país que tenés vetado en el bloqueo por país.' },
  { re: /403|forbidden|reject|rechaz|not allowed/i,     key: 'rechazo',   color: 'blue',   Icon: IconHandStop,  label: 'Rechazado', desc: 'La política del borde rechazó el pedido (403 / no permitido).' },
];
function motivoInfo(reason) {
  const r = String(reason || '');
  for (const m of MOTIVOS) if (m.re.test(r)) return m;
  return { key: 'ban', color: 'gray', Icon: IconBan, label: 'Bloqueo manual / genérico', desc: 'IP en la lista de bloqueo del borde.' };
}
function Motivo({ reason }) {
  const m = motivoInfo(reason);
  const Ic = m.Icon;
  return (
    <Tooltip multiline w={240} withArrow position="top" color="dark"
      label={<div><Text fw={700} size="xs">{m.label}</Text><Text size="11px" mt={2} style={{ opacity: .85 }}>{m.desc}</Text></div>}>
      <Group gap={7} wrap="nowrap" style={{ cursor: 'help' }}>
        <ThemeIcon size={24} radius="md" variant="light" color={m.color}><Ic size={14} /></ThemeIcon>
        <Text fz="xs" c="dimmed" truncate maw={110}>{reason || m.label}</Text>
      </Group>
    </Tooltip>
  );
}

/* ISP: nombre del proveedor como link (ficha de la IP) + logo del proveedor.
   El logo sale del favicon del dominio conocido; si no lo conocemos, un ícono. */
const ISP_DOM = {
  ovh: 'ovh.com', softlayer: 'softlayer.com', digitalocean: 'digitalocean.com', amazon: 'aws.amazon.com',
  aws: 'aws.amazon.com', google: 'google.com', microsoft: 'azure.microsoft.com', azure: 'azure.microsoft.com',
  hetzner: 'hetzner.com', leaseweb: 'leaseweb.com', contabo: 'contabo.com', linode: 'linode.com',
  akamai: 'akamai.com', vultr: 'vultr.com', cloudflare: 'cloudflare.com', 'm247': 'm247.com', psychz: 'psychz.net',
  routerhosting: 'routerhosting.com', cloudzy: 'cloudzy.com', frantech: 'frantech.ca', buyvm: 'frantech.ca',
  oneprovider: 'oneprovider.com', hostinger: 'hostinger.com', godaddy: 'godaddy.com', namecheap: 'namecheap.com',
  scaleway: 'scaleway.com', online: 'scaleway.com', gcore: 'gcore.com', ' choopa': 'choopa.com', choopa: 'choopa.com',
  'digital ocean': 'digitalocean.com', tencent: 'tencentcloud.com', alibaba: 'alibabacloud.com', huawei: 'huaweicloud.com',
  telefonica: 'telefonica.com', antel: 'antel.com.uy', movistar: 'movistar.com.uy', claro: 'claro.com.uy',
  comcast: 'comcast.com', verizon: 'verizon.com', 'at&t': 'att.com', 'level 3': 'lumen.com', lumen: 'lumen.com',
};
function ispDom(name) {
  const s = ` ${String(name || '').toLowerCase()} `;
  for (const k in ISP_DOM) if (s.includes(k)) return ISP_DOM[k];
  return null;
}
function ISP({ name, ip }) {
  if (!name) return <Text fz="xs" c="dimmed">—</Text>;
  const dom = ispDom(name);
  const href = ip ? `https://ipinfo.io/${ip}` : null;
  const logo = dom
    ? <img src={`https://www.google.com/s2/favicons?domain=${dom}&sz=32`} alt="" width={16} height={16}
        style={{ borderRadius: 3, flex: '0 0 16px' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
    : <ThemeIcon size={18} radius="sm" variant="light" color="gray"><IconServer2 size={11} /></ThemeIcon>;
  const inner = (
    <Group gap={6} wrap="nowrap">
      {logo}
      <Text fz="xs" truncate maw={150}>{name}</Text>
      {href && <IconExternalLink size={11} style={{ opacity: .5, flex: '0 0 11px' }} />}
    </Group>
  );
  if (!href) return inner;
  return (
    <Tooltip label={`Ver ficha de ${ip} en ipinfo.io`} withArrow position="top">
      <Anchor href={href} target="_blank" rel="noopener noreferrer" underline="hover" c="inherit">{inner}</Anchor>
    </Tooltip>
  );
}

function KpiSoc({ label, value, color, icon }) {
  return (
    <Card p="md" radius="lg" className="sbc-fade-in" style={{
      position: 'relative', overflow: 'hidden',
      borderTop: `3px solid var(--mantine-color-${color}-5)`,
      background: `linear-gradient(140deg, var(--mantine-color-${color}-light), transparent 80%)`,
    }}>
      <style jsx global>{`
        @keyframes kpiFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        .kpi-ic { animation: kpiFloat 3.2s ease-in-out infinite; }
      `}</style>
      <span style={{ position: 'absolute', top: -16, right: -16, width: 64, height: 64, borderRadius: '50%',
                     background: `var(--mantine-color-${color}-light)`, opacity: .55, filter: 'blur(7px)' }} />
      <Group justify="space-between" wrap="nowrap" align="flex-start" style={{ position: 'relative' }}>
        <div>
          <Text fw={800} fz={30} lh={1} c={`${color}.7`}><Slot value={value} /></Text>
          <Text size="10.5px" fw={700} tt="uppercase" c="dimmed" mt={5} style={{ letterSpacing: '.04em' }}>{label}</Text>
        </div>
        <ThemeIcon size={44} radius="xl" variant="light" color={color} className="kpi-ic">{icon}</ThemeIcon>
      </Group>
    </Card>
  );
}

function SOC({ data, recargar }) {
  const [q, setQ] = useState('');
  const [ban, setBan] = useState(null);   // objetivo de baneo: {tipo:'ip'|'pais', ...}
  const [enviando, setEnviando] = useState(false);
  if (!data) return <SkelFilas filas={8} />;

  const bloqueos = (data.bloqueos || []).filter((b) =>
    !q || `${b.ip} ${b.country || ''} ${b.isp || ''}`.toLowerCase().includes(q.toLowerCase()));
  const maxPais = Math.max(1, ...(data.top_paises || []).map((p) => p.n));

  const desbloquear = (ip) => toastPromise(
    api('/security/unblock', { method: 'POST', body: { ip } }).then(recargar),
    { loading: `Soltando ${ip}…`, success: `${ip} desbloqueada`, error: 'No se pudo desbloquear' });

  const confirmarBan = async () => {
    if (!ban) return;
    setEnviando(true);
    try {
      if (ban.tipo === 'ip') {
        await toastPromise(
          api('/security/block', { method: 'POST', body: { ip: ban.ip, cc: ban.cc, country: ban.country, isp: ban.isp, reason: 'baneo manual (desde SOC)' } }).then(recargar),
          { loading: `Baneando ${ban.ip}…`, success: `${ban.ip} bloqueada en el borde`, error: 'No se pudo banear' });
      } else {
        await toastPromise(
          api('/security/geoblock/add', { method: 'POST', body: { cc: ban.cc, nombre: ban.country } }).then(recargar),
          { loading: `Bloqueando ${ban.country}…`, success: `${ban.country} agregado al geo-bloqueo`, error: 'No se pudo bloquear el país' });
      }
      setBan(null);
    } finally { setEnviando(false); }
  };

  const evLabel = (kind) => ({ bloqueo: 'Bloqueo', ataque: 'Ataque', mitigacion: 'Mitigación', motor: 'Motor', red: 'Red' }[kind] || kind);

  return (
    <Stack gap="lg">
      {/* 3 columnas: De dónde vienen · Línea de tiempo (en el medio) · Los más insistentes */}
      <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="lg">
        {/* Top países con banderas + banear país */}
        <Card p="lg" className="sbc-fade-in">
          <Group gap={9} mb="md">
            <ThemeIcon size={30} radius="md" variant="light" color="grape"><IconMapPin size={17} /></ThemeIcon>
            <Text fw={700}>De dónde vienen los ataques</Text>
          </Group>
          {(data.top_paises || []).length === 0
            ? <Text size="sm" c="dimmed" ta="center" py="md">Sin bloqueos todavía. Bien: nadie insistió lo suficiente.</Text>
            : (
              <Stack gap="sm" mah={330} style={{ overflowY: 'auto', paddingRight: 6 }}>
                {(data.top_paises || []).map((p) => (
                  <div key={p.pais}>
                    <Group justify="space-between" mb={3} wrap="nowrap">
                      <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}><Flag cc={p.cc} size={20} /><Text size="sm" fw={600} truncate>{p.pais}</Text></Group>
                      <Group gap={4} wrap="nowrap">
                        <Badge size="sm" variant="light" color="red">{p.n}</Badge>
                        <Tooltip label={`Bloquear todo ${p.pais}`}>
                          <ActionIcon size="sm" variant="subtle" color="red" onClick={() => setBan({ tipo: 'pais', cc: p.cc, country: p.pais })}><IconBan size={15} /></ActionIcon>
                        </Tooltip>
                      </Group>
                    </Group>
                    <Progress value={(p.n / maxPais) * 100} color="red" size="sm" radius="xl" />
                  </div>
                ))}
              </Stack>
            )}
        </Card>

        {/* Línea de tiempo de seguridad (columna del medio) */}
        <Card p="lg" className="sbc-fade-in">
          <Group gap={9} mb="md">
            <ThemeIcon size={30} radius="md" variant="light" color="sbc"><IconActivity size={17} /></ThemeIcon>
            <Text fw={700}>Línea de tiempo de seguridad</Text>
          </Group>
          {(data.eventos || []).length === 0
            ? <Text size="sm" c="dimmed" ta="center" py="md">Sin eventos de seguridad todavía.</Text>
            : (
              <Box mah={340} style={{ overflowY: 'auto' }}>
              <Timeline active={-1} bulletSize={18} lineWidth={2}>
                {(data.eventos || []).slice(0, 40).map((e) => {
                  const d = e.detail || {};
                  return (
                    <Timeline.Item key={e.id}
                      bullet={<span style={{ width: 8, height: 8, borderRadius: 999, background: `var(--mantine-color-${sevColor(e.severity)}-6)`, display: 'block' }} />}
                      title={<Group gap={6}><Badge size="xs" variant="light" color={sevColor(e.severity)}>{evLabel(e.kind)}</Badge>
                              {d.cc && <Flag cc={d.cc} size={16} />}
                              {d.ip && <Text span ff="monospace" size="xs">{d.ip}</Text>}
                              {d.pais && <Text span size="xs" c="dimmed">{d.pais}</Text>}</Group>}>
                      <Text size="xs" c="dimmed">
                        {d.motivo || d.msg || d.detail || (typeof e.detail === 'string' ? e.detail : '')}
                      </Text>
                      <Text size="10px" c="dimmed" mt={2}>{new Date(e.created_at).toLocaleString('es-UY')}</Text>
                    </Timeline.Item>
                  );
                })}
              </Timeline>
            </Box>
            )}
        </Card>

        {/* Top atacantes + banear IP (tercera columna) */}
        <Card p="lg" className="sbc-fade-in">
          <Group gap={9} mb="md">
            <ThemeIcon size={30} radius="md" variant="light" color="red"><IconFlame size={17} /></ThemeIcon>
            <Text fw={700}>Los más insistentes</Text>
            <Text size="xs" c="dimmed">ordenados por golpes</Text>
          </Group>
          {(data.top_atacantes || []).length === 0
            ? <Text size="sm" c="dimmed" ta="center" py="md">Nadie golpeando ahora mismo.</Text>
            : (
              <Box mah={330} style={{ overflowY: 'auto' }}>
              <Table verticalSpacing="xs" fz="sm">
                <Table.Tbody>
                  {(data.top_atacantes || []).map((b) => (
                    <Table.Tr key={b.ip}>
                      <Table.Td w={28}><Flag cc={b.cc} size={20} /></Table.Td>
                      <Table.Td ff="monospace" fw={650}>{b.ip}</Table.Td>
                      <Table.Td><Badge size="sm" variant="light" color="orange">{b.hits}</Badge></Table.Td>
                      <Table.Td w={40}>
                        <Tooltip label={`Banear ${b.ip}`}>
                          <ActionIcon size="sm" variant="subtle" color="red"
                            onClick={() => setBan({ tipo: 'ip', ip: b.ip, cc: b.cc, country: b.country, isp: b.isp })}><IconBan size={15} /></ActionIcon>
                        </Tooltip>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              </Box>
            )}
        </Card>
      </SimpleGrid>

      {/* Bloqueos activos */}
      <Card p={0} className="sbc-fade-in">
        <Group p="lg" pb="sm" justify="space-between">
          <Group gap={9}>
            <ThemeIcon size={30} radius="md" variant="light" color="red"><IconBan size={17} /></ThemeIcon>
            <Text fw={700}>Bloqueos activos</Text>
            <Badge size="sm" variant="light" color="gray">{bloqueos.length}</Badge>
          </Group>
          <TextInput size="xs" placeholder="Buscar IP, país o ISP…" leftSection={<IconSearch size={14} />}
                     value={q} onChange={(e) => setQ(e.currentTarget.value)} w={240} />
        </Group>
        <Table highlightOnHover verticalSpacing="sm" fz="sm" stickyHeader>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={40} /><Table.Th>IP</Table.Th><Table.Th>País</Table.Th>
              <Table.Th>ISP</Table.Th><Table.Th>Motivo</Table.Th><Table.Th>Golpes</Table.Th>
              <Table.Th>Bloqueada</Table.Th><Table.Th w={50} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {bloqueos.map((b) => (
              <Table.Tr key={b.ip}>
                <Table.Td><Flag cc={b.cc} size={20} /></Table.Td>
                <Table.Td ff="monospace" fw={650}>{b.ip}</Table.Td>
                <Table.Td fz="xs">{b.country || '—'}</Table.Td>
                <Table.Td><ISP name={b.isp} ip={b.ip} /></Table.Td>
                <Table.Td><Motivo reason={b.reason} /></Table.Td>
                <Table.Td><Badge size="sm" variant="light" color={b.hits > 3 ? 'red' : 'orange'}>{b.hits || 1}</Badge></Table.Td>
                <Table.Td fz="xs" c="dimmed">{b.blocked_at ? new Date(b.blocked_at).toLocaleString('es-UY') : '—'}</Table.Td>
                <Table.Td>
                  <Tooltip label="Desbloquear (soltar del ipban)">
                    <ActionIcon variant="subtle" color="teal" onClick={() => desbloquear(b.ip)}><IconLockOff size={16} /></ActionIcon>
                  </Tooltip>
                </Table.Td>
              </Table.Tr>
            ))}
            {bloqueos.length === 0 && (
              <Table.Tr><Table.Td colSpan={8}>
                <Stack align="center" py="xl" gap={6}>
                  <ThemeIcon size={44} radius="xl" variant="light" color="teal"><IconShieldCheck size={22} /></ThemeIcon>
                  <Text fw={600}>Ninguna IP bloqueada</Text>
                  <Text size="sm" c="dimmed">El borde está tranquilo. Cuando alguien insista, va a aparecer acá con su bandera.</Text>
                </Stack>
              </Table.Td></Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Card>

      {/* Modal de confirmación de baneo (IP o país entero) */}
      <Modal opened={!!ban} onClose={() => !enviando && setBan(null)} centered radius="lg" size="md"
        withCloseButton={false} overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}>
        {ban && (
          <Stack gap="md" p="xs">
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon size={52} radius="xl" variant="light" color="red">
                {ban.tipo === 'ip' ? <IconBan size={26} /> : <IconWorld size={26} />}
              </ThemeIcon>
              <div>
                <Text fw={800} fz="lg">{ban.tipo === 'ip' ? 'Banear esta IP' : 'Bloquear el país entero'}</Text>
                <Text size="sm" c="dimmed">
                  {ban.tipo === 'ip'
                    ? 'La IP entra al ipban del borde y Kamailio la rechaza de inmediato.'
                    : 'Todo el tráfico originado en ese país será rechazado (geo-bloqueo).'}
                </Text>
              </div>
            </Group>

            <Card withBorder radius="md" p="md" bg="light-dark(var(--mantine-color-gray-0),var(--mantine-color-dark-6))">
              <Group gap="sm" wrap="nowrap">
                <Flag cc={ban.cc} size={26} />
                {ban.tipo === 'ip'
                  ? <div style={{ minWidth: 0 }}>
                      <Text ff="monospace" fw={700}>{ban.ip}</Text>
                      <Text size="xs" c="dimmed" truncate>{ban.country || '—'}{ban.isp ? ` · ${ban.isp}` : ''}</Text>
                    </div>
                  : <div><Text fw={700}>{ban.country}</Text><Text size="xs" c="dimmed">código {ban.cc}</Text></div>}
              </Group>
            </Card>

            {ban.tipo === 'pais' && (
              <Alert color="orange" variant="light" p="xs" icon={<IconAlertTriangle size={16} />}>
                Requiere el módulo <b>geoip2</b> activo. Se recarga el motor (con validación y rollback).
              </Alert>
            )}

            <Group justify="flex-end" gap="sm" mt="xs">
              <Button variant="default" onClick={() => setBan(null)} disabled={enviando}>Cancelar</Button>
              <Button color="red" leftSection={<IconBan size={16} />} loading={enviando} onClick={confirmarBan}>
                {ban.tipo === 'ip' ? 'Banear IP' : 'Bloquear país'}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}

/* ── Bloqueo por país (geoip2): rechaza el SIP de países enteros en el borde ── */
const PAISES = [
  ['CN', 'China'], ['RU', 'Rusia'], ['IN', 'India'], ['US', 'Estados Unidos'], ['BR', 'Brasil'],
  ['DE', 'Alemania'], ['NL', 'Países Bajos'], ['GB', 'Reino Unido'], ['FR', 'Francia'], ['UA', 'Ucrania'],
  ['TR', 'Turquía'], ['VN', 'Vietnam'], ['ID', 'Indonesia'], ['IR', 'Irán'], ['PK', 'Pakistán'],
  ['RO', 'Rumania'], ['PL', 'Polonia'], ['KR', 'Corea del Sur'], ['JP', 'Japón'], ['CA', 'Canadá'],
  ['MX', 'México'], ['AR', 'Argentina'], ['CL', 'Chile'], ['CO', 'Colombia'], ['PE', 'Perú'],
  ['ES', 'España'], ['IT', 'Italia'], ['PT', 'Portugal'], ['SE', 'Suecia'], ['CH', 'Suiza'],
  ['SG', 'Singapur'], ['HK', 'Hong Kong'], ['TW', 'Taiwán'], ['TH', 'Tailandia'], ['MY', 'Malasia'],
  ['PH', 'Filipinas'], ['ZA', 'Sudáfrica'], ['NG', 'Nigeria'], ['EG', 'Egipto'], ['MA', 'Marruecos'],
  ['SA', 'Arabia Saudita'], ['AE', 'Emiratos Árabes'], ['IL', 'Israel'], ['AU', 'Australia'], ['NZ', 'Nueva Zelanda'],
  ['BG', 'Bulgaria'], ['CZ', 'Chequia'], ['HU', 'Hungría'], ['GR', 'Grecia'], ['RS', 'Serbia'],
  ['MD', 'Moldavia'], ['BY', 'Bielorrusia'], ['KZ', 'Kazajistán'], ['LT', 'Lituania'], ['LV', 'Letonia'],
  ['UY', 'Uruguay'], ['PY', 'Paraguay'], ['BO', 'Bolivia'], ['EC', 'Ecuador'], ['VE', 'Venezuela'],
];
const PMAP = Object.fromEntries(PAISES);

function GeoBlock() {
  const { data, cargando, recargar } = usePoll('/security/geoblock', 0);
  const [sel, setSel] = useState(null);
  const [modo, setModo] = useState(null);   // 'block' | 'allow'
  useEffect(() => { if (data && sel === null) setSel((data.paises || []).map((p) => p.cc)); }, [data]);
  useEffect(() => { if (data && modo === null) setModo(data.modo || 'block'); }, [data]);
  const geoOn = !!(data && data.geoip);
  const modoEff = modo || 'block';
  const allow = modoEff === 'allow';
  const guardarYAplicar = () => {
    const paises = (sel || []).map((cc) => ({ cc, nombre: PMAP[cc] || '' }));
    api('/security/geoblock', { method: 'PUT', body: { paises, modo: modoEff } })
      .then(() => api('/security/geoblock/apply', { method: 'POST' }))
      .then((r) => { toast(r && r.error ? r.error : 'Filtro por país aplicado', r && r.error ? 'bad' : 'ok'); recargar(); })
      .catch(() => toast('No se pudo aplicar el filtro por país', 'bad'));
  };
  return (
    <Card p="lg" className="sbc-fade-in">
      <Group gap={9} mb="sm">
        <ThemeIcon size={30} radius="md" variant="light" color="sbc"><IconWorld size={17} /></ThemeIcon>
        <div><Text fw={700}>Filtro por país</Text><Text size="xs" c="dimmed">Decidí qué países pueden hablar SIP con el borde, antes de tocar la central (geoip2).</Text></div>
      </Group>
      {!geoOn && (
        <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />} mb="md">
          El módulo <b>geoip2</b> está apagado. Activalo en <b>Motor SIP → Módulos</b> para que el filtro por país tenga efecto.
        </Alert>
      )}
      {cargando && !data ? <Skeleton height={140} radius="md" /> : (
        <>
          <SegmentedControl fullWidth mb="md" value={modoEff} onChange={setModo}
            data={[
              { value: 'block', label: 'Lista negra — bloquear estos países' },
              { value: 'allow', label: 'Lista blanca — permitir solo estos' },
            ]} />
          <Alert color={allow ? 'teal' : 'red'} variant="light" mb="md" p="xs" icon={<IconInfoCircle size={15} />}>
            {allow
              ? <>Solo entra el SIP de los países de la lista. <b>Todo el resto se rechaza</b> (403). Los que geoip no puede ubicar se dejan pasar para no bloquear por error.</>
              : <>Se rechaza (403) el SIP de los países de la lista y su IP cae en la lista negra con su bandera en el Centro de operaciones.</>}
          </Alert>
          <Select
            label={allow ? 'Agregar país permitido' : 'Agregar país a bloquear'}
            placeholder="Buscá un país…"
            searchable clearable maxDropdownHeight={300}
            data={PAISES.filter(([cc]) => !(sel || []).includes(cc)).map(([cc, n]) => ({ value: cc, label: n }))}
            renderOption={({ option }) => <Group gap={8} wrap="nowrap"><Flag cc={option.value} size={18} /><span>{option.label}</span></Group>}
            value={null}
            onChange={(cc) => { if (cc) setSel([...(sel || []), cc]); }}
          />
          <Group mt="md" gap="xs">
            {(sel || []).length === 0
              ? <Text size="sm" c="dimmed">{allow ? 'Ningún país permitido todavía (lista blanca vacía = nadie filtrado).' : 'Ningún país bloqueado.'}</Text>
              : (sel || []).map((cc) => (
                <Badge key={cc} size="lg" variant="light" color={allow ? 'teal' : 'red'} pl={5}
                  leftSection={<Flag cc={cc} size={15} />}
                  rightSection={<ActionIcon size="xs" variant="transparent" color={allow ? 'teal' : 'red'} onClick={() => setSel((sel || []).filter((x) => x !== cc))}><IconTrash size={12} /></ActionIcon>}>
                  {PMAP[cc] || cc}
                </Badge>
              ))}
          </Group>
          <Group justify="flex-end" mt="lg">
            <Button leftSection={<IconDeviceFloppy size={16} />} onClick={guardarYAplicar} color={allow ? 'teal' : undefined}>Guardar y aplicar</Button>
          </Group>
        </>
      )}
    </Card>
  );
}

/* Alarma "bajo ataque": aparece cuando el ritmo de eventos de seguridad en el último
   minuto pasa el umbral (lo calcula el backend en /soc). Roja, pulsante, con el ritmo,
   cuántas IPs y el que más golpea. Las defensas ya están actuando; esto es el aviso. */
function AtaqueBanner({ a }) {
  return (
    <Card p="md" radius="md" className="atk-banner" style={{
      background: 'linear-gradient(100deg, rgba(240,68,56,.16), rgba(240,68,56,.06))',
      border: '1px solid var(--mantine-color-red-5)', overflow: 'hidden', position: 'relative' }}>
      <style jsx global>{`
        @keyframes atkPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(240,68,56,.45); } 50% { box-shadow: 0 0 0 6px rgba(240,68,56,0); } }
        @keyframes atkBlink { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
        .atk-banner { animation: atkPulse 1.6s ease-in-out infinite; }
        .atk-ic { animation: atkBlink 1s ease-in-out infinite; }
      `}</style>
      <Group justify="space-between" wrap="nowrap">
        <Group gap="md" wrap="nowrap">
          <ThemeIcon size={46} radius="xl" color="red" variant="filled" className="atk-ic"><IconAlertTriangle size={26} /></ThemeIcon>
          <div>
            <Group gap={8}>
              <Text fw={900} fz="lg" c="red.7" style={{ letterSpacing: .4 }}>BAJO ATAQUE</Text>
              <Badge color="red" variant="filled" size="sm">EN VIVO</Badge>
            </Group>
            <Text size="sm" c="dimmed">
              El borde está recibiendo un flujo anómalo: <b>{a.golpes_min}</b> eventos/min{a.ips > 0 ? <> desde <b>{a.ips}</b> IP{a.ips === 1 ? '' : 's'}</> : ''}.
              Las mitigaciones (anti-flood + ipban) están actuando.
            </Text>
          </div>
        </Group>
        {a.top_ip && (
          <Card p="xs" radius="md" withBorder bg="light-dark(var(--mantine-color-red-0),rgba(240,68,56,.08))" style={{ flexShrink: 0 }}>
            <Text size="10px" c="dimmed" tt="uppercase" fw={700}>El que más golpea</Text>
            <Text ff="monospace" fw={700} c="red.7">{a.top_ip}</Text>
            <Text size="10px" c="dimmed">{a.top_ip_golpes} golpe(s) en 60 s</Text>
          </Card>
        )}
      </Group>
    </Card>
  );
}

export default function Seguridad() {
  const { data, recargar } = usePoll('/soc', 8000);
  const k = (data && data.kpis) || {};
  // Vivo por socket.io: cuando el borde canta un evento, refrescamos el SOC (KPIs, mapa,
  // listas) con un pequeño debounce — así se ve al instante sin geolocalizar por evento.
  const recRef = useRef(recargar); recRef.current = recargar;
  useEffect(() => {
    let token = ''; try { token = localStorage.getItem('sbcng_jwt') || ''; } catch (_) {}
    const s = io({ path: '/backend/api/v1/rt', transports: ['polling'], auth: { token }, addTrailingSlash: false, reconnection: true, reconnectionDelay: 3000 });
    let t = null;
    s.on('ev', () => { if (!t) t = setTimeout(() => { t = null; if (recRef.current) recRef.current(); }, 1500); });
    return () => { if (t) clearTimeout(t); s.close(); };
  }, []);
  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconShieldCheck size={24} />}
        title="Seguridad · SOC"
        subtitle="Quién intentó entrar, desde dónde, y qué lo frenó"
      />
      {data && data.ataque && data.ataque.activo && <AtaqueBanner a={data.ataque} />}
      {/* Registro en vivo (izquierda) + KPIs del SOC en columna (derecha) */}
      {/* Registro en vivo (izquierda) + mapa de ataques en vivo (derecha) */}
      <Grid gutter="lg" align="stretch">
        <Grid.Col span={{ base: 12, lg: 8 }}><LiveLog /></Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}><AttackMap paises={(data && data.top_paises) || []} kpis={k} /></Grid.Col>
      </Grid>
      <Tabs defaultValue="soc" variant="pills" radius="md" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="soc" leftSection={<IconShieldX size={15} />}>Centro de operaciones</Tabs.Tab>
          <Tabs.Tab value="ajustes" leftSection={<IconAdjustments size={15} />}>Ajustes del borde</Tabs.Tab>
          <Tabs.Tab value="listas" leftSection={<IconList size={15} />}>Listas negras/blancas</Tabs.Tab>
          <Tabs.Tab value="geo" leftSection={<IconWorld size={15} />}>Filtro por país</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="soc"><SOC data={data} recargar={recargar} /></Tabs.Panel>
        <Tabs.Panel value="ajustes"><Ajustes /></Tabs.Panel>
        <Tabs.Panel value="listas"><Listas /></Tabs.Panel>
        <Tabs.Panel value="geo"><GeoBlock /></Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
