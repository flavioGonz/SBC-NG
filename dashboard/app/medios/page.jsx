'use client';
/* ============================================================================
 *  Medios — rtpengine y TURN/STUN.
 *
 *  La señalización es la que se ve; el audio es el que se queja. Todo lo que hace
 *  que una llamada tenga sonido en los dos sentidos está en esta pantalla.
 *
 *  Ojo con una cosa que no es obvia: ni rtpengine ni coturn releen su config. El
 *  rango de puertos RTP y el external-ip del TURN se leen UNA vez, al arrancar.
 *  Por eso "Guardar" y "Aplicar" son dos botones distintos: aplicar reinicia el
 *  motor, y reiniciar el motor corta las llamadas que estén cursando.
 * ==========================================================================*/
import { useState, useEffect } from 'react';
import {
  Card, Group, Text, Badge, Stack, Button, Tabs, NumberInput, TextInput, Select, Switch,
  SimpleGrid, Skeleton, ThemeIcon, Alert, Divider, PasswordInput, Tooltip,
} from '@mantine/core';
import {
  IconWaveSine, IconDeviceFloppy, IconPlayerPlay, IconAlertTriangle, IconRadar,
  IconAdjustments, IconWorld, IconLock, IconActivity, IconRefresh, IconInfoCircle,
} from '@tabler/icons-react';
import PageHeader from '../PageHeader';
import Skel, { SkelFilas } from '../Skel';
import Slot from '../Slot';
import { usePoll, api } from '../api';
import { toast, toastPromise } from '../notify';

function Kpi({ label, value, sufijo, color = 'sbc', icon }) {
  return (
    <Card p="md" className="sbc-panel-accent sbc-fade-in" style={{ '--acc': `var(--mantine-color-${color}-5)` }}>
      <Group justify="space-between" wrap="nowrap">
        <div>
          <Text size="11px" fw={700} tt="uppercase" c="dimmed">{label}</Text>
          <Group gap={4} align="baseline" mt={5}>
            <Text fw={800} fz={24} lh={1}><Slot value={value} /></Text>
            {sufijo && <Text size="xs" c="dimmed" fw={600}>{sufijo}</Text>}
          </Group>
        </div>
        <ThemeIcon size={36} radius="md" variant="light" color={color}>{icon}</ThemeIcon>
      </Group>
    </Card>
  );
}

