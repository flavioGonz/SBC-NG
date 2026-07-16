'use client';
/* ============================================================================
 *  Analizador SIP en vivo — la escalera del diálogo.
 *
 *  Un pcap es para el que ya sabe. Esto es para el que está tratando de entender:
 *  cada mensaje que cruzó el borde, agrupado por llamada, con la escalera dibujada
 *  y cada paso explicado en castellano. Es lo que en PBX-NG ya nos sacó de más de
 *  una discusión con un operador, y es lo que el SBC tenía que heredar.
 *
 *  El sniffer corre en el control-plane (NET_RAW, netns del host): ve las IPs de
 *  verdad, no la NAT de docker. Es un anillo de 5.000 mensajes — no llena el disco.
 * ==========================================================================*/
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Card, Group, Text, Badge, Stack, Button, TextInput, Switch, ScrollArea, ActionIcon,
  Tooltip, Code, SegmentedControl, Box, Table, Drawer, Anchor, ThemeIcon, Alert,
} from '@mantine/core';
import {
  IconInfoCircle, IconRefresh, IconPlayerPlay, IconPlayerPause, IconPhoneCall, IconPhoneOff,
  IconPhonePlus, IconCircleCheck, IconCircleX, IconArrowsExchange, IconClock, IconBell,
  IconUserCheck, IconHeartbeat, IconCheck, IconArrowRight, IconDownload, IconTrash, IconSearch,
  IconWaveSine, IconAlertTriangle,
} from '@tabler/icons-react';
import { api, usePoll } from './api';
import { toast } from './notify';
import { SkelFilas } from './Skel';

/* ── el diccionario: qué es cada mensaje, en castellano ─────────────────── */

const METODO_DESC = {
  INVITE: 'Abre o modifica una llamada: acá se negocian los medios y los códecs.',
  ACK: 'Confirma que llegó la respuesta final (el 200 OK) del INVITE.',
  BYE: 'Corta una llamada que ya estaba establecida.',
  CANCEL: 'Cancela un INVITE que todavía no tuvo respuesta final: cortaron antes de que atiendan.',
  REGISTER: 'El teléfono publica dónde está. Si esto falla, no entra ninguna llamada.',
  OPTIONS: 'Latido: "¿seguís vivo?". Es el qualify.',
  SUBSCRIBE: 'Se suscribe a eventos: BLF, presencia, buzón.',
  NOTIFY: 'Avisa de un evento a quien se suscribió.',
  INFO: 'Información en medio de la llamada (típico: dígitos DTMF).',
  PRACK: 'Confirma una respuesta provisional fiable (100rel).',
  UPDATE: 'Cambia la sesión sin mandar otro INVITE.',
  MESSAGE: 'Mensajería SIP.',
  REFER: 'Pide una transferencia.',
  PUBLISH: 'Publica estado de presencia.',
};

const RAZON = {
  100: 'Trying', 180: 'Ringing', 181: 'Being Forwarded', 182: 'Queued', 183: 'Session Progress',
  200: 'OK', 202: 'Accepted', 300: 'Multiple Choices', 301: 'Moved Permanently', 302: 'Moved Temporarily',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed',
  407: 'Proxy Auth Required', 408: 'Request Timeout', 415: 'Unsupported Media', 420: 'Bad Extension',
  423: 'Interval Too Brief', 480: 'Temporarily Unavailable', 481: 'Call Does Not Exist', 482: 'Loop Detected',
  483: 'Too Many Hops', 484: 'Address Incomplete', 486: 'Busy Here', 487: 'Request Terminated',
  488: 'Not Acceptable Here', 491: 'Request Pending', 500: 'Server Error', 501: 'Not Implemented',
  502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Server Timeout', 603: 'Decline',
};

