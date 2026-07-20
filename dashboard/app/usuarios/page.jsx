'use client';
/* ============================================================================
 *  Usuarios del panel — alta, baja, edición y roles.
 *
 *  Tres roles: admin (todo, incluye gestionar usuarios), operador (opera el borde
 *  día a día) y lector (sólo mira). La pantalla es sólo para administradores; un
 *  operador o un lector no la ven en el menú ni pueden entrar por la API (el
 *  control-plane la protege con `soloAdmin`).
 *
 *  Dos candados de seguridad, del lado del servidor y repetidos acá para que la UI
 *  no ofrezca lo imposible: no se puede dejar el sistema sin ningún admin activo, ni
 *  borrarse a uno mismo.
 * ==========================================================================*/
import { useState, useEffect } from 'react';
import {
  Card, Group, Text, Badge, Table, Stack, Button, Modal, Select, TextInput,
  PasswordInput, Switch, ThemeIcon, Alert, ActionIcon, Tooltip, Divider,
} from '@mantine/core';
import {
  IconUsers, IconUserPlus, IconEdit, IconTrash, IconKey, IconShieldLock,
  IconInfoCircle, IconUserCheck, IconEye, IconAdjustments,
} from '@tabler/icons-react';
import PageHeader from '../PageHeader';
import { SkelFilas } from '../Skel';
import { api } from '../api';
import { toast, toastPromise } from '../notify';
import { useAuth } from '../auth';

