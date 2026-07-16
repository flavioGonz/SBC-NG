'use client';
/* ============================================================================
 *  Reglas SIP — manipulación de cabeceras y normalización de números.
 *
 *  Dos familias, y conviene no mezclarlas:
 *
 *   · CABECERAS — lo que cada operador exige a su manera: quitar el Diversion que
 *     rechaza, forzar el From con SU dominio, poner el número real en el
 *     P-Asserted-Identity (RFC 3325).
 *
 *   · NORMALIZACIÓN — el trabajo sucio de la telefonía: la central marca "0 9x…",
 *     el operador quiere "+5989x…", y el que llama de afuera manda "00598…" que la
 *     central no entiende. Sin esto, cada alta de troncal termina en un dialplan
 *     lleno de parches.
 * ==========================================================================*/
import { useState } from 'react';
import {
  Card, Group, Text, Badge, Table, Stack, Button, Modal, Select, TextInput, NumberInput,
  Switch, Skeleton, ThemeIcon, Alert, ActionIcon, Tooltip, Code, Tabs, SimpleGrid,
} from '@mantine/core';
import {
  IconFilter, IconPlus, IconTrash, IconPlayerPlay, IconInfoCircle, IconArrowRight,
  IconArrowLeft, IconAlertTriangle, IconNumbers, IconTags, IconWand, IconCheck,
} from '@tabler/icons-react';
import PageHeader from '../PageHeader';
import Skel, { SkelFilas } from '../Skel';
import { usePoll, api } from '../api';
import { toast, toastPromise } from '../notify';

/* Cada acción, con para qué sirve en la vida real. */
const CABECERAS = [
  { value: 'quitar_header', label: 'Quitar cabecera', ayuda: 'Sacar una cabecera antes de mandar el mensaje. Típico: el Diversion que el operador rechaza.' },
  { value: 'agregar_header', label: 'Agregar cabecera', ayuda: 'Sumar una cabecera propia. Ej: X-Cliente para que el operador identifique la cuenta.' },
  { value: 'modificar_header', label: 'Modificar (regex)', ayuda: 'Buscar un patrón dentro de la cabecera y reemplazarlo.' },
  { value: 'set_from_user', label: 'Forzar el From-user', ayuda: 'Cambiar el usuario del From. Muchos operadores rechazan si no es un número de ellos.' },
  { value: 'set_pai', label: 'P-Asserted-Identity', ayuda: 'La identidad que el operador cree (RFC 3325). Casi siempre es donde va el número real del que llama.' },
  { value: 'set_ppi', label: 'P-Preferred-Identity', ayuda: 'La identidad que PEDIMOS mostrar; el operador decide si la respeta (RFC 3325).' },
  { value: 'set_diversion', label: 'Diversion (desvío)', ayuda: 'Quién desvió la llamada (RFC 5806). Para que el operador acepte un desvío hacia afuera.' },
];

const NORMALIZACION = [
  { value: 'strip', label: 'Sacar N dígitos del principio', ayuda: 'El clásico "sacale el 0 de salida". Valor = cuántos dígitos.' },
  { value: 'prefijo', label: 'Agregar un prefijo', ayuda: 'Pegar algo adelante del número: "0" hacia adentro, "+598" hacia afuera.' },
  { value: 'quitar_prefijo', label: 'Quitar un prefijo (si está)', ayuda: 'Saca ese prefijo SÓLO si el número lo tiene. No rompe a los que no lo traen.' },
  { value: 'e164', label: 'Normalizar a E.164', ayuda: 'Deja todo como +CC… : 00598→+598, 09x→+5989x, 9x→+5989x. Valor = el código de país (+598).' },
  { value: 'reescribir_ruri', label: 'Reescribir el número llamado', ayuda: 'Regex libre sobre el R-URI: a quién se llama.' },
  { value: 'reescribir_from', label: 'Reescribir el número que llama', ayuda: 'Regex libre sobre el From: el CallerID que ve el otro lado.' },
  { value: 'callerid_fijo', label: 'CallerID fijo', ayuda: 'Cuando el operador sólo acepta que salgas con un número de los suyos.' },
];

