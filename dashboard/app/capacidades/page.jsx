'use client';
/* ============================================================================
 *  Capacidades del motor — lo que Kamailio 6.1 y rtpengine mr13.5 habilitan.
 *
 *  Cada tarjeta es una capacidad nueva de los motores. Las que están ACTIVAS ya
 *  se configuran/usan desde el panel; las DISPONIBLES están en el motor y se
 *  encienden en un próximo release con el mismo mecanismo.
 * ==========================================================================*/
import { useState } from 'react';
import {
  Stack, Card, Group, Text, Badge, ThemeIcon, SimpleGrid, Code, Button, Alert,
  CopyButton, Tooltip, ScrollArea, Divider,
} from '@mantine/core';
import {
  IconRocket, IconChartDots3, IconShieldLock, IconPhoneCalling, IconServerBolt, IconArrowsExchange,
  IconGauge, IconCheck, IconCopy, IconExternalLink, IconActivity, IconClipboardCheck,
} from '@tabler/icons-react';
import PageHeader from '../PageHeader';
import { usePoll } from '../api';

const CAT = [
  { id: 'prom', motor: 'Kamailio 6.1', icon: IconChartDots3, color: 'teal', estado: 'activo',
    t: 'Métricas Prometheus', d: 'El motor expone sus estadísticas internas en formato Prometheus. Listas para Grafana o para el Resumen.' },
  { id: 'cac', motor: 'Kamailio 6.1', icon: IconPhoneCalling, color: 'teal', estado: 'activo',
    t: 'Control de admisión (CAC)', d: 'Tope de llamadas simultáneas por troncal (dialog profiles). Se configura por troncal en el campo «Máx. simultáneas»; al pasarse, el borde responde 503. 0 = sin límite.' },
  { id: 'oc', motor: 'Kamailio 6.1', icon: IconGauge, color: 'grape', estado: 'disponible',
    t: 'Overload Control (RFC 7339)', d: 'El SBC le baja el caudal a una central que se está ahogando, en vez de tumbarla. Se configura por central.' },
  { id: 'stir', motor: 'Kamailio 6.1', icon: IconShieldLock, color: 'blue', estado: 'activo',
    t: 'STIR/SHAKEN (secsipid)', d: 'Verificación y firma del header Identity (anti-spoofing del CallerID). Se configura en Diagnóstico → STIR/SHAKEN.' },
  { id: 'udp', motor: 'Kamailio 6.1', icon: IconServerBolt, color: 'orange', estado: 'disponible',
    t: 'UDP multi-hilo', d: 'Un receptor multi-hilo del 5060 → más llamadas/seg sin tocar el dialplan. Un toggle de rendimiento.' },
  { id: 'tcforce', motor: 'rtpengine mr13.5', icon: IconArrowsExchange, color: 'pink', estado: 'disponible',
    t: 'Transcoding force / ignore', d: 'Forzar un códec de salida o ignorar los que ofrece el operador, por troncal. Va en la modal de troncales.' },
  { id: 'rtpe', motor: 'rtpengine mr13.5', icon: IconActivity, color: 'cyan', estado: 'disponible',
    t: 'Estado real del motor de medios', d: 'Campo active + ping-timer: el estado del rtpengine reportado de primera mano, para pintarlo en la topología.' },
];

const badgeEstado = (e) => e === 'activo'
  ? <Badge color="teal" variant="filled" leftSection={<IconCheck size={11} />}>activo</Badge>
  : <Badge color="blue" variant="light">disponible</Badge>;

