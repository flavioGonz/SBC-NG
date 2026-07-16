'use client';
/* ============================================================================
 *  SIP Debug — Troubleshoot.
 *
 *  Dos herramientas, y no son la misma:
 *
 *   · EN VIVO — el analizador. Cada mensaje SIP que cruza el borde, agrupado por
 *     llamada, con la escalera del diálogo dibujada y cada paso explicado. Es para
 *     ENTENDER: qué pasó, en qué orden, y quién cortó.
 *
 *   · PAQUETES — la captura a .pcap. Es para LLEVARSE la prueba: el archivo que se
 *     abre en Wireshark y que se le manda al operador cuando dice que no recibió nada.
 * ==========================================================================*/
import { Tabs, Stack } from '@mantine/core';
import { IconBug, IconWaveSine, IconPackage } from '@tabler/icons-react';
import PageHeader from '../PageHeader';
import SipLadder from '../SipLadder';
import PcapPanel from '../PcapPanel';

export default function Captura() {
  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconBug size={24} />}
        title="SIP Debug"
        subtitle="El analizador en vivo y la captura de paquetes"
      />

      <Tabs defaultValue="vivo" variant="pills" radius="md" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="vivo" leftSection={<IconWaveSine size={15} />}>Analizador en vivo</Tabs.Tab>
          <Tabs.Tab value="pcap" leftSection={<IconPackage size={15} />}>Paquetes (.pcap)</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="vivo"><SipLadder /></Tabs.Panel>
        <Tabs.Panel value="pcap"><PcapPanel /></Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