const ROLES = [
  { value: 'admin',    label: 'Administrador', desc: 'Todo: configura el borde y gestiona usuarios.', color: 'grape',  icon: IconShieldLock },
  { value: 'operador', label: 'Operador',      desc: 'Opera el día a día: troncales, ruteo, seguridad. No gestiona usuarios.', color: 'blue', icon: IconAdjustments },
  { value: 'lector',   label: 'Solo lectura',  desc: 'Mira el panel y los reportes. No cambia nada.', color: 'gray', icon: IconEye },
];
const rolInfo = (r) => ROLES.find((x) => x.value === r) || ROLES[2];
const fmtFecha = (t) => t ? new Date(t).toLocaleString('es-UY', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

function RolSelect({ value, onChange, ...p }) {
  return (
    <Select
      label="Rol" value={value} onChange={onChange} allowDeselect={false} {...p}
      data={ROLES.map((r) => ({ value: r.value, label: r.label }))}
      renderOption={({ option }) => {
        const r = rolInfo(option.value);
        return (
          <Group gap={8} wrap="nowrap">
            <ThemeIcon size={26} radius="md" variant="light" color={r.color}><r.icon size={15} /></ThemeIcon>
            <div><Text size="sm" fw={600}>{r.label}</Text><Text size="10.5px" c="dimmed" lh={1.2}>{r.desc}</Text></div>
          </Group>
        );
      }}
    />
  );
}

export default function Usuarios() {
  const { user } = useAuth();
  const [users, setUsers] = useState(null);
  const [alta, setAlta] = useState(false);
  const [editar, setEditar] = useState(null);              // el usuario que se está editando
  const [miClave, setMiClave] = useState(false);
  const [f, setF] = useState({ username: '', nombre: '', password: '', role: 'operador' });
  const [ed, setEd] = useState({ nombre: '', role: 'operador', activo: true, password: '' });
  const [pw, setPw] = useState({ actual: '', nueva: '', repetir: '' });

  const cargar = () => api('/users').then(setUsers).catch((e) => { setUsers([]); toast(e.message, 'bad'); });
  useEffect(() => { cargar(); }, []);

  // Sólo un admin entra acá. Si un operador/lector llega por URL, se lo decimos claro.
  if (user && user.role && user.role !== 'admin') {
    return (
      <Stack>
        <PageHeader icon={<IconUsers size={24} />} color="grape" title="Usuarios" subtitle="Gestión de acceso al panel" />
        <Alert color="orange" variant="light" radius="md" icon={<IconShieldLock size={18} />}>
          Esta sección es sólo para administradores. Tu rol es <b>{rolInfo(user.role).label.toLowerCase()}</b>.
        </Alert>
      </Stack>
    );
  }

  const crear = () => toastPromise(
    api('/users', { method: 'POST', body: f }).then(() => { setAlta(false); setF({ username: '', nombre: '', password: '', role: 'operador' }); cargar(); }),
    { loading: 'Creando…', success: `Usuario ${f.username} creado`, error: (e) => e.message });

  const abrirEditar = (u) => { setEd({ nombre: u.nombre || '', role: u.role, activo: u.activo !== false, password: '' }); setEditar(u); };
  const guardarEditar = () => toastPromise(
    api(`/users/${editar.id}`, { method: 'PUT', body: ed }).then(() => { setEditar(null); cargar(); }),
    { loading: 'Guardando…', success: 'Usuario actualizado', error: (e) => e.message });

  const borrar = (u) => {
    if (!confirm(`¿Borrar al usuario "${u.username}"? Esta acción no se puede deshacer.`)) return;
    toastPromise(api(`/users/${u.id}`, { method: 'DELETE' }).then(cargar),
      { loading: 'Borrando…', success: `Usuario ${u.username} borrado`, error: (e) => e.message });
  };

  const cambiarMiClave = () => {
    if (pw.nueva !== pw.repetir) { toast('Las contraseñas nuevas no coinciden', 'warn'); return; }
    toastPromise(api('/me/password', { method: 'POST', body: { actual: pw.actual, nueva: pw.nueva } })
      .then(() => { setMiClave(false); setPw({ actual: '', nueva: '', repetir: '' }); }),
      { loading: 'Cambiando…', success: 'Tu contraseña se actualizó', error: (e) => e.message });
  };

  const admins = (users || []).filter((u) => u.role === 'admin' && u.activo !== false).length;

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconUsers size={24} />} color="grape"
        title="Usuarios" subtitle="Quién entra al panel y con qué permisos"
        right={
          <Group gap="sm">
            <Button variant="default" leftSection={<IconKey size={16} />} onClick={() => setMiClave(true)}>Mi contraseña</Button>
            <Button leftSection={<IconUserPlus size={16} />} onClick={() => setAlta(true)}>Nuevo usuario</Button>
          </Group>
        }
      />

      <Card p={0} className="sbc-fade-in">
        <Group p="lg" pb="sm" gap={9}>
          <ThemeIcon size={30} radius="md" variant="light" color="grape"><IconUserCheck size={17} /></ThemeIcon>
          <Text fw={700}>Usuarios del panel</Text>
          {users && <Badge size="sm" variant="light" color="gray">{users.length}</Badge>}
        </Group>

        {!users ? <SkelFilas filas={4} /> : (
          <Table highlightOnHover verticalSpacing="sm" fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Usuario</Table.Th><Table.Th>Nombre</Table.Th><Table.Th>Rol</Table.Th>
                <Table.Th>Estado</Table.Th><Table.Th>Último ingreso</Table.Th><Table.Th w={90} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {users.map((u) => {
                const r = rolInfo(u.role);
                const yo = user && user.username === u.username;
                return (
                  <Table.Tr key={u.id}>
                    <Table.Td>
                      <Group gap={8} wrap="nowrap">
                        <ThemeIcon size={30} radius="xl" variant="light" color={r.color}><r.icon size={15} /></ThemeIcon>
                        <Text fw={700} ff="monospace">{u.username}{yo && <Text span size="10px" c="dimmed" ml={6}>(vos)</Text>}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td c={u.nombre ? undefined : 'dimmed'}>{u.nombre || '—'}</Table.Td>
                    <Table.Td><Badge variant="light" color={r.color}>{r.label}</Badge></Table.Td>
                    <Table.Td>
                      <Badge size="sm" variant="dot" color={u.activo !== false ? 'teal' : 'red'}>
                        {u.activo !== false ? 'activo' : 'suspendido'}
                      </Badge>
                    </Table.Td>
                    <Table.Td fz="xs" c="dimmed" ff="monospace">{fmtFecha(u.last_login)}</Table.Td>
                    <Table.Td>
                      <Group gap={4} justify="flex-end" wrap="nowrap">
                        <Tooltip label="Editar rol, nombre, estado o contraseña">
                          <ActionIcon variant="subtle" color="gray" onClick={() => abrirEditar(u)}><IconEdit size={16} /></ActionIcon>
                        </Tooltip>
                        <Tooltip label={yo ? 'No podés borrarte a vos mismo' : 'Borrar usuario'}>
                          <ActionIcon variant="subtle" color="red" disabled={yo} onClick={() => borrar(u)}><IconTrash size={16} /></ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      <Alert variant="light" color="grape" radius="md" icon={<IconInfoCircle size={18} />}>
        <b>Roles.</b> <b>Administrador</b>: todo, incluye gestionar usuarios. <b>Operador</b>: opera el borde
        (troncales, ruteo, seguridad) pero no toca usuarios. <b>Solo lectura</b>: mira y exporta, no cambia nada.
        El sistema no te deja quedarte sin ningún administrador activo.
      </Alert>

      {/* ── nuevo usuario ──────────────────────────────────────────────── */}
      <Modal opened={alta} onClose={() => setAlta(false)} title="Nuevo usuario" radius="md">
        <Stack gap="md">
          <TextInput label="Usuario" description="Con el que inicia sesión (sin espacios)" placeholder="jperez" required
                     value={f.username} onChange={(e) => setF({ ...f, username: e.currentTarget.value.trim() })} />
          <TextInput label="Nombre para mostrar" description="Opcional" placeholder="Juan Pérez"
                     value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.currentTarget.value })} />
          <PasswordInput label="Contraseña" description="Mínimo 8 caracteres" required
                         value={f.password} onChange={(e) => setF({ ...f, password: e.currentTarget.value })} />
          <RolSelect value={f.role} onChange={(v) => setF({ ...f, role: v })} />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAlta(false)}>Cancelar</Button>
            <Button onClick={crear} disabled={!f.username || f.password.length < 8}>Crear usuario</Button>
          </Group>
        </Stack>
      </Modal>

      {/* ── editar usuario ─────────────────────────────────────────────── */}
      <Modal opened={!!editar} onClose={() => setEditar(null)} title={editar ? `Editar ${editar.username}` : ''} radius="md">
        {editar && (
          <Stack gap="md">
            <TextInput label="Nombre para mostrar" value={ed.nombre} onChange={(e) => setEd({ ...ed, nombre: e.currentTarget.value })} />
            <RolSelect value={ed.role} onChange={(v) => setEd({ ...ed, role: v })} />
            <Switch label="Usuario activo" description="Si lo suspendés, no puede iniciar sesión (pero no se borra)"
                    checked={ed.activo} onChange={(e) => setEd({ ...ed, activo: e.currentTarget.checked })} />
            <PasswordInput label="Nueva contraseña" description="Dejala en blanco para no cambiarla (mín. 8)"
                           value={ed.password} onChange={(e) => setEd({ ...ed, password: e.currentTarget.value })} />
            {editar.role === 'admin' && admins <= 1 && (
              <Alert variant="light" color="orange" radius="md" icon={<IconShieldLock size={16} />}>
                Es el único administrador activo: no vas a poder bajarle el rol ni suspenderlo hasta que haya otro.
              </Alert>
            )}
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setEditar(null)}>Cancelar</Button>
              <Button onClick={guardarEditar}>Guardar cambios</Button>
            </Group>
          </Stack>
        )}
      </Modal>

      {/* ── mi contraseña ──────────────────────────────────────────────── */}
      <Modal opened={miClave} onClose={() => setMiClave(false)} title="Cambiar mi contraseña" radius="md">
        <Stack gap="md">
          <PasswordInput label="Contraseña actual" value={pw.actual} onChange={(e) => setPw({ ...pw, actual: e.currentTarget.value })} />
          <Divider />
          <PasswordInput label="Contraseña nueva" description="Mínimo 8 caracteres" value={pw.nueva} onChange={(e) => setPw({ ...pw, nueva: e.currentTarget.value })} />
          <PasswordInput label="Repetir la nueva" value={pw.repetir} onChange={(e) => setPw({ ...pw, repetir: e.currentTarget.value })} />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setMiClave(false)}>Cancelar</Button>
            <Button onClick={cambiarMiClave} disabled={pw.nueva.length < 8 || !pw.actual}>Cambiar contraseña</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
