'use client';
/* ============================================================================
 *  Ajustes del sistema — por ahora, el correo saliente del borde.
 *
 *  El SBC tiene cosas para avisar (una IP martillando el 5060, una troncal caída).
 *  Sin una salida de correo, esas alertas no salen de la pantalla. Acá se configura
 *  el SMTP que el panel usa para mandarlas.
 * ==========================================================================*/
import { useState, useEffect } from 'react';
import {
  Card, Group, Text, Stack, Button, TextInput, NumberInput, PasswordInput, Switch,
  SimpleGrid, ThemeIcon, Alert, Code, Badge,
} from '@mantine/core';
import {
  IconMail, IconDeviceFloppy, IconSend, IconInfoCircle, IconAdjustments,
} from '@tabler/icons-react';
import PageHeader from '../PageHeader';
import { SkelFilas } from '../Skel';
import { usePoll, api } from '../api';
import { toast, toastPromise } from '../notify';

export default function Ajustes() {
  const { data, cargando, recargar } = usePoll('/email', 0);
  const [f, setF] = useState(null);
  const [sucio, setSucio] = useState(false);
  const [test, setTest] = useState('');

  useEffect(() => { if (data && !sucio) setF(data); }, [data, sucio]);
  if (cargando || !f) return <SkelFilas filas={5} />;

  const set = (k, v) => { setSucio(true); setF((x) => ({ ...x, [k]: v })); };

  const guardar = () => toastPromise(
    api('/email', { method: 'PUT', body: f }).then(() => { setSucio(false); recargar(); }),
    { loading: 'Guardando…', success: 'Correo guardado', error: (e) => e.message });

  const probar = () => {
    if (!test.trim()) { toast('Escribí un destinatario', 'warn'); return; }
    return toastPromise(
      api('/email/test', { method: 'POST', body: { to: test.trim() } }),
      { loading: 'Enviando prueba…', success: 'Correo de prueba enviado', error: (e) => e.message });
  };

  return (
    <Stack gap="lg">
      <PageHeader icon={<IconAdjustments size={24} />} title="Ajustes del sistema" subtitle="Correo saliente del borde" />

      <Card p="lg" className="sbc-fade-in">
        <Group justify="space-between" mb="md">
          <Group gap={9}>
            <ThemeIcon size={30} radius="md" variant="light" color="sbc"><IconMail size={17} /></ThemeIcon>
            <div>
              <Text fw={700}>Servidor de correo (SMTP)</Text>
              <Text size="xs" c="dimmed">Por acá salen las alertas del SBC (seguridad, troncales, etc.)</Text>
            </div>
          </Group>
          <Group gap="sm">
            <Switch label="Correo activo" checked={!!f.enabled} onChange={(e) => set('enabled', e.currentTarget.checked)} />
            <Button leftSection={<IconDeviceFloppy size={16} />} onClick={guardar} disabled={!sucio}>Guardar</Button>
          </Group>
        </Group>

        <Alert mb="md" variant="light" color="sbc" radius="md" icon={<IconInfoCircle size={18} />}>
          <b>Gmail / Google Workspace:</b> si la cuenta tiene verificación en 2 pasos, la contraseña normal <b>no sirve</b>.
          Generá una <b>Contraseña de aplicación</b> en <Code fz="11px">myaccount.google.com/apppasswords</Code> y usá esa.
          Servidor <Code fz="11px">smtp.gmail.com</Code>, puerto <Code fz="11px">465</Code> con SSL/TLS directo.
        </Alert>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <TextInput label="Servidor SMTP" placeholder="smtp.gmail.com" value={f.host || ''}
                     onChange={(e) => set('host', e.currentTarget.value)} />
          <NumberInput label="Puerto" placeholder="587" value={f.port || 587} onChange={(v) => set('port', v || 587)} />
          <TextInput label="Usuario" placeholder="cuenta@empresa.com" value={f.username || ''}
                     onChange={(e) => set('username', e.currentTarget.value)} />
          <PasswordInput label="Contraseña" placeholder={f.tiene_password ? '•••••• (guardada)' : ''}
                         value={f.password || ''} onChange={(e) => set('password', e.currentTarget.value)} />
          <TextInput label="Remitente (From)" placeholder="SBC-NG <alertas@empresa.com>" value={f.from_addr || ''}
                     onChange={(e) => set('from_addr', e.currentTarget.value)} />
          <Switch label="SSL/TLS directo (465)" mt="lg" checked={!!f.secure}
                  onChange={(e) => set('secure', e.currentTarget.checked)} />
        </SimpleGrid>

        <Group justify="space-between" mt="lg" pt="md" style={{ borderTop: '1px solid light-dark(#eef1f7, rgba(120,130,150,.12))' }}>
          <Group gap="xs">
            <TextInput size="sm" placeholder="probar enviando a…" leftSection={<IconMail size={14} />}
                       value={test} onChange={(e) => setTest(e.currentTarget.value)} w={260} />
            <Button size="sm" variant="light" leftSection={<IconSend size={14} />} onClick={probar}>Probar</Button>
          </Group>
          {f.tiene_password && <Badge variant="light" color="teal">credencial guardada</Badge>}
        </Group>
      </Card>
    </Stack>
  );
}
