'use client';
/* ============================================================================
 *  Transcoding — quién habla con quién, con qué códec, y quién está traduciendo.
 *
 *  El transcoding es lo que hace que un softphone WebRTC (Opus) pueda hablar con un
 *  operador que sólo entiende G.729. Sin él, esa llamada da 488 y no existe. Pero
 *  traducir cuesta CPU y el equipo no avisa: un día el audio empieza a cortarse.
 *
 *  Por eso esta pantalla no es un switch: es un mapa en vivo de cada llamada con
 *  medios — origen, destino, el códec de cada punta, y si en el medio rtpengine está
 *  traduciendo (animado, para que se vea) o dejando pasar el audio tal cual.
 * ==========================================================================*/
import {
  Card, Group, Text, Badge, Stack, ThemeIcon, Alert, SimpleGrid, Progress,
  Tooltip, Code, Skeleton,
} from '@mantine/core';
import {
  IconRefresh, IconAlertTriangle, IconArrowsExchange, IconCpu, IconWaveSine, IconInfoCircle,
  IconArrowRight, IconPhone,
} from '@tabler/icons-react';
import PageHeader from '../PageHeader';
import Slot from '../Slot';
import { usePoll } from '../api';

const CODECS = [
  { nombre: 'PCMU', alias: 'G.711 μ-law', kbps: 64, nota: 'El de siempre. Sin compresión: suena bien y no cuesta CPU.' },
  { nombre: 'PCMA', alias: 'G.711 A-law', kbps: 64, nota: 'Igual que el anterior, pero es el estándar en Europa y Uruguay.' },
  { nombre: 'G722', alias: 'G.722 (HD)', kbps: 64, nota: 'Banda ancha: se escucha notablemente mejor. Cada vez más teléfonos lo hablan.' },
  { nombre: 'G729', alias: 'G.729', kbps: 8, nota: 'Comprimido. Lo piden los operadores viejos y los enlaces flacos; traducirlo cuesta.' },
  { nombre: 'opus', alias: 'Opus', kbps: 24, nota: 'El de WebRTC. Excelente calidad; ninguna central vieja lo entiende.' },
];
const color = (c) => ({ PCMU: 'blue', PCMA: 'blue', G722: 'teal', G729: 'orange', opus: 'grape' }[String(c)] || 'gray');
const fmtDur = (s) => {
  if (!s && s !== 0) return null;
  const m = Math.floor(s / 60), ss = s % 60;
  return `${m}:${String(ss).padStart(2, '0')}`;
};

function Kpi({ label, value, sufijo, color: c = 'sbc', icon, hint }) {
  return (
    <Card p="md" className="sbc-panel-accent sbc-fade-in" style={{ '--acc': `var(--mantine-color-${c}-5)` }}>
      <Group justify="space-between" wrap="nowrap">
        <div>
          <Text size="11px" fw={700} tt="uppercase" c="dimmed">{label}</Text>
          <Group gap={5} align="baseline" mt={5}>
            <Text fw={800} fz={26} lh={1}><Slot value={value} /></Text>
            {sufijo && <Text size="xs" c="dimmed" fw={600}>{sufijo}</Text>}
          </Group>
          {hint && <Text size="10px" c="dimmed" mt={3}>{hint}</Text>}
        </div>
        <ThemeIcon size={38} radius="md" variant="light" color={c}>{icon}</ThemeIcon>
      </Group>
    </Card>
  );
}

/* Los chips de códec de una punta. */
function Codecs({ lista }) {
  const cs = lista || [];
  if (!cs.length) return <Text size="xs" c="dimmed">—</Text>;
  return (
    <Group gap={4} wrap="wrap">
      {cs.map((c) => <Badge key={c} size="sm" variant="light" color={color(c)}>{c}</Badge>)}
    </Group>
  );
}

/* El conector del medio: si transcodifica, dos flechas cruzadas girando y una línea
   con puntos que fluyen; si pasa directo, una flecha quieta. */
function Flujo({ transcodifica }) {
  if (transcodifica) {
    return (
      <div className="tc-flujo tc-flujo-on" title="rtpengine está traduciendo el audio">
        <span className="tc-linea" />
        <ThemeIcon size={30} radius="xl" variant="filled" color="grape" className="tc-spin">
          <IconArrowsExchange size={16} />
        </ThemeIcon>
        <span className="tc-linea" />
      </div>
    );
  }
  return (
    <div className="tc-flujo" title="paso directo: mismo códec, sin traducir">
      <span className="tc-linea tc-linea-quieta" />
      <ThemeIcon size={26} radius="xl" variant="light" color="teal"><IconArrowRight size={14} /></ThemeIcon>
      <span className="tc-linea tc-linea-quieta" />
    </div>
  );
}