/* Las pistas que uno querría que le susurraran a las 3 de la mañana. */
const PISTA = {
  401: 'El servidor pide credenciales; el teléfono reintenta con ellas. Un 401 suelto es NORMAL.',
  407: 'Igual que el 401, pero lo pide un proxy.',
  403: 'Lo rechazaron: credenciales o identidad. Mirá el From y el usuario.',
  404: 'El número marcado no existe del otro lado. Suele ser un tema de prefijo: revisá las reglas de normalización.',
  408: 'Nadie contestó a tiempo. Si es hacia el operador, puede ser firewall: el SIP sale pero no vuelve.',
  480: 'Está registrado pero no disponible.',
  486: 'Ocupado.',
  487: 'El INVITE se canceló (llegó un CANCEL). Cortaron antes de que atiendan.',
  488: 'No hay códecs en común. Casi siempre se arregla habilitando el códec en la troncal o transcodificando.',
  503: 'El otro lado no está o está saturado.',
  481: 'El diálogo ya no existe: llegó tarde, o alguien reintentó sobre una llamada muerta.',
};

const familia = (c) => (c < 200 ? 'Provisional: lo recibió, está en camino.'
  : c < 300 ? 'Éxito.'
  : c < 400 ? 'Redirección: probá en otro lado.'
  : c < 500 ? 'Error del cliente.'
  : c < 600 ? 'Error del servidor.' : 'Fallo global.');

const descEstado = (c) => `${c} ${RAZON[c] || ''}`.trim() + ' — ' + familia(c) + (PISTA[c] ? ' ' + PISTA[c] : '');
const descripcion = (m) => (m.method ? (METODO_DESC[m.method] || 'Mensaje SIP.') : descEstado(m.status));
const rotulo = (m) => (m.method ? m.method : `${m.status || ''} ${RAZON[m.status] || ''}`.trim());

const color = (m) => {
  if (m.status) return m.status < 200 ? 'yellow' : m.status < 300 ? 'teal' : m.status < 400 ? 'cyan' : 'red';
  if (['INVITE', 'REGISTER', 'SUBSCRIBE', 'PUBLISH', 'REFER'].includes(m.method)) return 'sbc';
  if (['BYE', 'CANCEL'].includes(m.method)) return 'grape';
  return 'gray';
};

function Icono({ m, size = 13 }) {
  let I = IconArrowRight;
  if (m.status) I = m.status < 200 ? IconClock : m.status < 300 ? IconCircleCheck : m.status < 400 ? IconArrowsExchange : IconCircleX;
  else if (m.method === 'INVITE') I = IconPhonePlus;
  else if (m.method === 'BYE' || m.method === 'CANCEL') I = IconPhoneOff;
  else if (m.method === 'ACK') I = IconCheck;
  else if (m.method === 'REGISTER') I = IconUserCheck;
  else if (m.method === 'OPTIONS') I = IconHeartbeat;
  else if (m.method === 'SUBSCRIBE' || m.method === 'NOTIFY') I = IconBell;
  else I = IconPhoneCall;
  return <I size={size} color={`var(--mantine-color-${color(m)}-6)`} />;
}

const MONO = { fontFamily: 'ui-monospace, monospace' };
const ip = (hp) => (hp || '').split(':')[0];
const usuario = (u) => {
  if (!u) return '?';
  const m = String(u).match(/sips?:([^@>;\s]+)/i);
  return m ? m[1] : String(u).slice(0, 16);
};
const hora = (t) => {
  const d = new Date(t); const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
};

const estadoDialogo = (ms) => {
  const c = ms.filter((m) => m.status).map((m) => m.status);
  if (c.some((x) => x >= 400)) return 'fail';
  if (c.some((x) => x >= 200 && x < 300)) return 'ok';
  if (c.some((x) => x >= 100 && x < 200)) return 'ring';
  return 'info';
};
const ETIQ = { ok: { c: 'teal', t: 'OK' }, fail: { c: 'red', t: 'Error' }, ring: { c: 'yellow', t: 'En curso' }, info: { c: 'gray', t: 'Info' } };

// ¿Se llegó a hablar? INVITE + 200 sobre ese INVITE = hubo audio.
const huboAudio = (ms) => ms.some((m) => m.method === 'INVITE')
  && ms.some((m) => m.status >= 200 && m.status < 300 && /INVITE/i.test(m.cseq || ''));

const MOSTRAR = 300;

/* ── la página ──────────────────────────────────────────────────────────── */

