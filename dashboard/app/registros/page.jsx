'use client';
/* ============================================================================
 *  Extensiones SIP — las que se registran A TRAVÉS del borde.
 *
 *  Acá hay una confusión que vale aclarar de una vez: el SBC NO es el registrar.
 *  No guarda usuarios ni los autentica — eso lo hace la central. El SBC es un
 *  proxy: recibe el REGISTER del teléfono remoto, le arregla el NAT (contact
 *  alias) y se lo pasa a la central; si la central contesta 200, esa extensión
 *  está arriba y llega desde afuera sin exponer la central a internet.
 *
 *  Por eso `usrloc` está vacío por diseño. Lo que sí sabemos es lo que VIMOS
 *  pasar: cada REGISTER aceptado queda anotado con la IP real de donde vino, el
 *  teléfono que usa y a qué central fue. Es exactamente lo que el soporte necesita
 *  para contestar la pregunta de todos los días: "el 1004 dice que no le entran
 *  las llamadas".
 * ==========================================================================*/
import { useState } from 'react';
import {
  Card, Group, Text, Badge, Table, Stack, TextInput, Skeleton, ThemeIcon, Tooltip,
  ActionIcon, Alert, SimpleGrid, Switch, Button, Modal, PasswordInput, Divider, Code,
} from '@mantine/core';
import {
  IconWaveSine, IconSearch, IconDeviceMobile, IconDeviceDesktop, IconInfoCircle, IconTrash, IconWorld, IconServer2,
  IconShieldLock, IconUserPlus, IconKey, IconPlugConnected, IconBolt,
} from '@tabler/icons-react';
import PageHeader from '../PageHeader';
import Slot from '../Slot';
import { usePoll, api } from '../api';
import { toast, toastPromise } from '../notify';