function Punta({ numero, codecs, alinear }) {
  return (
    <div style={{ textAlign: alinear, minWidth: 0 }}>
      <Group gap={5} justify={alinear === 'right' ? 'flex-end' : 'flex-start'} wrap="nowrap">
        <ThemeIcon size={22} radius="md" variant="light" color="sbc"><IconPhone size={12} /></ThemeIcon>
        <Text fw={700} size="sm" ff="monospace" truncate>{numero || '—'}</Text>
      </Group>
      <div style={{ marginTop: 5, display: 'flex', justifyContent: alinear === 'right' ? 'flex-end' : 'flex-start' }}>
        <Codecs lista={codecs} />
      </div>
    </div>
  );
}

export default function Transcoding() {
  const { data, cargando } = usePoll('/media/live', 4000);

  const sesiones = (data && data.sesiones) || [];
  const total = (data && data.total) || 0;
  const traduciendo = (data && data.transcodificando) || 0;
  const alerta = !!(data && data.alerta);
  const carga = total ? Math.round((traduciendo / total) * 100) : 0;

  return (
    <Stack gap="lg">
      <style>{`
        .tc-call { position: relative; overflow: hidden; }
        .tc-call.on::before {
          content: ''; position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(90deg, transparent, rgba(124,58,237,.10), transparent);
          background-size: 220% 100%; animation: tcSweep 2.2s linear infinite;
        }
        @keyframes tcSweep { to { background-position: -220% 0; } }
        .tc-flujo { display: flex; align-items: center; gap: 6px; min-width: 120px; justify-content: center; }
        .tc-linea { flex: 1; height: 2px; border-radius: 2px;
          background-image: linear-gradient(90deg, var(--mantine-color-grape-5) 0 6px, transparent 6px 12px);
          background-size: 12px 2px; animation: tcDots .7s linear infinite; }
        .tc-linea-quieta { background-image: linear-gradient(90deg, var(--mantine-color-teal-4) 0 6px, transparent 6px 12px); animation: none; opacity: .6; }
        @keyframes tcDots { to { background-position: 12px 0; } }
        .tc-spin { animation: tcSpin 2.4s linear infinite; }
        @keyframes tcSpin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .tc-call.on::before, .tc-linea, .tc-spin { animation: none; }
        }
      `}</style>

      <PageHeader
        icon={<IconArrowsExchange size={24} />}
        title="Transcoding"
        subtitle="Qué está traduciendo el motor de medios en este momento"
        right={
          <Badge size="lg" variant="light" color={traduciendo ? 'grape' : 'gray'}
                 className={traduciendo ? 'sbc-pulse' : undefined}>
            {traduciendo ? `${traduciendo} traduciendo` : 'sin transcoding'}
          </Badge>
        }
      />

      {alerta && (
        <Alert color="orange" variant="light" radius="lg" icon={<IconAlertTriangle size={18} />}>
          Hay <b>{traduciendo}</b> llamadas transcodificando a la vez. Cada una consume CPU de verdad: si el equipo es
          modesto, es el momento de mirar la carga <b>antes</b> de que se note en el audio. La forma de bajarlo es
          alinear los códecs de la troncal con los de la central, para que no haya nada que traducir.
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        {cargando ? [0, 1, 2].map((i) => <Skeleton key={i} h={96} radius="lg" />) : (
          <>
            <Kpi label="Llamadas con audio" value={total} icon={<IconWaveSine size={19} />} hint="sesiones vivas en rtpengine" />
            <Kpi label="Transcodificando" value={traduciendo} color={traduciendo ? 'grape' : 'gray'}
                 icon={<IconArrowsExchange size={19} />} hint="las dos puntas no hablan el mismo códec" />
            <Kpi label="Proporción" value={carga} sufijo="%" color={carga > 50 ? 'orange' : 'teal'}
                 icon={<IconCpu size={19} />} hint="cuánto del tráfico hay que traducir" />
          </>
        )}
      </SimpleGrid>

      {total > 0 && (
        <Card p="lg" className="sbc-fade-in">
          <Group justify="space-between" mb={6}>
            <Text fw={700} size="sm">Carga de traducción</Text>
            <Text size="xs" c="dimmed">{traduciendo} de {total} llamadas</Text>
          </Group>
          <Progress value={carga} color={carga > 50 ? 'orange' : 'grape'} size="lg" radius="xl" animated={traduciendo > 0} />
        </Card>
      )}

      {/* ── llamadas en vivo, cada una como una tira animada ────────────────── */}
      <Card p="lg" className="sbc-fade-in">
        <Group gap={9} mb="md">
          <ThemeIcon size={30} radius="md" variant="light" color="grape"><IconRefresh size={17} /></ThemeIcon>
          <Text fw={700}>Llamadas con medios activos</Text>
          <Text size="xs" c="dimmed">origen y destino salen de la señalización; los códecs, de rtpengine</Text>
        </Group>

        {cargando ? <Skeleton h={160} radius="lg" /> : sesiones.length === 0 ? (
          <Stack align="center" py="xl" gap={6}>
            <ThemeIcon size={46} radius="xl" variant="light" color="gray"><IconWaveSine size={24} /></ThemeIcon>
            <Text fw={600}>No hay llamadas con audio en curso</Text>
            <Text size="sm" c="dimmed">Cuando entre una llamada vas a ver acá quién habla con quién y con qué códec.</Text>
          </Stack>
        ) : (
          <Stack gap="sm">
            {sesiones.map((s) => {
              const [a, b] = s.puntas || [];
              const trad = s.transcodifica;
              return (
                <Card key={s.call_id} withBorder radius="md" p="md"
                      className={`tc-call ${trad ? 'on' : ''}`}
                      style={{ borderColor: trad ? 'var(--mantine-color-grape-4)' : undefined }}>
                  <Group justify="space-between" wrap="nowrap" gap="md">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Punta numero={s.origen} codecs={a ? a.codecs : []} alinear="left" />
                    </div>
                    <Flujo transcodifica={trad} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Punta numero={s.destino} codecs={b ? b.codecs : []} alinear="right" />
                    </div>
                  </Group>
                  <Group justify="space-between" mt="sm" pt="sm" style={{ borderTop: '1px solid light-dark(#eef1f7, rgba(120,130,150,.12))' }}>
                    <Group gap={8}>
                      {trad === null
                        ? <Badge size="sm" variant="light" color="gray">no determinado</Badge>
                        : trad
                          ? <Badge size="sm" variant="filled" color="grape" leftSection={<IconArrowsExchange size={11} />}>traduciendo</Badge>
                          : <Badge size="sm" variant="light" color="teal">paso directo · mismo códec</Badge>}
                      {fmtDur(s.duracion) && <Text size="xs" c="dimmed" ff="monospace">⏱ {fmtDur(s.duracion)}</Text>}
                    </Group>
                    <Group gap={12}>
                      <Text size="xs" c="dimmed">{s.paquetes ? `${s.paquetes.toLocaleString('es-UY')} paq.` : ''}</Text>
                      <Tooltip label={s.call_id}><Code fz="10px">{String(s.call_id).slice(0, 14)}…</Code></Tooltip>
                    </Group>
                  </Group>
                </Card>
              );
            })}
          </Stack>
        )}
      </Card>

      {/* ── qué sabe traducir el motor ──────────────────────────────────── */}
      <Card p="lg" className="sbc-fade-in">
        <Group gap={9} mb="md">
          <ThemeIcon size={30} radius="md" variant="light" color="cyan"><IconInfoCircle size={17} /></ThemeIcon>
          <Text fw={700}>Códecs que el motor sabe traducir</Text>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
          {CODECS.map((c) => (
            <Card key={c.nombre} withBorder radius="md" p="sm">
              <Group gap={8} mb={4}>
                <Badge variant="light" color={color(c.nombre)}>{c.nombre}</Badge>
                <Text fw={650} size="sm">{c.alias}</Text>
                <Text size="10px" c="dimmed" ml="auto" ff="monospace">{c.kbps} kbps</Text>
              </Group>
              <Text size="xs" c="dimmed">{c.nota}</Text>
            </Card>
          ))}
        </SimpleGrid>

        <Alert variant="light" color="sbc" radius="md" mt="md" icon={<IconInfoCircle size={16} />}>
          El transcoding <b>se decide por troncal</b>: rtpengine traduce cuando los códecs que ofreciste en la troncal
          no coinciden con los de la central. Si querés que una troncal no transcodifique nunca, dejale los mismos
          códecs que habla la central (Troncales → Códecs). Los parámetros del motor —rango RTP, timeouts, log— están
          en Medios.
        </Alert>
      </Card>
    </Stack>
  );
}
