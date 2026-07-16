'use client';
/* ============================================================================
 *  STIR/SHAKEN — verificar y firmar el header Identity (anti-spoofing del
 *  CallerID). Verificar chequea la firma de lo que entra del operador; firmar
 *  agrega nuestra atestación a lo que originamos hacia el operador.
 *
 *  Guardar reinicia Kamailio con blindaje: el control-plane valida la config en
 *  un contenedor aparte y, si el motor no levanta, vuelve solo a la anterior.
 * ==========================================================================*/
import { useState, useEffect } from 'react';
import {
  Stack, Card, Group, Text, Badge, ThemeIcon, Button, TextInput, Switch, Alert,
  Divider, Loader, SegmentedControl, Textarea, Box, List,
} from '@mantine/core';
import {
  IconShieldLock, IconShieldCheck, IconSignature, IconInfoCircle, IconKey,
  IconCertificate, IconDeviceFloppy, IconAlertTriangle, IconWand, IconFingerprint,
} from '@tabler/icons-react';
import PageHeader from '../PageHeader';
import { usePoll, api } from '../api';
import { toast, toastPromise } from '../notify';

export default function Stir() {
  const { data, recargar } = usePoll('/stir', 0);
  const [f, setF] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [fp, setFp] = useState(null);

  useEffect(() => {
    if (data && !f) setF({
      verify: !!data.verify, sign: !!data.sign,
      attest: data.attest || 'A', x5u: data.x5u || '', key_pem: '',
      has_key: !!data.has_key,
    });
  }, [data]);

  if (!f) return <Group justify="center" py="xl"><Loader /></Group>;

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const generar = () => {
    setGenerando(true);
    toastPromise(
      api('/stir/genkey', { method: 'POST' }).then((r) => {
        setF((s) => ({ ...s, x5u: r.x5u || s.x5u, has_key: true, key_pem: '' }));
        setFp(r.fingerprint || null);
        return r;
      }).finally(() => setGenerando(false)),
      { loading: 'Generando par de claves EC (P-256)…', success: 'Par generado y certificado publicado', error: (e) => e.message || 'No se pudo generar' },
    );
  };

  const guardar = () => {
    if (f.sign && !f.x5u.trim()) { toast('Para firmar necesitás la URL pública del certificado (x5u)', 'warn'); return; }
    if (f.sign && !f.has_key && !f.key_pem.trim()) { toast('Para firmar necesitás cargar la clave privada (PEM)', 'warn'); return; }
    const cuerpo = { verify: f.verify, sign: f.sign, attest: f.attest, x5u: f.x5u };
    if (f.key_pem.trim()) cuerpo.key_pem = f.key_pem;
    setGuardando(true);
    toastPromise(
      api('/stir', { method: 'PUT', body: cuerpo }).then((r) => {
        setF((s) => ({ ...s, key_pem: '', has_key: s.has_key || !!s.key_pem }));
        recargar();
        return r;
      }).finally(() => setGuardando(false)),
      { loading: 'Aplicando y reiniciando el motor…', success: 'STIR/SHAKEN aplicado', error: (e) => e.message || 'No se pudo aplicar' },
    );
  };

  return (
    <Stack gap="lg">
      <PageHeader icon={<IconShieldLock size={24} />} title="STIR/SHAKEN"
        subtitle="Firma criptográfica del CallerID contra el spoofing (RFC 8224/8588)" />

      <Alert color="blue" variant="light" icon={<IconInfoCircle size={18} />} radius="md">
        El borde puede <b>verificar</b> el header <code>Identity</code> de las llamadas que entran del operador
        (detecta CallerID falsificado) y <b>firmar</b> el <code>Identity</code> de las que origina hacia el operador.
        El resultado de la verificación viaja hacia la central en el header <code>X-STIR-Verstat</code>.
      </Alert>

      {/* Verificación */}
      <Card withBorder radius="md" p="lg">
        <Group justify="space-between" align="flex-start">
          <Group gap={12} align="flex-start">
            <ThemeIcon size={42} radius="md" variant="light" color="teal"><IconShieldCheck size={24} /></ThemeIcon>
            <div style={{ maxWidth: 560 }}>
              <Group gap={8}><Text fw={700}>Verificar entrantes</Text>
                {f.verify ? <Badge color="teal" variant="filled">activo</Badge> : <Badge color="gray" variant="light">apagado</Badge>}
              </Group>
              <Text size="sm" c="dimmed" mt={4}>
                Chequea la firma del <code>Identity</code> de cada INVITE que llega del operador y etiqueta la llamada como
                <b> validada</b>, <b>fallida</b> o <b>sin firma</b>. No corta la llamada: sólo la marca para que la central decida.
              </Text>
            </div>
          </Group>
          <Switch size="lg" checked={f.verify} onChange={(e) => set('verify', e.currentTarget.checked)} />
        </Group>
      </Card>

      {/* Firma */}
      <Card withBorder radius="md" p="lg">
        <Group justify="space-between" align="flex-start" mb={f.sign ? 'md' : 0}>
          <Group gap={12} align="flex-start">
            <ThemeIcon size={42} radius="md" variant="light" color="blue"><IconSignature size={24} /></ThemeIcon>
            <div style={{ maxWidth: 560 }}>
              <Group gap={8}><Text fw={700}>Firmar salientes</Text>
                {f.sign ? <Badge color="blue" variant="filled">activo</Badge> : <Badge color="gray" variant="light">apagado</Badge>}
              </Group>
              <Text size="sm" c="dimmed" mt={4}>
                Agrega el header <code>Identity</code> con nuestra atestación a las llamadas que originamos hacia el operador,
                usando la clave privada y el certificado publicado en la URL <code>x5u</code>.
              </Text>
            </div>
          </Group>
          <Switch size="lg" checked={f.sign} onChange={(e) => set('sign', e.currentTarget.checked)} />
        </Group>

        {f.sign && (
          <>
            <Divider my="sm" />
            <Stack gap="md">
              <Box>
                <Text size="sm" fw={600} mb={6}>Nivel de atestación</Text>
                <SegmentedControl value={f.attest} onChange={(v) => set('attest', v)}
                  data={[
                    { label: 'A · plena', value: 'A' },
                    { label: 'B · parcial', value: 'B' },
                    { label: 'C · gateway', value: 'C' },
                  ]} />
                <Text size="xs" c="dimmed" mt={6}>
                  A: conocés al llamante y el número es suyo. B: conocés al llamante pero no el número. C: sólo estás pasando la llamada.
                </Text>
              </Box>
              <Card withBorder radius="sm" p="sm" bg="var(--mantine-color-default-hover)">
                <Group justify="space-between" wrap="nowrap">
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600}>Par de claves y certificado</Text>
                    <Text size="xs" c="dimmed">
                      {f.has_key ? 'Hay una clave cargada. El certificado se publica en la URL x5u de abajo.' : 'Generá un par EC (P-256) autofirmado: el SBC firma con la clave y publica el certificado.'}
                    </Text>
                    {fp && <Group gap={6} mt={4}><IconFingerprint size={13} /><Text size="xs" c="dimmed" style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{fp}</Text></Group>}
                  </div>
                  <Button variant="light" leftSection={<IconWand size={16} />} loading={generando} onClick={generar}>
                    {f.has_key ? 'Regenerar' : 'Generar par'}
                  </Button>
                </Group>
              </Card>
              <TextInput label="URL del certificado (x5u)" leftSection={<IconCertificate size={16} />}
                placeholder="https://sbc.tu-dominio.com/stir/cert.pem"
                value={f.x5u} onChange={(e) => set('x5u', e.currentTarget.value)}
                description="Va dentro del header Identity. El que verifica baja el certificado de acá." />
              <Textarea label={<Group gap={6}><IconKey size={15} /><span>Clave privada (PEM)</span>{f.has_key && <Badge size="xs" color="teal" variant="light">cargada</Badge>}</Group>}
                placeholder={f.has_key ? '•••••• clave ya cargada — pegá una nueva sólo si querés reemplazarla' : '-----BEGIN EC PRIVATE KEY-----\n...'}
                autosize minRows={3} maxRows={6} styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
                value={f.key_pem} onChange={(e) => set('key_pem', e.currentTarget.value)} />
            </Stack>
          </>
        )}
      </Card>

      <Alert color="orange" variant="light" icon={<IconAlertTriangle size={18} />} radius="md">
        Para que un operador externo confíe en tu firma, el certificado tiene que estar emitido por una
        <b> STI-CA</b> autorizada (cadena SHAKEN). Con un certificado propio la firma es válida entre nodos que
        confíen en tu cadena (ideal para enlaces internos y pruebas), pero la PSTN pública puede no aceptarla.
      </Alert>

      <Group justify="flex-end">
        <Button size="md" leftSection={<IconDeviceFloppy size={18} />} loading={guardando} onClick={guardar}>
          Guardar y aplicar
        </Button>
      </Group>
    </Stack>
  );
}