export default function SipLadder() {
  const [msgs, setMsgs] = useState(null);
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState('all');
  const [vivo, setVivo] = useState(true);
  const [seguir, setSeguir] = useState(true);
  const [agrupar, setAgrupar] = useState(true);
  const [abierto, setAbierto] = useState(null);
  const [crudo, setCrudo] = useState(null);

  const { data: estado, recargar: recargarEstado } = usePoll('/sip/state', 6000);
  const vivoRef = useRef(vivo); vivoRef.current = vivo;
  const vpRef = useRef(null);

  const cargar = async () => {
    try { const d = await api('/sip/messages?limit=500'); if (Array.isArray(d)) setMsgs(d.map((x) => ({ ...x, t: Number(x.t) }))); }
    catch (_) {}
  };
  useEffect(() => { cargar(); }, []);
  useEffect(() => {
    const t = setInterval(() => { if (vivoRef.current && !abierto) cargar(); }, 3000);
    return () => clearInterval(t);
  }, [abierto]);

  const encendido = !!(estado && estado.deseado);

  const filtrados = useMemo(() => {
    let arr = msgs || [];
    if (filtro === 'err') arr = arr.filter((m) => m.status >= 400);
    else if (filtro === 'sig') arr = arr.filter((m) => ['INVITE', 'ACK', 'BYE', 'CANCEL'].includes(m.method) || m.status);
    else if (filtro === 'reg') arr = arr.filter((m) => ['REGISTER', 'OPTIONS', 'SUBSCRIBE'].includes(m.method));
    if (q.trim()) {
      const s = q.toLowerCase();
      arr = arr.filter((m) => `${m.src}${m.dst}${m.callid}${m.method || ''}${m.status || ''}${rotulo(m)}`.toLowerCase().includes(s));
    }
    return arr.length > MOSTRAR ? arr.slice(arr.length - MOSTRAR) : arr;
  }, [msgs, filtro, q]);

  const grupos = useMemo(() => {
    const mapa = new Map();
    for (const m of filtrados) {
      const k = m.callid || ('id' + m.id);
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(m);
    }
    return [...mapa.entries()].map(([callid, ms]) => {
      const pedido = ms.find((x) => x.method) || ms[0];
      return {
        callid, ms, de: usuario(pedido.from_uri), a: usuario(pedido.to_uri),
        estado: estadoDialogo(ms), audio: huboAudio(ms), t0: ms[0].t,
      };
    }).sort((a, b) => b.t0 - a.t0);
  }, [filtrados]);

  useEffect(() => { if (seguir && !agrupar && vpRef.current) vpRef.current.scrollTo({ top: vpRef.current.scrollHeight }); }, [filtrados, seguir, agrupar]);

  const dialogo = useMemo(() => {
    if (!abierto || !msgs) return null;
    const ms = msgs.filter((m) => (m.callid || ('id' + m.id)) === abierto).sort((a, b) => a.id - b.id);
    if (!ms.length) return null;
    const pedido = ms.find((m) => m.method) || ms[0];
    return { callid: abierto, ms, de: usuario(pedido.from_uri), a: usuario(pedido.to_uri), estado: estadoDialogo(ms) };
  }, [abierto, msgs]);

  const verCrudo = async (id) => {
    if (crudo && crudo.id === id) { setCrudo(null); return; }
    setCrudo({ id, texto: 'Cargando…' });
    try { const d = await api('/sip/raw/' + id); setCrudo({ id, texto: d.raw || '(sin contenido)' }); }
    catch (_) { setCrudo({ id, texto: '(no se pudo leer)' }); }
  };

  const alternar = async (on) => {
    try { await api('/sip/toggle', { method: 'POST', body: { on } }); recargarEstado(); toast(on ? 'Analizador encendido' : 'Analizador en pausa', on ? 'ok' : 'info'); }
    catch (e) { toast('No se pudo cambiar', 'bad', { description: e.message }); }
  };

  const limpiar = async () => {
    try { await api('/sip/clear', { method: 'POST' }); setMsgs([]); recargarEstado(); toast('Captura limpiada', 'ok'); }
    catch (e) { toast('No se pudo limpiar', 'bad', { description: e.message }); }
  };

  const exportar = () => {
    const lineas = (msgs || []).map((m) => `${hora(m.t)}  ${m.src} -> ${m.dst}  ${rotulo(m)}  CSeq:${m.cseq || ''}  Call-ID:${m.callid || ''}`);
    const blob = new Blob([`# SBC-NG · captura SIP ${new Date().toISOString()} (${lineas.length} mensajes)\n${lineas.join('\n')}`], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `sbcng-sip-${Date.now()}.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  /* geometría de la escalera */
  const carriles = useMemo(() => {
    if (!dialogo) return [];
    const L = [];
    dialogo.ms.forEach((m) => [ip(m.src), ip(m.dst)].forEach((x) => { if (x && !L.includes(x)) L.push(x); }));
    return L;
  }, [dialogo]);
  const W = Math.max(420, 120 + Math.max(0, carriles.length - 1) * 200);
  const ALTO_FILA = 40, ARRIBA = 64;
  const H = ARRIBA + (dialogo ? dialogo.ms.length : 0) * ALTO_FILA + 24;
  const x0 = (d) => { const i = carriles.indexOf(d); return carriles.length <= 1 ? W / 2 : 70 + i * ((W - 140) / (carriles.length - 1)); };
  const trazo = (m) => ({ yellow: '#f59e0b', teal: '#12b76a', cyan: '#0891b2', red: '#f04438', sbc: '#2f74e6', grape: '#7c3aed', gray: '#64748b' }[color(m)]);

  if (msgs === null) return <SkelFilas filas={8} />;

  return (
    <Stack gap="sm">
      <style>{'.sip-eq{display:inline-flex;gap:1px;align-items:flex-end;height:12px}.sip-eq>span{width:2px;height:4px;background:var(--mantine-color-teal-6);border-radius:1px;animation:sipeq .8s ease-in-out infinite}@keyframes sipeq{0%,100%{height:3px}50%{height:11px}}'}</style>

      <Alert variant="light" color="sbc" radius="lg" icon={<IconInfoCircle size={18} />}>
        Cada fila es un mensaje SIP que <b>realmente cruzó el borde</b>. Hacé click en una llamada y vas a ver la
        escalera del diálogo y qué significa cada paso. Si acá no aparece, no pasó por el SBC — y ese ya es el
        primer dato del diagnóstico.
      </Alert>

      <Group justify="space-between" wrap="wrap" gap="xs">
        <Group gap="xs">
          <Switch checked={encendido} onChange={(e) => alternar(e.currentTarget.checked)} label="Analizador" color="sbc" size="sm" />
          <Tooltip label={vivo ? 'Pausar la vista' : 'Reanudar la vista'}>
            <ActionIcon variant="light" color={vivo ? 'teal' : 'gray'} onClick={() => setVivo((v) => !v)}>
              {vivo ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Refrescar ahora">
            <ActionIcon variant="light" color="sbc" onClick={cargar}><IconRefresh size={16} /></ActionIcon>
          </Tooltip>
          <SegmentedControl size="xs" value={filtro} onChange={setFiltro}
            data={[{ label: 'Todo', value: 'all' }, { label: 'Errores', value: 'err' }, { label: 'Llamadas', value: 'sig' }, { label: 'Registros', value: 'reg' }]} />
        </Group>
        <Group gap="xs">
          <TextInput size="xs" leftSection={<IconSearch size={14} />} placeholder="Filtrar…" value={q} w={180}
                     onChange={(e) => setQ(e.currentTarget.value)} />
          <Switch checked={agrupar} onChange={(e) => setAgrupar(e.currentTarget.checked)} label="Por llamada" size="xs" color="sbc" />
          <Badge variant="light" color="gray">{agrupar ? `${grupos.length} llamadas` : `${filtrados.length} msg`}</Badge>
          <Tooltip label="Bajar la vista como texto">
            <Button size="xs" variant="default" leftSection={<IconDownload size={14} />} onClick={exportar}>TXT</Button>
          </Tooltip>
          <Tooltip label="Borrar todo lo capturado">
            <ActionIcon variant="light" color="red" onClick={limpiar}><IconTrash size={16} /></ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {!encendido && (
        <Alert variant="light" color="orange" radius="md" icon={<IconAlertTriangle size={16} />}>
          El analizador está en pausa: lo que ves es lo último que quedó guardado, no lo que está pasando ahora.
        </Alert>
      )}

      <Card p={0} className="sbc-tabin">
        <ScrollArea.Autosize mah={560} viewportRef={vpRef}>
          <Table stickyHeader highlightOnHover verticalSpacing={5} fz="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={96}>Hora</Table.Th>
                <Table.Th>Origen</Table.Th><Table.Th w={22} />
                <Table.Th>Destino</Table.Th>
                <Table.Th>Mensaje</Table.Th>
                <Table.Th w={90}>CSeq</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {agrupar ? (grupos.length === 0 ? <Vacio /> : grupos.map((g) => (
                <Table.Tr key={g.callid} style={{ cursor: 'pointer' }} onClick={() => setAbierto(g.callid)}>
                  <Table.Td style={MONO}>{hora(g.t0)}</Table.Td>
                  <Table.Td style={MONO}>{g.de}</Table.Td>
                  <Table.Td><IconArrowRight size={12} style={{ opacity: .5 }} /></Table.Td>
                  <Table.Td style={MONO}>{g.a}</Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Badge variant="light" color={ETIQ[g.estado].c}>{ETIQ[g.estado].t}</Badge>
                      <Badge size="xs" variant="outline" color="gray">{g.ms.length}</Badge>
                      {g.audio && <span className="sip-eq" title="hubo audio"><span /><span style={{ animationDelay: '.12s' }} /><span style={{ animationDelay: '.24s' }} /><span style={{ animationDelay: '.36s' }} /></span>}
                    </Group>
                  </Table.Td>
                  <Table.Td />
                </Table.Tr>
              ))) : (filtrados.length === 0 ? <Vacio /> : filtrados.map((m) => {
                const tinte = m.status >= 400 ? 'rgba(240,68,56,.07)'
                  : (m.status >= 200 && m.status < 300) ? 'rgba(18,183,106,.06)'
                  : (m.method === 'INVITE' || m.method === 'BYE') ? 'rgba(47,116,230,.05)' : undefined;
                return (
                  <Table.Tr key={m.id} style={{ cursor: 'pointer', background: tinte }}
                            onClick={() => setAbierto(m.callid || ('id' + m.id))}>
                    <Table.Td style={MONO}>{hora(m.t)}</Table.Td>
                    <Table.Td style={MONO}>{m.src}</Table.Td>
                    <Table.Td><IconArrowRight size={12} style={{ opacity: .5 }} /></Table.Td>
                    <Table.Td style={MONO}>{m.dst}</Table.Td>
                    <Table.Td><Badge variant="light" color={color(m)} leftSection={<Icono m={m} />}>{rotulo(m)}</Badge></Table.Td>
                    <Table.Td style={MONO} c="dimmed">{m.cseq || ''}</Table.Td>
                  </Table.Tr>
                );
              }))}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
      </Card>

      {/* ── el diálogo completo ──────────────────────────────────────────── */}
      <Drawer opened={!!abierto} onClose={() => { setAbierto(null); setCrudo(null); }} position="right" size="xl"
        title={dialogo && (
          <Group gap="sm">
            <Icono m={dialogo.ms[0]} size={20} />
            <div>
              <Text fw={800} lh={1.1}>{dialogo.de} → {dialogo.a}</Text>
              <Text size="xs" c="dimmed" style={MONO} truncate maw={340}>{dialogo.callid}</Text>
            </div>
            <Badge variant="light" color={ETIQ[dialogo.estado].c}>{ETIQ[dialogo.estado].t}</Badge>
            {huboAudio(dialogo.ms) && <Badge variant="light" color="teal" leftSection={<IconWaveSine size={12} />}>Audio</Badge>}
          </Group>
        )}>
        {dialogo && (
          <Stack gap="md">
            <Card withBorder radius="md" p="xs">
              <Text fw={700} size="sm" mb={6}>Cómo fue la llamada</Text>
              <ScrollArea.Autosize mah={320}>
                <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: W, height: H, display: 'block' }}>
                  {carriles.map((d) => {
                    const x = x0(d);
                    return (
                      <g key={d}>
                        <line x1={x} y1={48} x2={x} y2={H - 8} stroke="var(--mantine-color-default-border)" strokeWidth="1.2" strokeDasharray="3 4" />
                        <rect x={x - 64} y={10} width={128} height={28} rx={8} fill="var(--mantine-color-body)" stroke="var(--mantine-color-default-border)" />
                        <text x={x} y={28} textAnchor="middle" style={{ fontSize: 10.5, fontWeight: 700, fill: 'var(--mantine-color-text)' }}>{d}</text>
                      </g>
                    );
                  })}
                  {dialogo.ms.map((m, i) => {
                    const xa = x0(ip(m.src)); const xb0 = x0(ip(m.dst)); const y = ARRIBA + i * ALTO_FILA;
                    const propio = Math.abs(xa - xb0) < 1;
                    const xb = propio ? xa + 70 : xb0;
                    const dir = xb >= xa ? 1 : -1;
                    const c = trazo(m);
                    const nseq = (m.cseq || '').split(' ')[0] || '';
                    const activo = crudo && crudo.id === m.id;
                    return (
                      <g key={m.id} style={{ cursor: 'pointer' }} onClick={() => verCrudo(m.id)}>
                        <text x={(xa + xb) / 2} y={y - 6} textAnchor="middle" style={{ fontSize: 10, fontWeight: 700, fill: c }}>
                          {rotulo(m)}{nseq ? ` (${nseq})` : ''}
                        </text>
                        <path d={`M ${xa} ${y} L ${xb} ${y}`} stroke={c} strokeWidth={activo ? 3.4 : 2} fill="none" />
                        <path d={`M ${xb} ${y} l ${-8 * dir} -4 l 0 8 z`} fill={c} />
                      </g>
                    );
                  })}
                </svg>
              </ScrollArea.Autosize>
            </Card>

            <Box>
              <Text fw={700} size="sm" mb={6}>Paso a paso</Text>
              <Stack gap={6}>
                {dialogo.ms.map((m, i) => {
                  const dt = i > 0 ? `+${Math.max(0, Math.round(m.t - dialogo.ms[i - 1].t))} ms` : hora(m.t);
                  return (
                    <Card key={m.id} withBorder radius="sm" p="xs">
                      <Group justify="space-between" gap={6} wrap="nowrap">
                        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                          <Badge variant="light" color={color(m)} leftSection={<Icono m={m} />}>{rotulo(m)}</Badge>
                          <Text size="xs" c="dimmed" style={MONO} truncate>{m.src} → {m.dst}</Text>
                        </Group>
                        <Text size="xs" c="dimmed" style={MONO}>{dt}</Text>
                      </Group>
                      <Text size="xs" c="dimmed" mt={4}>{descripcion(m)}</Text>
                      <Anchor size="xs" mt={2} onClick={() => verCrudo(m.id)}>
                        {crudo && crudo.id === m.id ? 'ocultar el mensaje crudo' : 'ver el mensaje crudo'}
                      </Anchor>
                      {crudo && crudo.id === m.id && (
                        <Code block mt={4} fz="10.5px" style={{ maxHeight: 240, overflow: 'auto' }}>{crudo.texto}</Code>
                      )}
                    </Card>
                  );
                })}
              </Stack>
            </Box>
          </Stack>
        )}
      </Drawer>
    </Stack>
  );
}

function Vacio() {
  return (
    <Table.Tr>
      <Table.Td colSpan={6}>
        <Stack align="center" py="xl" gap={6}>
          <ThemeIcon size={44} radius="xl" variant="light" color="gray"><IconWaveSine size={22} /></ThemeIcon>
          <Text fw={600}>Todavía no cruzó tráfico SIP</Text>
          <Text size="sm" c="dimmed" ta="center" maw={480}>
            Hacé una llamada, o registrá un teléfono, y va a aparecer acá. Si no aparece nada, el tráfico no está
            pasando por el borde: revisá que el teléfono o el operador apunten al SBC.
          </Text>
        </Stack>
      </Table.Td>
    </Table.Tr>
  );
}
