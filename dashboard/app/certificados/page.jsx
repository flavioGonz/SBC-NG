'use client';
/* ============================================================================
 *  Certificados TLS — Let's Encrypt (ACME) sin proxy adelante.
 *
 *  Un appliance de borde tiene que poder tener su propio certificado válido para
 *  el panel HTTPS, el SIP sobre TLS y el WSS de WebRTC, aunque NO haya un proxy
 *  inverso adelante. Acá se pide y se renueva contra Let's Encrypt, con dos formas
 *  de validar el dominio (elegibles según tu red):
 *
 *   · HTTP-01 → Let's Encrypt pega a http://tu-dominio/… en el PUERTO 80. Es el
 *               caso "sin proxy": el 80 tiene que llegar a este equipo.
 *   · DNS-01  → el SBC crea un registro TXT vía la API de tu DNS. Sirve detrás de
 *               NAT/proxy, pero pide las credenciales del proveedor de DNS.
 *
 *  Sólo administradores. El control-plane la protege con `soloAdmin`.
 * ==========================================================================*/
import { useState, useEffect } from 'react';
import {
  Card, Group, Text, Badge, Stack, Button, TextInput, PasswordInput, Select,
  SegmentedControl, ThemeIcon, Alert, Divider, RingProgress, Code, Collapse, Loader,
} from '@mantine/core';
import {
  IconCertificate, IconWorldWww, IconServer, IconMail, IconRefresh, IconRosetteDiscountCheck,
  IconInfoCircle, IconShieldLock, IconAlertTriangle, IconTerminal2, IconDeviceFloppy, IconWorldBolt,
} from '@tabler/icons-react';
import PageHeader from '../PageHeader';
import { api } from '../api';
import { toast } from '../notify';
import { useAuth } from '../auth';