/* ── Registrar del borde (#182): el SBC termina y autentica el REGISTER ──────── */
function EdgeRegistrar() {
  const { data, recargar } = usePoll('/registrar', 0);
  const { data: cuentas, recargar: recCuentas } = usePoll('/registrar/accounts', 0);
  const { data: online } = usePoll('/registrar/online', 8000);
  const [on, setOn] = useState(null);
  const [realm, setRealm] = useState(null);
  const [mf, setMf] = useState(null);
  const [aplicando, setAplicando] = useState(false);
  const [nuevo, setNuevo] = useState(null);   // {username, password, descripcion}
  const [guardando, setGuardando] = useState(false);

  // estado local que arranca del servidor
  const onEff = on === null ? !!(data && data.on) : on;
  const realmEff = realm === null ? ((data && data.realm) || '') : realm;
  const mfEff = mf === null ? !!(data && data.multiflujo) : mf;
  const lista = Array.isArray(cuentas) ? cuentas : [];
  const enLinea = Array.isArray(online) ? online : [];

  const aplicar = async () => {
    setAplicando(true);
    try {
      await toastPromise(
        api('/registrar', { method: 'PUT', body: { on: onEff, realm: realmEff, multiflujo: mfEff } })
          .then(() => api('/registrar/apply', { method: 'POST' }))
          .then((r) => { if (r && r.error) throw new Error(r.error); recargar(); }),
        { loading: 'Aplicando en el motor (con validación y rollback)…',
          success: onEff ? 'Registrar del borde activo' : 'Registrar del borde apagado',
          error: (e) => e.message || 'No se pudo aplicar' });
    } catch (_) {} finally { setAplicando(false); }
  };

  const crear = async () => {
    if (!nuevo || !nuevo.username || (nuevo.password || '').length < 4) { toast('Usuario y clave (≥4) requeridos', 'bad'); return; }
    setGuardando(true);
    try {
      await toastPromise(
        api('/registrar/accounts', { method: 'POST', body: nuevo }).then(() => { recCuentas(); recargar(); }),
        { loading: 'Creando cuenta…', success: `Cuenta ${nuevo.username} creada`, error: (e) => e.message || 'No se pudo crear' });
      setNuevo(null);
    } catch (_) {} finally { setGuardando(false); }
  };

  const borrar = (u) => toastPromise(
    api(`/registrar/accounts/${u}`, { method: 'DELETE' }).then(() => { recCuentas(); recargar(); }),
    { loading: 'Borrando…', success: `${u} borrada`, error: 'No se pudo borrar' });

  return (
    <Card p="lg" className="sbc-fade-in" withBorder>
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Group gap={10}>
          <ThemeIcon size={34} radius="md" variant="light" color={onEff ? 'teal' : 'gray'}><IconShieldLock size={19} /></ThemeIcon>
          <div>
            <Group gap={8}>
              <Text fw={700}>Registrar del borde</Text>
              <Badge size="sm" variant="light" color={onEff ? 'teal' : 'gray'}>{onEff ? 'activo' : 'apagado'}</Badge>
            </Group>
            <Text size="xs" c="dimmed">El SBC termina y autentica el REGISTER en el borde (digest), sin reenviarlo a la central.</Text>
          </div>
        </Group>
        <Switch size="lg" onLabel="ON" offLabel="OFF" checked={onEff} onChange={(e) => setOn(e.currentTarget.checked)} />
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mb="md">
        <TextInput label="Realm (dominio de autenticación)" description="Se usa para el digest. Cambiarlo invalida las claves ya creadas."
          leftSection={<IconWorld size={15} />} value={realmEff} onChange={(e) => setRealm(e.currentTarget.value)} placeholder="sbc.tuempresa.com" />
        <Group align="flex-end" gap="sm">
          <Button leftSection={<IconBolt size={16} />} loading={aplicando} onClick={aplicar} color={onEff ? 'teal' : 'gray'}>
            Aplicar al motor
          </Button>
          <Badge size="lg" variant="light" color="sbc" mb={4}><Slot value={enLinea.length} /> en el borde</Badge>
        </Group>
      </SimpleGrid>

      {/* RFC 5626. Sólo tiene sentido si el borde termina el registro. */}
      <Card withBorder radius="md" p="sm" mb="md"
        style={{ opacity: onEff ? 1 : 0.55, background: mfEff && onEff ? 'rgba(20,184,166,.05)' : undefined }}>
        <Group justify="space-between" wrap="nowrap" gap="md">
          <Group gap={10} wrap="nowrap">
            <ThemeIcon size={32} radius="md" variant="light" color={mfEff && onEff ? 'teal' : 'gray'}>
              <IconDeviceMobile size={18} />
            </ThemeIcon>
            <div>
              <Group gap={8}>
                <Text fw={600} fz="sm">Varios flujos por interno</Text>
                <Badge size="xs" variant="light" color="gray">RFC 5626</Badge>
              </Group>
              <Text fz="xs" c="dimmed">
                Sin esto, cada registro nuevo pisa el anterior: el celular que pasa de wifi a
                datos deja de recibir llamadas hasta que vuelve a registrarse. Con esto, el
                mismo interno sostiene varias conexiones a la vez y el borde usa la que esté viva.
              </Text>
            </div>
          </Group>
          <Switch size="md" onLabel="ON" offLabel="OFF" disabled={!onEff}
            checked={mfEff && onEff} onChange={(e) => setMf(e.currentTarget.checked)} />
        </Group>
        {!onEff && (
          <Text fz="xs" c="dimmed" mt={8}>Requiere el registrar del borde activo.</Text>
        )}
      </Card>

      {onEff && (
        <Alert variant="light" color="orange" radius="md" mb="md" icon={<IconInfoCircle size={16} />} p="xs">
          Con el registrar activo, los teléfonos deben apuntar su SIP al <b>SBC</b> y usar estas credenciales. La central deja de ver esos REGISTER.
        </Alert>
      )}

      {/* Cuentas SIP del borde */}
      <Group justify="space-between" mb="xs">
        <Text fw={600} size="sm">Cuentas SIP ({lista.length})</Text>
        <Button size="xs" variant="light" leftSection={<IconUserPlus size={14} />} onClick={() => setNuevo({ username: '', password: '', descripcion: '' })}>Nueva cuenta</Button>
      </Group>
      <Table verticalSpacing="xs" fz="sm">
        <Table.Thead>
          <Table.Tr><Table.Th>Usuario</Table.Th><Table.Th>Descripción</Table.Th><Table.Th>Clave</Table.Th><Table.Th>Estado</Table.Th><Table.Th w={44} /></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {lista.map((c) => {
            const viva = enLinea.some((o) => (o.aor || '').split('@')[0] === c.username);
            return (
              <Table.Tr key={c.username}>
                <Table.Td ff="monospace" fw={650}>{c.username}</Table.Td>
                <Table.Td fz="xs" c="dimmed">{c.descripcion || '—'}</Table.Td>
                <Table.Td>{c.tiene_clave ? <Badge size="xs" variant="light" color="teal" leftSection={<IconKey size={10} />}>set</Badge> : <Badge size="xs" variant="light" color="red">sin clave</Badge>}</Table.Td>
                <Table.Td><Badge size="sm" variant="dot" color={viva ? 'teal' : 'gray'}>{viva ? 'registrada' : 'sin señal'}</Badge></Table.Td>
                <Table.Td><Tooltip label="Borrar cuenta"><ActionIcon variant="subtle" color="red" onClick={() => borrar(c.username)}><IconTrash size={15} /></ActionIcon></Tooltip></Table.Td>
              </Table.Tr>
            );
          })}
          {lista.length === 0 && (
            <Table.Tr><Table.Td colSpan={5}><Text size="sm" c="dimmed" ta="center" py="md">Sin cuentas. Creá una para que un teléfono registre contra el borde.</Text></Table.Td></Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      {/* Modal alta de cuenta */}
      <Modal opened={!!nuevo} onClose={() => !guardando && setNuevo(null)} title="Nueva cuenta SIP del borde" centered radius="lg">
        {nuevo && (
          <Stack gap="sm">
            <TextInput label="Usuario" placeholder="1010" leftSection={<IconServer2 size={15} />}
              value={nuevo.username} onChange={(e) => setNuevo({ ...nuevo, username: e.currentTarget.value })} data-autofocus />
            <PasswordInput label="Clave" description="Se guarda como ha1 (no en claro)." leftSection={<IconKey size={15} />}
              value={nuevo.password} onChange={(e) => setNuevo({ ...nuevo, password: e.currentTarget.value })} />
            <TextInput label="Descripción (opcional)" placeholder="Softphone recepción"
              value={nuevo.descripcion} onChange={(e) => setNuevo({ ...nuevo, descripcion: e.currentTarget.value })} />
            <Text size="xs" c="dimmed">El teléfono registra como <Code>{nuevo.username || 'usuario'}@{realmEff || 'realm'}</Code> apuntando al SBC.</Text>
            <Group justify="flex-end" mt="xs">
              <Button variant="default" onClick={() => setNuevo(null)} disabled={guardando}>Cancelar</Button>
              <Button color="teal" leftSection={<IconUserPlus size={16} />} loading={guardando} onClick={crear}>Crear cuenta</Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Card>
  );
}

const hace = (s) => {
  if (s === null || s === undefined) return '—';
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
};

export default function Extensiones() {
  const { data, cargando, recargar } = usePoll('/registrations', 8000);
  const [q, setQ] = useState('');

  const todos = (data && data.registros) || [];
  const vivos = (data && data.vivos) || 0;
  const filas = q
    ? todos.filter((r) => (r.aor + ' ' + (r.ip_origen || '') + ' ' + (r.agente || '')).toLowerCase().includes(q.toLowerCase()))
    : todos;

  const olvidar = (r) => toastPromise(
    api(`/registrations/${r.id}`, { method: 'DELETE' }).then(recargar),
    { loading: 'Olvidando…', success: `${r.aor} borrada de la lista`, error: 'No se pudo borrar' });

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconWaveSine size={24} />}
        title="Extensiones SIP"
        subtitle="Teléfonos remotos que se registran a la central pasando por el borde"
        right={
          <Group gap="sm">
            <Badge size="lg" variant="light" color={vivos ? 'teal' : 'gray'}>
              <Slot value={vivos} /> en línea
            </Badge>
            <TextInput placeholder="Buscar extensión, IP o teléfono…" leftSection={<IconSearch size={15} />}
                       value={q} onChange={(e) => setQ(e.currentTarget.value)} w={280} />
          </Group>
        }
      />

      <EdgeRegistrar />

      <Divider label="Registros que pasan a la central (modo proxy)" labelPosition="center" />

      <Alert variant="light" color="sbc" radius="lg" icon={<IconInfoCircle size={18} />}>
        Cuando el registrar del borde está <b>apagado</b>, el SBC actúa de <b>proxy</b>: no guarda usuarios ni los autentica
        (eso lo hace la central), sólo pasa el REGISTER y arregla el NAT para que un teléfono remoto llegue sin exponer la
        central. Esta lista es lo que el borde <b>vio pasar</b>: cada registro que la central aceptó, con su IP real.
      </Alert>

      <Card p={0} className="sbc-fade-in">
        {cargando ? <Skeleton h={160} radius="lg" /> : (
          <Table highlightOnHover verticalSpacing="sm" fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Extensión</Table.Th><Table.Th>Estado</Table.Th><Table.Th>Viene de</Table.Th>
                <Table.Th>Teléfono</Table.Th><Table.Th>Central</Table.Th><Table.Th>Visto</Table.Th><Table.Th w={50} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filas.map((r) => { const soft = /sip\.?js|softphone|pbx-?ng|electron|zoiper|linphone|micro-?sip|bria|jitsi/i.test(r.agente || ''); return (
                <Table.Tr key={r.id}>
                  <Table.Td>
                    <Group gap={8} wrap="nowrap">
                      <Tooltip label={soft ? 'Softphone de escritorio' : 'Teléfono / equipo SIP'} withArrow>
                        <ThemeIcon size={28} radius="md" variant="light" color={r.vivo ? (soft ? 'grape' : 'sbc') : 'gray'}>
                          {soft ? <IconDeviceDesktop size={15} /> : <IconDeviceMobile size={15} />}
                        </ThemeIcon>
                      </Tooltip>
                      <div>
                        <Text fw={700} ff="monospace">{r.usuario || r.aor}</Text>
                        <Text size="10px" c="dimmed" ff="monospace" lineClamp={1} maw={220}>{r.aor}</Text>
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge size="sm" variant="dot" color={r.vivo ? 'teal' : 'gray'}>
                      {r.vivo ? 'registrada' : 'sin señal'}
                    </Badge>
                  </Table.Td>
                  <Table.Td ff="monospace" fz="xs">
                    <Group gap={5} wrap="nowrap">
                      <IconWorld size={13} opacity={0.5} />
                      {r.ip_origen}{r.puerto ? `:${r.puerto}` : ''}
                      {r.transporte && <Badge size="xs" variant="light" color="gray">{String(r.transporte).toUpperCase()}</Badge>}
                    </Group>
                  </Table.Td>
                  <Table.Td fz="xs">
                    <Tooltip label={r.agente || 'no informó User-Agent'} multiline w={300}>
                      <Text lineClamp={1} maw={200}>{r.agente || '—'}</Text>
                    </Tooltip>
                  </Table.Td>
                  <Table.Td fz="xs" ff="monospace" c="dimmed">
                    <Group gap={5} wrap="nowrap"><IconServer2 size={13} opacity={0.5} />{r.central || '—'}</Group>
                  </Table.Td>
                  <Table.Td fz="xs" c={r.vivo ? undefined : 'dimmed'}>{hace(r.hace_seg)}</Table.Td>
                  <Table.Td>
                    <Tooltip label="Olvidarla (se fue, o quedó colgada)">
                      <ActionIcon variant="subtle" color="red" onClick={() => olvidar(r)}><IconTrash size={15} /></ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              ); })}
              {filas.length === 0 && (
                <Table.Tr><Table.Td colSpan={7}>
                  <Stack align="center" py="xl" gap={6}>
                    <ThemeIcon size={46} radius="xl" variant="light" color="gray"><IconWaveSine size={24} /></ThemeIcon>
                    <Text fw={600}>{q ? 'Nada coincide con la búsqueda' : 'Ninguna extensión pasó por el borde todavía'}</Text>
                    <Text size="sm" c="dimmed" ta="center" maw={520}>
                      {q
                        ? 'Probá con otro término.'
                        : 'Cuando un teléfono remoto se registre apuntando al SBC (y la central lo acepte), aparece acá. Si esperabas ver extensiones, revisá que apunten al borde y no directo a la central.'}
                    </Text>
                  </Stack>
                </Table.Td></Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        )}
      </Card>
    </Stack>
  );
}
