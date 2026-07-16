'use client';
/* ============================================================================
 *  Troncales — la salida al operador.
 *
 *  Cada tipo de troncal se configura distinto y se prueba distinto. La modal lo
 *  hace explícito: primero elegís el TIPO (el pilar), y según eso aparecen sólo
 *  los campos que ese tipo necesita. Antes de guardar, un diagnóstico animado
 *  confirma que la troncal no nace muerta.
 * ==========================================================================*/
import { useState } from 'react';
import {
  Card, Group, Text, Badge, Table, Stack, Button, Modal, TextInput, NumberInput,
  Select, Skeleton, ThemeIcon, Tooltip, MultiSelect, Switch, Alert, SimpleGrid, PasswordInput,
  ActionIcon, Code, Timeline, Loader, Divider, UnstyledButton,
} from '@mantine/core';
import {
  IconPlugConnected, IconPlus, IconLock, IconWorld, IconInfoCircle, IconPencil, IconTrash,
  IconAlertTriangle, IconShieldLock, IconCheck, IconX, IconStethoscope, IconRadar,
  IconPhoneOutgoing, IconArrowRight, IconArrowLeft, IconWifi, IconTag, IconArrowsExchange, IconUser, IconKeyboard, IconMusic, IconScissors, IconPhoneCalling,
} from '@tabler/icons-react';
import PageHeader from '../PageHeader';
import { usePoll, api } from '../api';
import { useMonitor, MonCell } from '../Mon';
import { toast, toastPromise } from '../notify';

const CODECS = [
  { value: 'ulaw', label: 'G.711 μ-law (ulaw)' },
  { value: 'alaw', label: 'G.711 A-law (alaw)' },
  { value: 'g722', label: 'G.722 (HD)' },
  { value: 'g729', label: 'G.729 (operadores viejos)' },
  { value: 'opus', label: 'Opus (WebRTC)' },
  { value: 'gsm', label: 'GSM (equipos viejos)' },
];

const TIPOS = [
  { v: 'ip', t: 'IP fija', icon: IconWorld, color: '#f59e0b',
    d: 'El operador te reconoce por tu IP pública. Sin usuario ni clave: hay que estar en su lista blanca.' },
  { v: 'register', t: 'Registro', icon: IconShieldLock, color: '#2f74e6',
    d: 'El SBC se registra con usuario y clave, como un teléfono. Lo típico de un DID de PYME.' },
  { v: 'webrtc-client', t: 'WebRTC cliente', icon: IconPlugConnected, color: '#9c5cff',
    d: 'Enlace WSS saliente hacia otra sede o PBX. Atraviesa NAT sin abrir puertos del otro lado.' },
];
const tipoDe = (v) => TIPOS.find((x) => x.v === v) || TIPOS[1];

const VACIO = {
  name: '', provider_host: '', provider_port: 5060, transport: 'udp', mode: 'register', remote_url: '',
  username: '', password: '', realm: '', from_user: '', from_domain: '',
  codecs: ['ulaw', 'alaw'], dtmf: 'rfc4733', session_timers: false, max_calls: 0,
  outbound_strip: 0, outbound_prefix: '', gateway_ip: '', gateway_dev: '',
};