const fmtFecha = (t) => t ? new Date(t).toLocaleDateString('es-UY', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

// Color del anillo/badge según cuántos días le quedan al certificado.
function saludCert(dias) {
  if (dias === null || dias === undefined) return { color: 'gray', label: '—', pct: 0 };
  if (dias <= 0) return { color: 'red', label: 'Vencido', pct: 100 };
  if (dias <= 10) return { color: 'red', label: `${dias} días`, pct: Math.min(100, (90 - dias) / 90 * 100) };
  if (dias <= 25) return { color: 'orange', label: `${dias} días`, pct: (90 - dias) / 90 * 100 };
  return { color: 'teal', label: `${dias} días`, pct: (90 - dias) / 90 * 100 };
}

export default function Certificados() {
  const { user } = useAuth();
  const esAdmin = !!(user && user.role === 'admin');
  const [cargando, setCargando] = useState(true);
  const [cert, setCert] = useState(null);
  const [f, setF] = useState({ domain: '', email: '', method: 'http', dns_provider: '', dns_creds: {} });
  const [provs, setProvs] = useState([]);
  const [tieneCreds, setTieneCreds] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [emitiendo, setEmitiendo] = useState(false);
  const [log, setLog] = useState('');
  const [verLog, setVerLog] = useState(false);
  const [tlsModo, setTlsModo] = useState('proxy');
  const [tlsBusy, setTlsBusy] = useState(false);

  async function cargar() {
    try {
      const d = await api('/acme');
      const c = d.config || {};
      setF((prev) => ({ ...prev, domain: c.domain || '', email: c.email || '', method: c.method || 'http', dns_provider: c.dns_provider || '' }));
      setProvs(c.proveedores || []);
      setTieneCreds(!!c.tiene_dns_creds);
      setCert(d.cert || { emitido: false });
      try { const t = await api('/tls'); setTlsModo((t && t.modo) || 'proxy'); } catch (_) {}
    } catch (e) { toast(e.message, 'bad'); }
    finally { setCargando(false); }
  }

  async function aplicarTls(modo) {
    setTlsBusy(true);
    try {
      const r = await api('/tls/apply', { method: 'POST', body: { modo } });
      if (r && r.ok) { setTlsModo(modo); toast(modo === 'nativo' ? 'TLS nativo activado (SIP/TLS 5061 + WSS 8443)' : 'Modo proxy: el proxy termina TLS', 'ok'); }
      else toast((r && r.error) || 'No se pudo aplicar el modo TLS', 'bad');
    } catch (e) { toast(e.message, 'bad'); }
    finally { setTlsBusy(false); }
  }
  useEffect(() => { if (esAdmin) cargar(); else setCargando(false); }, [esAdmin]);

  const provActual = provs.find((p) => p.id === f.dns_provider);

  async function guardar() {
    if (!f.domain.trim()) return toast('Ingresá el dominio (ej: sbc.tuempresa.com).', 'bad');
    if (!f.email.trim()) return toast('Ingresá el email de la cuenta ACME.', 'bad');
    setGuardando(true);
    try {
      const creds = {};
      if (f.method === 'dns' && provActual) for (const v of provActual.vars) if (f.dns_creds[v]) creds[v] = f.dns_creds[v];
      await api('/acme/config', { method: 'POST', body: {
        domain: f.domain.trim(), email: f.email.trim(), method: f.method,
        dns_provider: f.dns_provider, ...(Object.keys(creds).length ? { dns_creds: creds } : {}),
      } });
      toast('Configuración guardada.', 'ok');
      await cargar();
    } catch (e) { toast(e.message, 'bad'); }
    finally { setGuardando(false); }
  }

  async function emitir(renovar) {
    setEmitiendo(true); setLog(''); setVerLog(false);
    try {
      const r = await api(renovar ? '/acme/renew' : '/acme/issue', { method: 'POST' });
      if (r.salida) { setLog(r.salida); setVerLog(!r.ok); }
      if (r.ok) { toast(renovar ? 'Certificado renovado.' : 'Certificado emitido correctamente.', 'ok'); }
      else { toast(r.error || 'No se pudo emitir el certificado.', 'bad'); setVerLog(true); }
      setCert((prev) => ({ ...(prev || {}), ...r, emitido: r.emitido !== undefined ? r.emitido : (prev && prev.emitido) }));
      await cargar();
    } catch (e) { toast(e.message, 'bad'); }
    finally { setEmitiendo(false); }
  }

  if (!esAdmin) {
    return (
      <>
        <PageHeader icon={<IconCertificate size={24} />} title="Certificados TLS" subtitle="Let's Encrypt (ACME)" />
        <Alert color="orange" icon={<IconShieldLock size={18} />} title="Sólo administradores">
          La gestión de certificados está reservada a usuarios con rol administrador.
        </Alert>
      </>
    );
  }

  const salud = saludCert(cert && cert.dias_restantes);

  return (
    <>
      <PageHeader icon={<IconCertificate size={24} />} title="Certificados TLS" subtitle="Let's Encrypt · sin proxy" />

      {cargando ? <Group justify="center" py="xl"><Loader /></Group> : (
        <Stack gap="lg">
          {/* Estado del certificado actual */}
          <Card withBorder radius="lg" p="lg">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Group gap="md" wrap="nowrap">
                <RingProgress
                  size={92} thickness={9} roundCaps
                  sections={[{ value: cert && cert.emitido ? salud.pct : 0, color: salud.color }]}
                  label={<Group justify="center">
                    <ThemeIcon size={40} radius="xl" variant="light" color={cert && cert.emitido ? salud.color : 'gray'}>
                      {cert && cert.emitido ? <IconRosetteDiscountCheck size={24} /> : <IconCertificate size={22} />}
                    </ThemeIcon>
                  </Group>}
                />
                <div>
                  <Text fw={700} size="lg">{cert && cert.emitido ? (cert.cn || f.domain || 'Certificado activo') : 'Sin certificado'}</Text>
                  {cert && cert.emitido ? (
                    <Group gap={8} mt={4}>
                      <Badge variant="light" color={salud.color} size="lg" leftSection={<IconShieldLock size={13} />}>{salud.label}</Badge>
                      <Text size="sm" c="dimmed">vence el {fmtFecha(cert.vence)}</Text>
                    </Group>
                  ) : (
                    <Text size="sm" c="dimmed" mt={4} maw={460}>
                      Todavía no emitiste un certificado. Configurá el dominio abajo y presioná <b>Emitir certificado</b>.
                    </Text>
                  )}
                </div>
              </Group>
              {cert && cert.emitido && (
                <Button variant="light" leftSection={<IconRefresh size={16} />} loading={emitiendo} onClick={() => emitir(true)}>
                  Renovar ahora
                </Button>
              )}
            </Group>
          </Card>

          {/* Modo TLS del borde: proxy vs nativo (ambos escenarios) */}
          <Card withBorder radius="lg" p="lg">
            <Group gap="md" mb="sm" wrap="nowrap">
              <ThemeIcon size={42} radius="md" variant="light" color="sbc"><IconShieldLock size={22} /></ThemeIcon>
              <div>
                <Text fw={700}>Modo TLS del borde</Text>
                <Text size="sm" c="dimmed">Cómo se cifra la señalización, según haya o no un proxy adelante.</Text>
              </div>
            </Group>
            <SegmentedControl fullWidth value={tlsModo} disabled={tlsBusy}
              onChange={(v) => aplicarTls(v)}
              data={[{ value: 'proxy', label: 'Detrás de un proxy' }, { value: 'nativo', label: 'TLS nativo (sin proxy)' }]} />
            <Alert mt="md" variant="light" color={tlsModo === 'nativo' ? 'teal' : 'blue'} icon={<IconInfoCircle size={16} />}>
              {tlsModo === 'nativo'
                ? <>El SBC hace su propio TLS: <b>SIP/TLS en el 5061</b> y <b>WSS (WebRTC) en el 8443</b>, con el certificado de Let&apos;s Encrypt de arriba (o uno autofirmado si aún no emitiste). Para entornos sin proxy inverso.</>
                : <>Un proxy inverso (NGINX / NPM) termina TLS y le reenvía <b>ws/sip en claro</b> al SBC; Kamailio no abre puertos TLS. Es el modo por defecto.</>}
            </Alert>
            {tlsBusy && <Group gap={8} mt="sm"><Loader size="xs" /><Text size="sm" c="dimmed">Aplicando y reiniciando el motor…</Text></Group>}
          </Card>

          {/* Configuración + emisión */}
          <Card withBorder radius="lg" p="lg">
            <Text fw={700} mb={4}>Configuración</Text>
            <Text size="sm" c="dimmed" mb="md">El dominio tiene que apuntar (DNS) a la IP pública de este equipo.</Text>

            <Group grow align="flex-start">
              <TextInput label="Dominio" placeholder="sbc.tuempresa.com" leftSection={<IconWorldWww size={16} />}
                value={f.domain} onChange={(e) => setF({ ...f, domain: e.currentTarget.value })} />
              <TextInput label="Email de la cuenta ACME" placeholder="ti@tuempresa.com" leftSection={<IconMail size={16} />}
                value={f.email} onChange={(e) => setF({ ...f, email: e.currentTarget.value })}
                description="Let's Encrypt lo usa para avisarte si un cert está por vencer." />
            </Group>

            <Text size="sm" fw={600} mt="lg" mb={6}>Cómo probamos que el dominio es tuyo</Text>
            <SegmentedControl fullWidth value={f.method} onChange={(v) => setF({ ...f, method: v })}
              data={[
                { value: 'http', label: (<Group gap={6} justify="center" wrap="nowrap"><IconWorldBolt size={15} /><span>HTTP-01 (puerto 80)</span></Group>) },
                { value: 'dns', label: (<Group gap={6} justify="center" wrap="nowrap"><IconServer size={15} /><span>DNS-01 (API del DNS)</span></Group>) },
              ]} />

            {f.method === 'http' ? (
              <Alert mt="md" color="blue" variant="light" icon={<IconInfoCircle size={18} />} title="HTTP-01 · el caso sin proxy">
                Let's Encrypt va a pegar a <Code>http://{f.domain || 'tu-dominio'}/.well-known/acme-challenge/…</Code> en el
                puerto <b>80</b>. Ese puerto tiene que llegar a este equipo (sin un proxy ni otro servicio ocupándolo). El SBC
                levanta un servidor temporal sólo durante la validación.
              </Alert>
            ) : (
              <Stack gap="sm" mt="md">
                <Alert color="grape" variant="light" icon={<IconInfoCircle size={18} />} title="DNS-01 · detrás de NAT o proxy">
                  El SBC crea un registro TXT en tu DNS a través de la API del proveedor. No necesita el puerto 80. Cargá las
                  credenciales de tu proveedor; se guardan cifradas en el equipo y sólo se usan al emitir.
                </Alert>
                <Select label="Proveedor de DNS" placeholder="Elegí tu proveedor" leftSection={<IconServer size={16} />}
                  value={f.dns_provider} onChange={(v) => setF({ ...f, dns_provider: v || '', dns_creds: {} })}
                  data={provs.map((p) => ({ value: p.id, label: p.label }))} />
                {provActual && (
                  <Group grow align="flex-start">
                    {provActual.vars.map((v) => (
                      <PasswordInput key={v} label={v} placeholder={tieneCreds ? '•••••••• (guardada)' : v}
                        value={f.dns_creds[v] || ''} onChange={(e) => setF({ ...f, dns_creds: { ...f.dns_creds, [v]: e.currentTarget.value } })} />
                    ))}
                  </Group>
                )}
              </Stack>
            )}

            <Divider my="lg" />
            <Group justify="space-between">
              <Button variant="default" leftSection={<IconDeviceFloppy size={16} />} loading={guardando} onClick={guardar}>
                Guardar configuración
              </Button>
              <Button color="teal" leftSection={<IconCertificate size={16} />} loading={emitiendo}
                onClick={() => emitir(false)}>
                {cert && cert.emitido ? 'Re-emitir certificado' : 'Emitir certificado'}
              </Button>
            </Group>

            {log && (
              <>
                <Button variant="subtle" size="xs" mt="md" leftSection={<IconTerminal2 size={14} />} onClick={() => setVerLog((v) => !v)}>
                  {verLog ? 'Ocultar' : 'Ver'} salida de acme.sh
                </Button>
                <Collapse in={verLog}>
                  <Code block mt="sm" style={{ maxHeight: 260, overflow: 'auto', fontSize: 11.5, whiteSpace: 'pre-wrap' }}>{log}</Code>
                </Collapse>
              </>
            )}
          </Card>

          <Alert color="gray" variant="light" icon={<IconAlertTriangle size={18} />}>
            El certificado se instala en el equipo y se <b>renueva solo</b> (una vez al día el SBC revisa si está por vencer).
            Si hay un proxy inverso adelante (Nginx Proxy Manager u otro), lo normal es que el certificado lo maneje el proxy —
            esta pantalla es justamente para cuando <b>no</b> hay proxy.
          </Alert>
        </Stack>
      )}
    </>
  );
}
