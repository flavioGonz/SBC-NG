'use client';
/* ============================================================================
 *  Motor SIP — los módulos de Kamailio y sus parámetros.
 *
 *  Kamailio tiene ~200 módulos. Acá hay una lista curada: los que un SBC de verdad
 *  usa. Ofrecerlos todos no sería potencia, sería una trampa — la mitad no aplica y
 *  varios necesitan tablas que no tenemos.
 *
 *  Lo importante: aplicar un módulo mal puesto NO rompe una pantalla. Deja el borde
 *  sin arrancar, o sea sin telefonía. Por eso el flujo tiene red:
 *
 *    1. se valida en un contenedor efímero (kamailio -c) sin tocar el que atiende
 *    2. si valida, se reinicia el motor
 *    3. si en 15 segundos el motor no contesta, se restaura la config anterior y se
 *       reinicia solo — rollback automático
 *
 *  Un panel que puede dejarte sin llamadas y no tiene marcha atrás no es un panel.
 * ==========================================================================*/
import { useState, useEffect } from 'react';
import {
  Card, Group, Text, Badge, Stack, Button, Switch, Skeleton, ThemeIcon, Alert, Modal,
  NumberInput, TextInput, Tooltip, Code, Divider, SimpleGrid, Accordion,
} from '@mantine/core';
import {
  IconEngine, IconDeviceFloppy, IconPlayerPlay, IconAlertTriangle, IconShieldLock,
  IconEye, IconInfoCircle, IconCheck, IconX,
} from '@tabler/icons-react';
import PageHeader from '../PageHeader';
import Skel, { SkelFilas } from '../Skel';
import { usePoll, api } from '../api';
import { toast, toastPromise } from '../notify';

const ICONO_GRUPO = {
  'Núcleo': 'sbc', 'Medios': 'grape', 'WebRTC': 'cyan',
  'Troncales': 'blue', 'Seguridad': 'red', 'Observabilidad': 'orange',
};