function Lbl({ children, tip }) {
  return (
    <Group gap={5} wrap="nowrap" component="span" style={{ display: 'inline-flex' }}>
      <span>{children}</span>
      {tip && (
        <Tooltip label={tip} multiline w={280} withArrow position="top-start"
                 transitionProps={{ transition: 'pop', duration: 160 }} events={{ hover: true, focus: true, touch: true }}>
          <IconInfoCircle size={13} style={{ opacity: 0.5, cursor: 'help', flexShrink: 0 }} />
        </Tooltip>
      )}
    </Group>
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function Troncales() {
  const { data, cargando, recargar } = usePoll('/trunks', 12000);
  const mon = useMonitor();
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState(VACIO);
  const [editando, setEditando] = useState(null);
  const [diag, setDiag] = useState(null);
  const [paso, setPaso] = useState(2);   // wizard NUEVA troncal: 1=elegir tipo, 2=cargar datos
  const troncales = data || [];

  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setDiag(null); };

  function editar(t) {
    setEditando(t.id);
    setF({ ...VACIO, ...t, password: '', codecs: (t.codecs || '').split(',').filter(Boolean) });
    setDiag(null); setPaso(2); setAbierto(true);
  }
  function nueva() { setEditando(null); setF(VACIO); setDiag(null); setPaso(1); setAbierto(true); }

  async function diagnosticar() {
    if (f.mode === 'webrtc-client' ? !f.remote_url : !f.provider_host) {
      toast(f.mode === 'webrtc-client' ? 'Cargá la URL wss:// primero' : 'Cargá el host del operador primero', 'warn');
      return;
    }
    setDiag({ corriendo: true, visibles: [], total: 0, ok: null });
    let r;
    try { r = await api('/trunks/diagnose', { method: 'POST', body: f }); }
    catch (e) { setDiag({ corriendo: false, visibles: [{ paso: 'Diagnóstico', ok: false, detalle: e.message }], total: 1, ok: false }); return; }
    if (r.gateway !== undefined) setF((x) => ({ ...x, gateway_ip: r.gateway || '', gateway_dev: r.gateway_dev || '' }));
    setDiag((d) => ({ ...d, total: r.pasos.length, ok: r.ok }));
    for (let i = 0; i < r.pasos.length; i++) {
      await sleep(i === 0 ? 250 : 500);
      setDiag((d) => ({ ...d, visibles: [...d.visibles, r.pasos[i]] }));
    }
    setDiag((d) => ({ ...d, corriendo: false }));
  }

  async function guardar() {
    if (!f.name) { toast('Falta el nombre', 'warn'); return; }
    if (f.mode === 'webrtc-client' && !f.remote_url) { toast('Falta la URL wss:// remota', 'warn'); return; }
    if (f.mode !== 'webrtc-client' && !f.provider_host) { toast('Falta el host del operador', 'warn'); return; }
    const body = { ...f, codecs: (f.codecs || []).join(',') };
    const ruta = editando ? `/trunks/${editando}` : '/trunks';
    await toastPromise(
      api(ruta, { method: editando ? 'PUT' : 'POST', body }).then(() => { setAbierto(false); setF(VACIO); setEditando(null); setDiag(null); recargar(); }),
      {
        loading: 'Guardando la troncal…',
        success: editando ? 'Troncal guardada · acordate de Aplicar en Ruteo de salida'
          : 'Troncal creada · ahora necesita una regla en Ruteo de salida',
        error: (e) => e.message,
      });
  }

  const borrar = (t) => toastPromise(
    api(`/trunks/${t.id}`, { method: 'DELETE' }).then(recargar),
    { loading: 'Borrando…', success: 'Troncal borrada · aplicá el ruteo', error: (e) => e.message });

  const tipo = tipoDe(f.mode);
  const esWeb = f.mode === 'webrtc-client';
  const esReg = f.mode === 'register';

  return (
    <Stack gap="lg">
      <PageHeader icon={<IconPlugConnected size={24} />} title="Troncales"
        subtitle="La salida al operador: transporte, credenciales y códecs"
        right={<Button leftSection={<IconPlus size={16} />} onClick={nueva}>Nueva troncal</Button>} />

      <Alert variant="light" color="cyan" radius="lg" icon={<IconInfoCircle size={18} />}>
        <b>Registro</b> es para operadores que dan usuario y contraseña (el SBC se registra contra ellos, RFC 3261 §10).
        <b> IP fija</b> es para los que autentican por dirección: no hay REGISTER, sólo hay que estar en su lista blanca.
      </Alert>

      {troncales.length > 0 && (
        <Alert variant="light" color="orange" radius="lg" icon={<IconAlertTriangle size={18} />}>
          Una troncal, sola, no cursa nada: hay que decirle al SBC <b>qué números salen por ella</b> en
          <b> Ruteo de salida</b>. Sin una regla ahí, el borde contesta <Code fz="11px">404 No route to PSTN</Code>.
        </Alert>
      )}

      <Card p={0} className="sbc-fade-in">
        {cargando ? <Skeleton h={140} radius="lg" /> : (
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Troncal</Table.Th><Table.Th>Operador</Table.Th><Table.Th>Transporte</Table.Th>
                <Table.Th>Modo</Table.Th><Table.Th>Códecs</Table.Th><Table.Th>Al salir</Table.Th>
                <Table.Th>Monitoreo (OPTIONS)</Table.Th><Table.Th>Estado</Table.Th><Table.Th w={70} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {troncales.map((t) => {
                const tp = tipoDe(t.mode);
                return (
                  <Table.Tr key={t.id}>
                    <Table.Td>
                      <Group gap={8}>
                        <ThemeIcon size={26} radius="md" variant="light" color={t.enabled ? 'cyan' : 'gray'}>
                          <IconPlugConnected size={14} />
                        </ThemeIcon>
                        <div>
                          <Text fw={650} size="sm">{t.name}</Text>
                          {t.tiene_password && (
                            <Tooltip label="Tiene credenciales guardadas (nunca salen de la base)">
                              <Text size="10px" c="dimmed"><IconLock size={10} style={{ verticalAlign: -1 }} /> con credenciales</Text>
                            </Tooltip>
                          )}
                        </div>
                      </Group>
                    </Table.Td>
                    <Table.Td ff="monospace" fz="xs">{t.mode === 'webrtc-client' ? t.remote_url : `${t.provider_host}:${t.provider_port}`}</Table.Td>
                    <Table.Td><Badge size="sm" variant="light" color="gray">{t.mode === 'webrtc-client' ? 'WSS' : (t.transport || 'udp').toUpperCase()}</Badge></Table.Td>
                    <Table.Td>
                      <Badge size="sm" variant="light" style={{ color: tp.color, background: tp.color + '18' }}
                             leftSection={<tp.icon size={11} />}>{tp.t}</Badge>
                    </Table.Td>
                    <Table.Td fz="xs" ff="monospace">{t.codecs}</Table.Td>
                    <Table.Td fz="xs" c="dimmed">
                      {(t.outbound_strip || t.outbound_prefix)
                        ? <>{t.outbound_strip ? `−${t.outbound_strip} díg.` : ''}{t.outbound_strip && t.outbound_prefix ? ' · ' : ''}{t.outbound_prefix ? <>+<Code fz="10px">{t.outbound_prefix}</Code></> : ''}</>
                        : 'tal cual'}
                    </Table.Td>
                    <Table.Td><MonCell e={mon['tr' + t.id]} /></Table.Td>
                    <Table.Td><Badge variant="light" color={t.enabled ? 'teal' : 'gray'}>{t.enabled ? 'activa' : 'inactiva'}</Badge></Table.Td>
                    <Table.Td>
                      <Group gap={2} wrap="nowrap">
                        <Tooltip label="Editar"><ActionIcon variant="subtle" color="sbc" onClick={() => editar(t)}><IconPencil size={16} /></ActionIcon></Tooltip>
                        <Tooltip label="Borrar"><ActionIcon variant="subtle" color="red" onClick={() => borrar(t)}><IconTrash size={16} /></ActionIcon></Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
              {troncales.length === 0 && (
                <Table.Tr><Table.Td colSpan={9}>
                  <Stack align="center" py="xl" gap={6}>
                    <ThemeIcon size={46} radius="xl" variant="light" color="gray"><IconPlugConnected size={24} /></ThemeIcon>
                    <Text fw={600}>Sin troncales</Text>
                    <Text size="sm" c="dimmed">Sin troncal no hay llamadas hacia afuera.</Text>
                  </Stack>
                </Table.Td></Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      <Modal opened={abierto} onClose={() => setAbierto(false)} size="60rem" radius="lg"
             title={
               <Group gap={10}>
                 <ThemeIcon size={34} radius="md" variant="light" style={{ color: tipo.color, background: tipo.color + '1f' }}>
                   <tipo.icon size={19} />
                 </ThemeIcon>
                 <div>
                   <Text fw={800} lh={1.1}>{editando ? 'Editar troncal' : 'Nueva troncal'}</Text>
                   <Text size="xs" c="dimmed" lh={1.1}>Troncal de tipo <b style={{ color: tipo.color }}>{tipo.t}</b></Text>
                 </div>
               </Group>
             }>
        <Stack gap="lg">
          <style jsx>{`
            .trk-step { animation: trkstep .34s cubic-bezier(.2,.7,.3,1) both; }
            @keyframes trkstep { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
            .trk-radar { position: relative; display: inline-flex; align-items: center; justify-content: center; }
            .trk-radar i { position: absolute; width: 96px; height: 96px; border-radius: 50%; border: 2px solid var(--mantine-color-teal-4); opacity: 0; animation: trkpulse 2.4s ease-out infinite; }
            .trk-radar i:nth-child(2) { animation-delay: .8s; }
            .trk-radar i:nth-child(3) { animation-delay: 1.6s; }
            @keyframes trkpulse { 0% { transform: scale(.55); opacity: .55; } 100% { transform: scale(2); opacity: 0; } }
          `}</style>

          {!editando && paso === 1 && (
            <div className="trk-step" key="s1" style={{ paddingBlock: 6 }}>
              <Text ta="center" fw={800} size="lg" lh={1.2}>¿Qué tipo de troncal vas a crear?</Text>
              <Text ta="center" size="sm" c="dimmed" mt={4} mb="lg">Elegí cómo se conecta con el operador. Después cargás sólo los datos de ese tipo.</Text>
              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                {TIPOS.map((tp) => (
                  <UnstyledButton key={tp.v} onClick={() => { set('mode', tp.v); setPaso(2); }}
                    style={{ borderRadius: 16, padding: 20, textAlign: 'center', border: `2px solid ${tp.color}30`,
                             background: tp.color + '0c', transition: 'transform .16s ease, box-shadow .16s ease, border-color .16s ease' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = tp.color; e.currentTarget.style.boxShadow = `0 14px 32px -16px ${tp.color}`; e.currentTarget.style.transform = 'translateY(-3px)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = tp.color + '30'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}>
                    <ThemeIcon size={56} radius="xl" variant="light" style={{ color: tp.color, background: tp.color + '1c', margin: '0 auto 12px' }}>
                      <tp.icon size={28} />
                    </ThemeIcon>
                    <Text fw={800}>{tp.t}</Text>
                    <Text size="xs" c="dimmed" mt={5} lh={1.45}>{tp.d}</Text>
                    <Text size="xs" fw={700} mt={12} style={{ color: tp.color }}>Elegir →</Text>
                  </UnstyledButton>
                ))}
              </SimpleGrid>
            </div>
          )}

          {(editando || paso === 2) && (
          <div className="trk-step" key="s2">
          {!editando && (
            <Button variant="subtle" color="gray" size="xs" mb={4} leftSection={<IconArrowLeft size={14} />} onClick={() => setPaso(1)}>Cambiar tipo</Button>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1fr)', gap: 20, alignItems: 'stretch' }}>
          <Stack gap="md">

          <TextInput required leftSection={<IconTag size={15} />} value={f.name} onChange={(e) => set('name', e.currentTarget.value)}
            placeholder="Antel SIP"
            label={<Lbl tip="Sólo para vos: es el nombre con el que verás esta troncal en el panel y en la topología.">Nombre</Lbl>} />

          {esWeb ? (
            <TextInput required value={f.remote_url} onChange={(e) => set('remote_url', e.currentTarget.value)}
              placeholder="wss://pbx.otra-empresa.com/ws" leftSection={<IconWifi size={15} />}
              label={<Lbl tip="El WebSocket seguro del otro extremo. El SBC se conecta hacia AFUERA a esta URL y se registra: por eso no hay que abrir puertos en la sede remota.">URL remota (WSS)</Lbl>} />
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
              <TextInput required leftSection={<IconWorld size={15} />} value={f.provider_host} onChange={(e) => set('provider_host', e.currentTarget.value)}
                placeholder="sip.operador.com.uy"
                label={<Lbl tip="Dominio o IP del operador a donde el SBC manda la señalización SIP. Si es un dominio, el borde lo resuelve por DNS.">Host del operador</Lbl>} />
              <NumberInput leftSection={<IconPlugConnected size={15} />} value={f.provider_port} min={1} max={65535} onChange={(v) => set('provider_port', v || 5060)}
                label={<Lbl tip="Puerto SIP del operador. 5060 para UDP/TCP en claro; 5061 para TLS. Si te equivocás acá, la troncal no registra ni cursa.">Puerto</Lbl>} />
              <Select leftSection={<IconArrowsExchange size={15} />} value={f.transport} onChange={(v) => set('transport', v || 'udp')} data={['udp', 'tcp', 'tls']}
                label={<Lbl tip="Cómo viaja la señalización. UDP es lo más común; TLS la cifra (elegilo sólo si el operador lo soporta, si no la troncal queda muda).">Transporte</Lbl>} />
            </SimpleGrid>
          )}

          {(esReg || esWeb) && (
            <SimpleGrid cols={{ base: 1, sm: esWeb ? 2 : 3 }} spacing="md">
              <TextInput leftSection={<IconUser size={15} />} value={f.username} onChange={(e) => set('username', e.currentTarget.value)}
                label={<Lbl tip="El usuario SIP que te dio el operador (o el del enlace remoto). Con esto el SBC se identifica al registrarse.">Usuario</Lbl>} />
              <PasswordInput leftSection={<IconLock size={15} />} value={f.password} onChange={(e) => set('password', e.currentTarget.value)}
                placeholder={editando ? '•••• (dejar vacío = sin cambio)' : ''}
                label={<Lbl tip="La contraseña del registro. Se guarda cifrada en el borde y nunca vuelve al panel. Al editar, vacío = se mantiene la actual.">Contraseña</Lbl>} />
              {!esWeb && (
                <TextInput leftSection={<IconWorld size={15} />} value={f.realm} onChange={(e) => set('realm', e.currentTarget.value)} placeholder="(opcional)"
                  label={<Lbl tip="El dominio de autenticación. Vacío = se usa el que anuncie el operador en el 401. Sólo tocalo si el operador te da uno fijo.">Realm</Lbl>} />
              )}
            </SimpleGrid>
          )}

          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            <MultiSelect leftSection={<IconMusic size={15} />} data={CODECS} value={f.codecs} onChange={(v) => set('codecs', v)}
              label={<Lbl tip="Códecs que ofrece el SBC, en orden de preferencia. Si el operador sólo habla uno distinto (ej. G.729), rtpengine transcodifica — cuesta CPU pero la llamada conecta.">Códecs</Lbl>} />
            <Select leftSection={<IconKeyboard size={15} />} data={[{ value: 'rfc4733', label: 'RFC 4733 (fuera de banda)' }, { value: 'inband', label: 'In-band (en el audio)' }, { value: 'info', label: 'SIP INFO' }]}
              value={f.dtmf} onChange={(v) => set('dtmf', v || 'rfc4733')}
              label={<Lbl tip="Cómo viajan los tonos del teclado (para IVRs, casillas). RFC 4733 es lo estándar; si el operador no los reconoce, probá otro y se acaban los 'no me toma el número'.">DTMF</Lbl>} />
            <NumberInput leftSection={<IconPhoneCalling size={15} />} value={f.max_calls} min={0} onChange={(v) => set('max_calls', v || 0)}
              label={<Lbl tip="Control de admisión (CAC): tope de llamadas simultáneas por esta troncal. 0 = sin límite. Sirve para no exceder lo contratado.">Máx. simultáneas</Lbl>} />
          </SimpleGrid>

          {!esWeb && (
            <>
              <Divider label={<Group gap={6}><IconPhoneOutgoing size={13} /><Text size="xs" fw={700}>Cómo sale el número hacia el operador</Text></Group>} labelPosition="left" />
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <TextInput leftSection={<IconUser size={15} />} value={f.from_user} onChange={(e) => set('from_user', e.currentTarget.value)}
                  label={<Lbl tip="Lo que el operador espera ver en la cabecera From (a veces exige un número fijo de cabecera, no el del interno). Vacío = el SBC usa el CallerID de la llamada.">From user</Lbl>} />
                <TextInput leftSection={<IconWorld size={15} />} value={f.from_domain} onChange={(e) => set('from_domain', e.currentTarget.value)}
                  label={<Lbl tip="El dominio en el From, si el operador lo exige. Vacío = el SBC pone el suyo. Algunos operadores rechazan la llamada si esto no coincide.">From domain</Lbl>} />
              </SimpleGrid>
              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" style={{ alignItems: 'end' }}>
                <NumberInput leftSection={<IconScissors size={15} />} value={f.outbound_strip} min={0} max={10} onChange={(v) => set('outbound_strip', v || 0)}
                  label={<Lbl tip="Dígitos a sacar del principio del número antes de mandarlo. El clásico 'quitale el 0 de salida'. Vive en la troncal porque es una manía del operador, no del número.">Sacarle dígitos</Lbl>} />
                <TextInput leftSection={<IconPlus size={15} />} value={f.outbound_prefix} onChange={(e) => set('outbound_prefix', e.currentTarget.value)} placeholder="0"
                  label={<Lbl tip="Prefijo que esta troncal exige adelante del número (ej. 0, o +598). Se agrega después de sacar dígitos. Si el operador te rebota las llamadas, casi siempre es esto.">Anteponer prefijo</Lbl>} />
                <Switch mb={6} checked={f.session_timers} onChange={(e) => set('session_timers', e.currentTarget.checked)}
                  label={<Lbl tip="Refresca el diálogo cada tanto (RFC 4028). Evita 'llamadas zombi' que quedan facturando si se corta la señalización sin un BYE. Recomendado con la mayoría de los operadores.">Session timers</Lbl>} />
              </SimpleGrid>
            </>
          )}

          </Stack>
          <div style={{ position: 'sticky', top: 0, height: '100%' }}>
          <div style={{ background: 'light-dark(#f6f9fc,#0b1420)', borderRadius: 16, height: '100%', minHeight: 440, display: 'flex', flexDirection: 'column', padding: 18 }}>
            <Group justify="space-between" wrap="nowrap" mb={diag ? 'sm' : 0}>
              <Group gap={8} wrap="nowrap">
                <ThemeIcon size={32} radius="md" variant="light" color="teal"><IconStethoscope size={18} /></ThemeIcon>
                <div>
                  <Text fw={700} size="sm">Diagnóstico previo</Text>
                  <Text size="11px" c="dimmed">Probamos DNS, alcance y {esWeb ? 'handshake WSS' : 'SIP'} antes de guardar.</Text>
                </div>
              </Group>
              <Button variant="light" color="teal" leftSection={<IconRadar size={16} />}
                      loading={diag?.corriendo} onClick={diagnosticar}>Diagnosticar</Button>
            </Group>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: diag ? 'flex-start' : 'center', overflow: 'auto' }}>
            {!diag && (
              <Stack align="center" justify="center" gap={18} py="xl">
                <span className="trk-radar"><i/><i/><i/>
                  <ThemeIcon size={96} radius="xl" variant="light" color="teal"><IconRadar size={50} /></ThemeIcon>
                </span>
                <Text size="sm" c="dimmed" ta="center" maw={270} lh={1.5}>
                  Tocá <b>Diagnosticar</b> y probamos DNS, gateway, ruta y {esWeb ? 'el handshake WSS' : 'el SIP'} del operador — paso a paso — antes de guardar.
                </Text>
              </Stack>
            )}

            {diag && (
              <Timeline active={diag.visibles.length - 1} bulletSize={22} lineWidth={2} mt="xs">
                {diag.visibles.map((p, i) => (
                  <Timeline.Item key={i}
                    bullet={p.info ? <IconInfoCircle size={13} /> : p.ok ? <IconCheck size={13} /> : <IconX size={13} />}
                    color={p.info ? 'blue' : p.ok ? 'teal' : 'red'}
                    title={<Group gap={8}><Text size="sm" fw={600}>{p.paso}</Text>{p.ms > 0 && <Badge size="xs" variant="light" color="gray">{p.ms} ms</Badge>}</Group>}>
                    <Text size="xs" c={p.info ? 'dimmed' : p.ok ? 'teal.7' : 'red.7'} className="sbc-fade-in">{p.detalle}</Text>
                  </Timeline.Item>
                ))}
                {diag.corriendo && diag.visibles.length < (diag.total || 1) && (
                  <Timeline.Item bullet={<Loader size={12} color="teal" />} title={<Text size="sm" c="dimmed">Probando…</Text>} />
                )}
              </Timeline>
            )}

            {diag && !diag.corriendo && (
              <Alert mt="sm" variant="light" radius="md" color={diag.ok ? 'teal' : 'orange'}
                     icon={diag.ok ? <IconCheck size={16} /> : <IconAlertTriangle size={16} />}>
                <Text size="sm">
                  {diag.ok
                    ? 'Todo respondió. La troncal debería conectar sin sorpresas.'
                    : 'Algo no respondió. Podés guardar igual (a veces el operador sólo contesta tras el registro), pero revisá los pasos en rojo.'}
                </Text>
              </Alert>
            )}
            </div>
          </div>
          </div>
          </div>
          </div>
          )}

          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAbierto(false)}>Cancelar</Button>
            {(editando || paso === 2) && (
            <Button leftSection={<IconArrowRight size={16} />} onClick={guardar}>
              {editando ? 'Guardar los cambios' : 'Crear troncal'}
            </Button>
            )}
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