export default function Medios() {
  const { data: med, cargando, recargar } = usePoll('/media', 8000);
  const { data: tur, recargar: recargarTurn } = usePoll('/turn', 12000);
  const { data: pubip } = usePoll('/public-ip', 15000);

  const [m, setM] = useState(null);
  const [t, setT] = useState(null);
  const [sucioM, setSucioM] = useState(false);
  const [sucioT, setSucioT] = useState(false);

  useEffect(() => { if (med && !sucioM) setM(med.cfg); }, [med, sucioM]);
  useEffect(() => { if (tur && !sucioT) setT(tur.cfg); }, [tur, sucioT]);

  // m y t son copias locales que se llenan en los useEffect, o sea despues del render en
  // que `cargando` pasa a false. Sin esperarlas, el primer render las encuentra en null.
  if (cargando || !m) return <SkelFilas filas={6} />;

  const setMedia = (k, v) => { setSucioM(true); setM((x) => ({ ...x, [k]: v })); };
  const setTurn = (k, v) => { setSucioT(true); setT((x) => ({ ...x, [k]: v })); };

  const motor = (med && med.motor) || {};
  const puertos = (m.port_max || 0) - (m.port_min || 0);

  async function guardarMedia() {
    await toastPromise(api('/media', { method: 'PUT', body: m }).then(() => { setSucioM(false); recargar(); }),
      { loading: 'Guardando…', success: 'Guardado. Falta aplicar para que el motor lo tome.', error: 'No se pudo guardar' });
  }
  async function aplicarMedia() {
    await toastPromise(api('/media/apply', { method: 'POST' }).then(recargar),
      { loading: 'Reiniciando el motor de medios…', success: 'Motor de medios reiniciado con la nueva configuración', error: 'No se pudo aplicar' });
  }
  async function guardarTurn() {
    await toastPromise(api('/turn', { method: 'PUT', body: t }).then(() => { setSucioT(false); recargarTurn(); }),
      { loading: 'Guardando…', success: 'Guardado. Falta aplicar.', error: 'No se pudo guardar' });
  }
  async function aplicarTurn() {
    await toastPromise(api('/turn/apply', { method: 'POST' }).then(recargarTurn),
      { loading: 'Reiniciando el TURN…', success: 'TURN Server reiniciado', error: (e) => e.message });
  }

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconWaveSine size={24} />}
        title="Medios"
        subtitle="Motor de medios (audio y transcoding) · TURN/STUN (NAT y WebRTC)"
        right={
          <Badge size="lg" variant="light" color={motor.ok ? 'teal' : 'red'}>
            {motor.ok ? 'motor de medios activo' : 'motor de medios sin respuesta'}
          </Badge>
        }
      />

      <Tabs defaultValue="rtp" variant="pills" radius="md" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="rtp" leftSection={<IconAdjustments size={15} />}>Motor de medios</Tabs.Tab>
          <Tabs.Tab value="turn" leftSection={<IconRadar size={15} />}>TURN / STUN</Tabs.Tab>
        </Tabs.List>

        {/* ── rtpengine ─────────────────────────────────────────────── */}
        <Tabs.Panel value="rtp">
          <Stack gap="lg" className="sbc-tabin">
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
              <Kpi label="Sesiones de medios" value={motor.sessions_own ?? motor.sessions ?? 0} icon={<IconActivity size={19} />} />
              <Kpi label="Puertos RTP" value={puertos > 0 ? puertos : 0} sufijo={`(${m.port_min}–${m.port_max})`} color="cyan" icon={<IconWaveSine size={19} />} />
              <Kpi label="Transcoding" value={m.transcoding ? 'activo' : 'apagado'} color={m.transcoding ? 'grape' : 'gray'} icon={<IconRefresh size={19} />} />
            </SimpleGrid>

            <Card p="lg">
              <Group justify="space-between" mb="md">
                <div>
                  <Text fw={700}>Configuración del motor de medios</Text>
                  <Text size="sm" c="dimmed">Cada llamada usa 2 puertos: el rango define cuántas simultáneas entran.</Text>
                </div>
                <Group gap="sm">
                  <Button variant="default" leftSection={<IconDeviceFloppy size={16} />} onClick={guardarMedia} disabled={!sucioM}>Guardar</Button>
                  <Tooltip label="Reinicia el motor de medios: las llamadas en curso se cortan">
                    <Button color="orange" leftSection={<IconPlayerPlay size={16} />} onClick={aplicarMedia}>Aplicar</Button>
                  </Tooltip>
                </Group>
              </Group>

              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                <NumberInput label="Puerto RTP mínimo" description="Inicio del rango" min={1024} max={65535}
                             value={m.port_min} onChange={(v) => setMedia('port_min', v)} />
                <NumberInput label="Puerto RTP máximo" description="Fin del rango" min={1024} max={65535}
                             value={m.port_max} onChange={(v) => setMedia('port_max', v)} />
                <NumberInput label="Timeout (s)" description="Sin RTP durante N segundos → se corta la llamada"
                             min={0} value={m.timeout} onChange={(v) => setMedia('timeout', v)} />
                <NumberInput label="Timeout de silencio (s)" description="Sólo silencio → se corta (llamadas zombi)"
                             min={0} value={m.silent_timeout} onChange={(v) => setMedia('silent_timeout', v)} />
                <Select label="Nivel de log" description="7 = debug, y llena el disco"
                        data={[{ value: '3', label: '3 · Sólo errores' }, { value: '5', label: '5 · Info' }, { value: '6', label: '6 · Normal' }, { value: '7', label: '7 · Debug' }]}
                        value={String(m.loglevel || 6)} onChange={(v) => setMedia('loglevel', +v)} />
              </SimpleGrid>

              <Divider my="md" />

              <Stack gap="sm">
                <Switch label="Transcoding" checked={!!m.transcoding} onChange={(e) => setMedia('transcoding', e.currentTarget.checked)}
                        description="Traduce entre códecs (Opus ↔ G.711 ↔ G.722 ↔ G.729). Cuesta CPU: si el operador y la central hablan el mismo idioma, no hace falta." />
                <Switch label="SRTP / DTLS" checked={!!m.dtls} onChange={(e) => setMedia('dtls', e.currentTarget.checked)}
                        description="Cifrado de medios. Obligatorio para WebRTC (RFC 5764); del lado del operador casi nunca se usa." />
              </Stack>

              <Alert variant="light" color="orange" radius="md" mt="md" icon={<IconAlertTriangle size={18} />}>
                El rango de puertos se lee <b>al arrancar</b>: no hay reload. Aplicar reinicia rtpengine y las llamadas
                que estén cursando se cortan. Hacelo en una ventana, no un martes a las 11.
              </Alert>
            </Card>
          </Stack>
        </Tabs.Panel>

        {/* ── coturn ────────────────────────────────────────────────── */}
        <Tabs.Panel value="turn">
          <Stack gap="lg" className="sbc-tabin">
            <Alert variant="light" color="sbc" radius="lg" icon={<IconWorld size={18} />}>
              <b>STUN</b> le dice al teléfono cuál es su IP pública: alcanza para la mayoría de los NAT y no cuesta nada.
              <b> TURN</b> además <i>relaya</i> el audio cuando el NAT es simétrico y no hay forma de agujerearlo — ahí sí,
              todo el audio pasa por el SBC y consume ancho de banda. Se activa porque hace falta, no por las dudas.
            </Alert>

            {t && (
              <Card p="lg">
                <Group justify="space-between" mb="md">
                  <Group gap={9}>
                    <ThemeIcon size={30} radius="md" variant="light" color={t.habilitado ? 'teal' : 'gray'}><IconRadar size={17} /></ThemeIcon>
                    <div>
                      <Text fw={700}>TURN Server</Text>
                      <Text size="xs" c="dimmed">
                        {(tur && tur.motor && tur.motor.corriendo) ? 'corriendo' : 'detenido'}
                        {t.aplicado_at ? ` · aplicado ${new Date(t.aplicado_at).toLocaleString('es-UY')}` : ' · nunca aplicado'}
                      </Text>
                    </div>
                  </Group>
                  <Group gap="sm">
                    <Button variant="default" leftSection={<IconDeviceFloppy size={16} />} onClick={guardarTurn} disabled={!sucioT}>Guardar</Button>
                    <Button color="orange" leftSection={<IconPlayerPlay size={16} />} onClick={aplicarTurn}>Aplicar</Button>
                  </Group>
                </Group>

                <Switch label="TURN/STUN habilitado" mb="md" checked={!!t.habilitado}
                        onChange={(e) => setTurn('habilitado', e.currentTarget.checked)} />

                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                  <TextInput label="Realm" description="Normalmente el dominio del SBC" placeholder="sbc.infratec.com.uy"
                             value={t.realm || ''} onChange={(e) => setTurn('realm', e.currentTarget.value)} />
                  <Select label="IP pública" description="Cómo la averigua el borde"
                          data={[
                            { value: 'auto', label: 'Automática (STUN)' },
                            { value: 'fqdn', label: 'Nombre DDNS' },
                            { value: 'fija', label: 'IP fija' },
                          ]}
                          value={t.ip_modo || 'auto'} onChange={(v) => setTurn('ip_modo', v || 'auto')} />
                  {(t.ip_modo || 'auto') === 'fija' ? (
                    <TextInput label="IP fija" description="La que te dio el proveedor" placeholder="200.40.x.x"
                               value={t.external_ip || ''} onChange={(e) => setTurn('external_ip', e.currentTarget.value)} />
                  ) : (t.ip_modo === 'fqdn') ? (
                    <TextInput label="Nombre (DDNS)" description="Se resuelve en cada chequeo" placeholder="mi-sbc.duckdns.org"
                               value={t.ip_fqdn || ''} onChange={(e) => setTurn('ip_fqdn', e.currentTarget.value)} />
                  ) : (
                    <TextInput label="IP detectada" readOnly description="La descubre el vigía por STUN, sola"
                               value={(pubip && (pubip.resuelta || pubip.actual)) || 'detectando…'} />
                  )}
                  <TextInput label="Usuario" value={t.usuario || ''} onChange={(e) => setTurn('usuario', e.currentTarget.value)} />
                  <PasswordInput label="Credencial" description="Se guarda en el SBC y no vuelve a mostrarse"
                                 placeholder={t.aplicado_at ? '•••••••• (sin cambios)' : 'elegí una credencial'}
                                 onChange={(e) => setTurn('secreto', e.currentTarget.value)} leftSection={<IconLock size={15} />} />
                  <NumberInput label="Relay: puerto mínimo" min={1024} max={65535}
                               value={t.port_min} onChange={(v) => setTurn('port_min', v)} />
                  <NumberInput label="Relay: puerto máximo" min={1024} max={65535}
                               value={t.port_max} onChange={(v) => setTurn('port_max', v)} />
                </SimpleGrid>

                <Stack gap="sm" mt="md">
                  <Switch label="Sólo STUN (sin relay)" checked={!!t.stun_solo} onChange={(e) => setTurn('stun_solo', e.currentTarget.checked)}
                          description="Contesta cuál es la IP pública, pero no relaya audio. Menos ancho de banda; no salva a los NAT simétricos." />
                  <Switch label="TLS (turns:)" checked={!!t.tls} onChange={(e) => setTurn('tls', e.currentTarget.checked)}
                          description="Para redes que bloquean UDP. Necesita certificado en el SBC." />
                </Stack>

                {/* Ajustes finos: coturn tiene decenas de opciones; estas son las que un SBC toca
                    de verdad. Se pegan al final del turnserver.conf. */}
                <Divider my="md" label="Ajustes finos" labelPosition="left" />
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" id="sbc-turn-extra">
                  <NumberInput label="Sesiones por usuario" description="0 = sin limite. Frena al que abusa del relay."
                               value={(t.extra && t.extra['user-quota']) || 0} min={0}
                               onChange={(v) => setTurn('extra', { ...(t.extra || {}), 'user-quota': v || 0 })} />
                  <NumberInput label="Sesiones totales" description="Techo global de relays simultaneos. 0 = sin limite."
                               value={(t.extra && t.extra['total-quota']) || 0} min={0}
                               onChange={(v) => setTurn('extra', { ...(t.extra || {}), 'total-quota': v || 0 })} />
                  <NumberInput label="Ancho de banda por sesion (bps)" description="0 = sin limite. Un relay de audio necesita ~90 kbps."
                               value={(t.extra && t.extra['max-bps']) || 0} min={0}
                               onChange={(v) => setTurn('extra', { ...(t.extra || {}), 'max-bps': v || 0 })} />
                </SimpleGrid>

                <Stack gap="sm" mt="sm">
                  <Switch label="Bloquear peers en loopback y redes privadas"
                          description="Evita que alguien use tu TURN para llegar a tu propia red interna. Prendelo salvo que sepas por que no."
                          checked={(t.extra && t.extra['no-loopback-peers']) === 'true'}
                          onChange={(e) => setTurn('extra', { ...(t.extra || {}), 'no-loopback-peers': e.currentTarget.checked ? 'true' : 'false' })} />
                  <Switch label="Rechazar nonce viejo (stale-nonce)"
                          description="Renueva el desafio de autenticacion cada tanto: le complica la vida al que intente reusar credenciales."
                          checked={(t.extra && t.extra['stale-nonce']) === 'true'}
                          onChange={(e) => setTurn('extra', { ...(t.extra || {}), 'stale-nonce': e.currentTarget.checked ? 'true' : 'false' })} />
                </Stack>

                <Alert variant="light" color="teal" radius="md" mt="md" icon={<IconInfoCircle size={18} />}>
                  {(t.ip_modo || 'auto') === 'fija'
                    ? <>Estás usando una IP fija. Si el proveedor te da IP dinámica, cambiá a <b>Automática</b> y el
                        borde la descubre solo — no vas a tener que volver acá cada vez que el ISP la renueve.</>
                    : <>La IP pública se descubre y se aplica <b>sola</b>: un vigía la revisa cada pocos minutos y, si el
                        proveedor la cambió, regenera el TURN Server y el motor de medios sin que tengas que tocar nada.
                        {pubip && (pubip.resuelta || pubip.actual) ? <> Ahora mismo es <Text span ff="monospace" fz="xs" fw={700}>{pubip.resuelta || pubip.actual}</Text>.</> : null}</>}
                </Alert>
              </Card>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