const TODAS = [...CABECERAS, ...NORMALIZACION];
const ayudaDe = (a) => (TODAS.find((x) => x.value === a) || {}).ayuda || '';
const nombreDe = (a) => (TODAS.find((x) => x.value === a) || {}).label || a;
const esNormalizacion = (a) => NORMALIZACION.some((x) => x.value === a);

const PIDE_HEADER = ['quitar_header', 'agregar_header', 'modificar_header'];
const PIDE_PATRON = ['modificar_header', 'quitar_prefijo', 'reescribir_ruri', 'reescribir_from'];
const SIN_VALOR = ['quitar_header', 'quitar_prefijo'];

const VACIA = { sentido: 'saliente', destino: 'todos', accion: 'strip', header: '', patron: '', valor: '', orden: 100, habilitada: true, notas: '' };

export default function Reglas() {
  const { data, cargando, recargar } = usePoll('/sip-rules', 15000);
  const { data: troncales } = usePoll('/trunks', 0);
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState(VACIA);

  const reglas = data || [];
  const { data: packs } = usePoll('/sip-rules/packs', 0);
  const [packsAbierto, setPacksAbierto] = useState(false);

  // Los packs no se aplican solos: agregan las reglas a la lista para que el tecnico
  // las revise, las ordene y despues toque Aplicar. Un pack que se autoaplica es una bomba.
  const ponerPack = (id) => toastPromise(
    api(`/sip-rules/packs/${id}`, { method: 'POST' }).then((r) => { setPacksAbierto(false); recargar(); return r; }),
    { loading: 'Agregando las reglas...', success: (r) => `${r.agregadas} regla(s) agregadas · revisalas y toca Aplicar`, error: (e) => e.message });
  const destinos = [{ value: 'todos', label: 'Todos los destinos' },
    ...((troncales || []).map((t) => ({ value: t.provider_host, label: `${t.name} (${t.provider_host})` })))];

  async function crear() {
    if (PIDE_HEADER.includes(f.accion) && !f.header) { toast('Falta el nombre de la cabecera', 'warn'); return; }
    if (PIDE_PATRON.includes(f.accion) && !f.patron) { toast('Falta el patrón a buscar', 'warn'); return; }
    if (!SIN_VALOR.includes(f.accion) && !f.valor) { toast('Falta el valor', 'warn'); return; }
    await toastPromise(
      api('/sip-rules', { method: 'POST', body: f }).then(() => { setAbierto(false); setF(VACIA); recargar(); }),
      { loading: 'Guardando la regla…', success: 'Regla creada (falta aplicar)', error: 'No se pudo crear' },
    );
  }

  const borrar = (id) => toastPromise(
    api(`/sip-rules/${id}`, { method: 'DELETE' }).then(recargar),
    { loading: 'Borrando…', success: 'Regla borrada (falta aplicar)', error: 'No se pudo borrar' });

  const aplicar = () => toastPromise(
    api('/sip-rules/apply', { method: 'POST' }).then(recargar),
    { loading: 'Generando la config y recargando el borde…', success: (r) => `Aplicadas ${r.reglas} regla(s)`, error: (e) => e.message });

  const tabla = (sentido) => {
    const rs = reglas.filter((r) => r.sentido === sentido);
    return (
      <Card p={0} className="sbc-tabin">
        <Table highlightOnHover verticalSpacing="sm" fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={60}>Orden</Table.Th><Table.Th>Qué hace</Table.Th><Table.Th>Detalle</Table.Th>
              <Table.Th>Se aplica a</Table.Th><Table.Th>Estado</Table.Th><Table.Th w={50} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rs.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td><Badge variant="light" color="gray" size="sm">{r.orden}</Badge></Table.Td>
                <Table.Td>
                  <Group gap={6} wrap="nowrap">
                    <ThemeIcon size={22} radius="md" variant="light" color={esNormalizacion(r.accion) ? 'grape' : 'sbc'}>
                      {esNormalizacion(r.accion) ? <IconNumbers size={12} /> : <IconTags size={12} />}
                    </ThemeIcon>
                    <div>
                      <Tooltip label={ayudaDe(r.accion)} multiline w={320}>
                        <Text fw={650} size="sm">{nombreDe(r.accion)}</Text>
                      </Tooltip>
                      {r.notas && <Text size="10px" c="dimmed">{r.notas}</Text>}
                    </div>
                  </Group>
                </Table.Td>
                <Table.Td ff="monospace" fz="xs">
                  {r.header && <Text span fw={700}>{r.header}</Text>}
                  {r.patron && <Text span c="dimmed"> /{r.patron}/</Text>}
                  {r.valor && <Text span c="dimmed"> → {r.valor}</Text>}
                </Table.Td>
                <Table.Td fz="xs">
                  {r.destino === 'todos'
                    ? <Badge size="sm" variant="light" color="gray">todos</Badge>
                    : <Code fz="11px">{r.destino}</Code>}
                </Table.Td>
                <Table.Td>
                  <Badge size="sm" variant="light" color={r.habilitada ? 'teal' : 'gray'}>
                    {r.habilitada ? 'activa' : 'apagada'}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Tooltip label="Borrar">
                    <ActionIcon variant="subtle" color="red" onClick={() => borrar(r.id)}><IconTrash size={15} /></ActionIcon>
                  </Tooltip>
                </Table.Td>
              </Table.Tr>
            ))}
            {rs.length === 0 && (
              <Table.Tr><Table.Td colSpan={6}>
                <Stack align="center" py="xl" gap={6}>
                  <ThemeIcon size={44} radius="xl" variant="light" color="gray"><IconFilter size={22} /></ThemeIcon>
                  <Text fw={600}>Sin reglas {sentido === 'saliente' ? 'de salida' : 'de entrada'}</Text>
                  <Text size="sm" c="dimmed" ta="center" maw={520}>
                    El SIP pasa tal cual. Está bien hasta que un operador se queje de una cabecera o rechace tu
                    numeración: ahí, en vez de tocar el kamailio.cfg, se agrega una regla acá.
                  </Text>
                </Stack>
              </Table.Td></Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Card>
    );
  };

  if (cargando) return <SkelFilas filas={6} />;

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconFilter size={24} />}
        title="Reglas SIP"
        subtitle="Cabeceras y normalización de números: lo que cada operador exige a su manera"
        right={
          <Group gap="sm">
            <Button variant="light" leftSection={<IconWand size={16} />} onClick={() => setPacksAbierto(true)}>
              Reglas recomendadas
            </Button>
            <Button variant="default" leftSection={<IconPlus size={16} />} onClick={() => setAbierto(true)}>Nueva regla</Button>
            <Button color="orange" leftSection={<IconPlayerPlay size={16} />} onClick={aplicar}>Aplicar</Button>
          </Group>
        }
      />

      <Alert variant="light" color="sbc" radius="lg" icon={<IconInfoCircle size={18} />}>
        Las reglas se traducen a configuración de Kamailio y se aplican recargando el motor. Guardarlas no alcanza:
        hasta que no toques <b>Aplicar</b>, el borde sigue mandando el SIP como antes. El <b>orden</b> importa —
        primero se saca el 0 de salida, después se agrega el +598, no al revés.
      </Alert>

      <Tabs defaultValue="saliente" variant="pills" radius="md">
        <Tabs.List mb="md">
          <Tabs.Tab value="saliente" leftSection={<IconArrowRight size={15} />}>Salientes (hacia el operador)</Tabs.Tab>
          <Tabs.Tab value="entrante" leftSection={<IconArrowLeft size={15} />}>Entrantes (hacia la central)</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="saliente">{tabla('saliente')}</Tabs.Panel>
        <Tabs.Panel value="entrante">{tabla('entrante')}</Tabs.Panel>
      </Tabs>

      {/* Packs: lo que uno termina escribiendo siempre, la primera semana, despues de que
          el operador rechaza una llamada por una cabecera que ni sabiamos que mandabamos. */}
      <Modal opened={packsAbierto} onClose={() => setPacksAbierto(false)} title="Reglas recomendadas" size="lg">
        <Stack gap="md">
          <Alert variant="light" color="sbc" radius="md" icon={<IconInfoCircle size={16} />}>
            Estas son las reglas que hacen que centrales de marcas distintas se entiendan. Se <b>agregan a la lista</b>
            {' '}—no se activan solas—: revisalas, ordenalas y despues toca Aplicar. Ya existentes no se duplican.
          </Alert>

          {(packs || []).map((p) => (
            <Card key={p.id} p="md" withBorder radius="lg" className="sbc-row">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <div style={{ flex: 1 }}>
                  <Group gap={8} mb={4}>
                    <ThemeIcon size={26} radius="md" variant="light" color="grape"><IconWand size={14} /></ThemeIcon>
                    <Text fw={700} size="sm">{p.nombre}</Text>
                    <Badge size="sm" variant="light" color="gray">{p.reglas} reglas</Badge>
                  </Group>
                  <Text size="xs" c="dimmed">{p.detalle}</Text>
                </div>
                <Button size="xs" variant="light" leftSection={<IconCheck size={14} />} onClick={() => ponerPack(p.id)}>
                  Agregar
                </Button>
              </Group>
            </Card>
          ))}
        </Stack>
      </Modal>

      <Modal opened={abierto} onClose={() => setAbierto(false)} title="Nueva regla SIP" size="lg">
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Select label="Sentido" description="Hacia dónde va el mensaje que se toca"
                    data={[{ value: 'saliente', label: 'Saliente (hacia el operador)' }, { value: 'entrante', label: 'Entrante (hacia la central)' }]}
                    value={f.sentido} onChange={(v) => setF({ ...f, sentido: v })} />
            <Select label="Se aplica a" description="Una troncal en particular, o todas"
                    data={destinos} value={f.destino} onChange={(v) => setF({ ...f, destino: v || 'todos' })} />
          </SimpleGrid>

          <Select
            label="Qué hace" description={ayudaDe(f.accion)}
            value={f.accion} onChange={(v) => setF({ ...f, accion: v, header: '', patron: '', valor: '' })}
            data={[
              { group: 'Normalización de números', items: NORMALIZACION.map(({ value, label }) => ({ value, label })) },
              { group: 'Manipulación de cabeceras', items: CABECERAS.map(({ value, label }) => ({ value, label })) },
            ]}
          />

          {PIDE_HEADER.includes(f.accion) && (
            <TextInput label="Cabecera" description="El nombre exacto, como viaja en el mensaje"
                       placeholder="P-Asserted-Identity" value={f.header}
                       onChange={(e) => setF({ ...f, header: e.currentTarget.value })} />
          )}
          {PIDE_PATRON.includes(f.accion) && (
            <TextInput label="Patrón a buscar"
                       description={f.accion === 'quitar_prefijo' ? 'El prefijo tal cual. Ej: 0' : 'Expresión regular. Ej: ^0'}
                       placeholder={f.accion === 'quitar_prefijo' ? '0' : '^0'}
                       value={f.patron} onChange={(e) => setF({ ...f, patron: e.currentTarget.value })} />
          )}
          {!SIN_VALOR.includes(f.accion) && (
            <TextInput
              label={f.accion === 'strip' ? 'Cuántos dígitos' : f.accion === 'e164' ? 'Código de país' : 'Valor'}
              description={
                f.accion === 'strip' ? 'Cuántos dígitos se sacan del principio. Ej: 1'
                : f.accion === 'e164' ? 'Con el +. Ej: +598'
                : f.accion === 'prefijo' ? 'Lo que se pega adelante. Ej: 0  ·  +598'
                : 'Texto, un número, o una variable de Kamailio ($fU es el usuario del From)'
              }
              placeholder={f.accion === 'strip' ? '1' : f.accion === 'e164' ? '+598' : ''}
              value={f.valor} onChange={(e) => setF({ ...f, valor: e.currentTarget.value })} />
          )}

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <NumberInput label="Orden" description="Menor = se ejecuta antes. El orden cambia el resultado."
                         value={f.orden} min={1} max={999} onChange={(v) => setF({ ...f, orden: v || 100 })} />
            <TextInput label="Nota" description="Para qué es esta regla" placeholder="sacar el 0 de salida"
                       value={f.notas} onChange={(e) => setF({ ...f, notas: e.currentTarget.value })} />
          </SimpleGrid>

          <Switch label="Activa" description="Podés dejarla apagada y prenderla cuando la vayas a probar"
                  checked={f.habilitada} onChange={(e) => setF({ ...f, habilitada: e.currentTarget.checked })} />

          <Alert variant="light" color="orange" radius="md" icon={<IconAlertTriangle size={16} />}>
            Tocar el SIP es tocar el estándar. Una regla mal puesta puede hacer que el operador rechace TODAS las
            llamadas — probala en una troncal antes de aplicarla a todas.
          </Alert>

          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={crear}>Crear regla</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