export default function Capacidades() {
  const { data } = usePoll('/observabilidad', 15000);
  const prom = (data && data.prometheus) || null;
  const [tab, setTab] = useState('todo');

  const grafana = `scrape_configs:
  - job_name: sbc-ng
    scheme: https
    metrics_path: ${prom ? prom.endpoint_grafana : '/backend/api/v1/prometheus'}
    authorization:
      credentials: <TOKEN_DE_LA_API_DEL_PANEL>
    static_configs:
      - targets: ['sbc.infratec.com.uy']`;

  return (
    <Stack gap="lg">
      <PageHeader icon={<IconRocket size={24} />} color="grape" title="Capacidades del motor"
        subtitle="Lo que habilitan Kamailio 6.1.3 y rtpengine mr13.5.1.19" />

      {/* Prometheus — la que ya está viva */}
      <Card withBorder radius="lg" p="lg" shadow="sm">
        <Group justify="space-between" mb="sm" wrap="nowrap">
          <Group gap={10} wrap="nowrap">
            <ThemeIcon size={44} radius="md" variant="light" color="teal"><IconChartDots3 size={24} /></ThemeIcon>
            <div>
              <Group gap={8}><Text fw={800}>Métricas Prometheus</Text>{badgeEstado('activo')}</Group>
              <Text size="sm" c="dimmed">El motor publica sus estadísticas internas en formato Prometheus, listas para Grafana.</Text>
            </div>
          </Group>
          <Badge size="lg" variant="light" color={prom && prom.activo ? 'teal' : 'gray'}>
            {prom && prom.activo ? `${prom.total_metricas} métricas` : '…'}
          </Badge>
        </Group>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <div>
            <Text size="xs" fw={700} c="dimmed" mb={4}>ENDPOINT DE SCRAPE (bajo el Bearer del panel)</Text>
            <Group gap={6} wrap="nowrap">
              <Code style={{ flex: 1 }}>{prom ? prom.endpoint_grafana : '/backend/api/v1/prometheus'}</Code>
              <CopyButton value={prom ? prom.endpoint_grafana : ''}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? 'Copiado' : 'Copiar'}>
                    <Button size="compact-sm" variant="light" color={copied ? 'teal' : 'gray'} onClick={copy}>
                      {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                    </Button>
                  </Tooltip>
                )}
              </CopyButton>
            </Group>
            <Text size="xs" c="dimmed" mt={6}>
              Grafana / Prometheus lo scrapean con el token de la API del panel como <Code fz="10px">Authorization</Code>.
              Nunca queda expuesto a internet: el borde lo protege con un token interno.
            </Text>
          </div>

          <div>
            <Text size="xs" fw={700} c="dimmed" mb={4}>MUESTRA EN VIVO</Text>
            <ScrollArea h={120}>
              <Code block fz="10px">
                {prom && prom.muestra && prom.muestra.length
                  ? prom.muestra.join('\n')
                  : '# esperando métricas…'}
              </Code>
            </ScrollArea>
          </div>
        </SimpleGrid>

        <Divider my="md" label="Configuración de Grafana" labelPosition="left" />
        <Group justify="space-between" wrap="nowrap" mb={4}>
          <Text size="xs" c="dimmed">Pegá esto en tu <Code fz="10px">prometheus.yml</Code> (o el data source de Grafana):</Text>
          <CopyButton value={grafana}>
            {({ copied, copy }) => (
              <Button size="compact-xs" variant="light" color={copied ? 'teal' : 'gray'}
                leftSection={copied ? <IconCheck size={12} /> : <IconCopy size={12} />} onClick={copy}>
                {copied ? 'Copiado' : 'Copiar YAML'}
              </Button>
            )}
          </CopyButton>
        </Group>
        <Code block fz="10px">{grafana}</Code>
      </Card>

      {/* Catálogo del resto */}
      <div>
        <Text fw={700} mb={2}>Todo lo que habilitan los motores nuevos</Text>
        <Text size="sm" c="dimmed" mb="sm">
          Las <b>activas</b> ya se usan desde el panel. Las <b>disponibles</b> están en el motor y se encienden por release,
          con el mismo mecanismo de configuración del borde.
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {CAT.map((c) => (
            <Card key={c.id} withBorder radius="md" p="md" style={{ opacity: c.estado === 'activo' ? 1 : 0.96 }}>
              <Group justify="space-between" mb={6} wrap="nowrap">
                <ThemeIcon size={34} radius="md" variant="light" color={c.color}><c.icon size={19} /></ThemeIcon>
                {badgeEstado(c.estado)}
              </Group>
              <Text fw={700} size="sm" lh={1.2}>{c.t}</Text>
              <Badge size="xs" variant="light" color="gray" mt={4} mb={6}>{c.motor}</Badge>
              <Text size="xs" c="dimmed" lh={1.35}>{c.d}</Text>
            </Card>
          ))}
        </SimpleGrid>
      </div>

      <Alert variant="light" color="grape" radius="md" icon={<IconClipboardCheck size={18} />}>
        <Text size="sm">
          El detalle completo (qué gana cada una, esfuerzo y riesgo) está en <Code fz="11px">docs/CAPACIDADES-NUEVAS-MOTORES.md</Code>
          y <Code fz="11px">docs/EVALUACION-MOTORES-2026.md</Code>. Cada capacidad disponible es un release chico e independiente.
        </Text>
      </Alert>
    </Stack>
  );
}