export default function Motor() {
  const { data, cargando, recargar } = usePoll('/engine/modules', 0);
  const [mods, setMods] = useState(null);
  const [sucio, setSucio] = useState(false);
  const [preview, setPreview] = useState(null);
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => { if (data && !sucio) setMods(data); }, [data, sucio]);
  // `mods` se llena en el useEffect (post-render): esperar solo a `cargando` deja un
  // render con mods=null y revienta el .map de abajo.
  if (cargando || !mods) return <SkelFilas filas={6} />;

  const setMod = (id, campo, valor) => {
    setSucio(true);
    setMods((xs) => xs.map((m) => (m.id === id ? { ...m, [campo]: valor } : m)));
  };
  const setParam = (id, k, valor) => {
    setSucio(true);
    setMods((xs) => xs.map((m) => (m.id === id
      ? { ...m, params: m.params.map((p) => (p.k === k ? { ...p, valor } : p)) }
      : m)));
  };

  const cuerpo = () => ({
    modulos: mods.map((m) => ({
      id: m.id,
      habilitado: !!m.habilitado,
      params: Object.fromEntries((m.params || []).map((p) => [p.k, p.valor])),
    })),
  });

  const guardar = () => toastPromise(
    api('/engine/modules', { method: 'PUT', body: cuerpo() }).then(() => { setSucio(false); recargar(); }),
    { loading: 'Guardando…', success: 'Guardado. Falta aplicar.', error: (e) => e.message });

  const verPreview = async () => {
    try {
      const r = await fetch('/backend/api/v1/engine/preview');
      setPreview(await r.text());
    } catch (e) { toast('No se pudo generar la vista previa', 'bad'); }
  };

  async function aplicar() {
    setAplicando(true);
    try {
      const r = await api('/engine/apply', { method: 'POST' });
      toast('Motor recargado con la configuración nueva', 'ok', { description: 'Validada antes de aplicar.' });
      recargar();
    } catch (e) {
      // El backend distingue dos fracasos, y no son lo mismo: "no validó" (no se tocó
      // nada) vs "no levantó" (se volvió sola a la anterior).
      toast('No se aplicó', 'bad', { description: e.message, duration: 9000 });
    } finally { setAplicando(false); }
  }

  const grupos = Object.keys(ICONO_GRUPO).filter((g) => mods.some((m) => m.grupo === g));

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconEngine size={24} />}
        title="Motor SIP"
        subtitle="Módulos de Kamailio y sus parámetros"
        right={
          <Group gap="sm">
            <Button variant="subtle" leftSection={<IconEye size={16} />} onClick={verPreview}>Ver la config</Button>
            <Button variant="default" leftSection={<IconDeviceFloppy size={16} />} onClick={guardar} disabled={!sucio}>
              Guardar
            </Button>
            <Button color="orange" leftSection={<IconPlayerPlay size={16} />} loading={aplicando} onClick={aplicar}>
              Validar y aplicar
            </Button>
          </Group>
        }
      />

      <Alert variant="light" color="orange" radius="lg" icon={<IconShieldLock size={18} />}>
        <Text size="sm" mb={4}>
          Esto no es una pantalla de preferencias: un módulo mal configurado deja el borde <b>sin arrancar</b>, o sea
          sin telefonía. Por eso <b>Aplicar valida primero</b> en un contenedor aparte y, si el motor no vuelve a la
          vida en 15 segundos, <b>restaura solo la configuración anterior</b>.
        </Text>
        <Text size="sm">
          Los módulos marcados como <b>núcleo</b> no se pueden apagar: sin ellos no hay transacciones, no hay
          in-dialog y no hay a quién entregarle la llamada. Apagarlos sería apagar el producto.
        </Text>
      </Alert>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" style={{ alignItems: 'start' }}>
      {grupos.map((g) => (
        <Card key={g} p="lg" className="sbc-fade-in">
          <Group gap={9} mb="md">
            <ThemeIcon size={28} radius="md" variant="light" color={ICONO_GRUPO[g] || 'gray'}>
              <IconEngine size={15} />
            </ThemeIcon>
            <Text fw={700}>{g}</Text>
          </Group>

          <Stack gap="sm">
            {mods.filter((m) => m.grupo === g).map((m) => (
              <div key={m.id}>
                <Group justify="space-between" align="flex-start" wrap="nowrap" className="sbc-row">
                  <div style={{ flex: 1 }}>
                    <Group gap={8} mb={2}>
                      <Text fw={650} size="sm">{m.nombre}</Text>
                      <Code fz="10px">{m.id}</Code>
                      <Tooltip label={m.detalle} multiline w={320} withArrow position="top-start" events={{ hover: true, focus: true, touch: true }}>
                        <IconInfoCircle size={14} style={{ opacity: 0.45, cursor: "help" }} />
                      </Tooltip>
                      {m.nucleo && (
                        <Tooltip label="Sin este módulo el SBC no funciona: no se puede apagar">
                          <Badge size="xs" variant="light" color="sbc">núcleo</Badge>
                        </Tooltip>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">{m.detalle}</Text>
                  </div>
                  <Switch checked={!!m.habilitado} disabled={m.nucleo}
                          onChange={(e) => setMod(m.id, 'habilitado', e.currentTarget.checked)} />
                </Group>

                {/* los parámetros sólo tienen sentido si el módulo está prendido */}
                {m.habilitado && (m.params || []).length > 0 && (
                  <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm" mt="xs" ml="md" mb="sm">
                    {m.params.map((p) => (
                      p.tipo === 'int' ? (
                        <NumberInput key={p.k} size="xs" label={p.k} description={p.ayuda}
                                     value={p.valor} onChange={(v) => setParam(m.id, p.k, v)} />
                      ) : (
                        <TextInput key={p.k} size="xs" label={p.k} description={p.ayuda}
                                   value={p.valor || ''} onChange={(e) => setParam(m.id, p.k, e.currentTarget.value)} />
                      )
                    ))}
                  </SimpleGrid>
                )}
                <Divider my={4} />
              </div>
            ))}
          </Stack>
        </Card>
      ))}
      </SimpleGrid>

      <Modal opened={preview !== null} onClose={() => setPreview(null)} title="Esto es lo que se le va a dar al motor" size="lg">
        <Alert variant="light" color="sbc" radius="md" icon={<IconInfoCircle size={16} />} mb="md">
          Es el fragmento que Kamailio va a importar. Se valida antes de aplicarse: si tiene un error, no se toca nada.
        </Alert>
        <Code block fz="11px">{preview}</Code>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setPreview(null)}>Cerrar</Button>
        </Group>
      </Modal>
    </Stack>
  );
}
