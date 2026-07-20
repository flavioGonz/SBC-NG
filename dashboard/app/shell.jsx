'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  AppShell, Group, NavLink, Text, Badge, ScrollArea, Box, Tooltip, ActionIcon, Collapse,
  useMantineColorScheme, useComputedColorScheme, Menu, Avatar, UnstyledButton, Divider,
} from '@mantine/core';
import {
  IconLayoutDashboard, IconShieldCheck, IconRouter, IconSitemap, IconArrowsLeftRight,
  IconServer2, IconPlugConnected, IconWaveSine, IconLogout, IconSun, IconMoon,
  IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconChevronRight,
  IconNetwork, IconFilter, IconArrowsExchange, IconEngine, IconBug, IconRouteAltLeft, IconMail, IconReceipt,
  IconBook, IconRocket, IconBellRinging, IconShieldLock, IconUsers, IconHash, IconCertificate, IconDatabaseExport,
} from '@tabler/icons-react';
import { useAuth, logout } from './auth';
import { usePoll } from './api';
import Logo from '../components/Logo';

/* Grupos con criterio de SBC de gama: MONITOR (lo que mira el de guardia), CONECTIVIDAD
 * (quien se conecta), SIP Y MEDIOS (como se procesa), SEGURIDAD (proteger), SISTEMA
 * (administrar la caja). Los items con countKey muestran un badge con el conteo real. */
const groups = [
  { label: 'Monitor', icon: IconLayoutDashboard, items: [
    { href: '/', label: 'Resumen', icon: IconLayoutDashboard },
    { href: '/topologia', label: 'Topología', icon: IconSitemap },
    { href: '/cdr', label: 'CDR del borde', icon: IconReceipt },
    { href: '/transcoding', label: 'Transcoding', icon: IconArrowsExchange, badge: 'transcoding' },
  ] },
  { label: 'Conectividad', icon: IconPlugConnected, items: [
    { href: '/centrales', label: 'Centrales PBX', icon: IconServer2, countKey: 'centrales' },
    { href: '/troncales', label: 'Troncales', icon: IconPlugConnected, countKey: 'troncales' },
    { href: '/ruteo', label: 'Ruteo de salida', icon: IconRouteAltLeft, countKey: 'rutas' },
    { href: '/dialplan', label: 'Traducción de números', icon: IconArrowsExchange },
    { href: '/registros', label: 'Extensiones SIP', icon: IconWaveSine, countKey: 'extensiones' },
  ] },
  { label: 'SIP y Medios', icon: IconArrowsExchange, items: [
    { href: '/reglas', label: 'Manipulación SIP', icon: IconFilter, countKey: 'reglas' },
    { href: '/motor', label: 'Motor SIP', icon: IconEngine },
    { href: '/medios', label: 'Medios · TURN/STUN', icon: IconWaveSine },
  ] },
  { label: 'Seguridad', icon: IconShieldCheck, items: [
    { href: '/seguridad', label: 'Intrusion Detection', icon: IconShieldCheck },
    { href: '/stir', label: 'STIR/SHAKEN', icon: IconShieldLock },
    { href: '/captura', label: 'Captura SIP', icon: IconBug },
  ] },
  { label: 'Sistema', icon: IconRouter, items: [
    { href: '/red', label: 'Red (LAN/WAN)', icon: IconNetwork },
    { href: '/ajustes', label: 'Ajustes · Email', icon: IconMail },
    { href: '/notificaciones', label: 'Notificaciones', icon: IconBellRinging },
    { href: '/manuales', label: 'Manuales', icon: IconBook },
    { href: '/respaldos', label: 'Respaldos', icon: IconDatabaseExport, adminOnly: true },
    { href: '/certificados', label: 'Certificados TLS', icon: IconCertificate, adminOnly: true },
    { href: '/usuarios', label: 'Usuarios', icon: IconUsers, adminOnly: true },
  ] },
];

export default function Shell({ children }) {
  const path = usePathname();
  const [rail, setRail] = useState(false);
  // Acordeon: como maximo DOS grupos abiertos a la vez (menos ruido). Arrancan los 2 primeros.
  const [abiertos, setAbiertos] = useState(() => groups.slice(0, 2).map((g) => g.label));

  useEffect(() => { try { setRail(localStorage.getItem('sbcng_rail') === '1'); } catch (_) {} }, []);
  const isActive = (it) => (it.href === '/' ? path === '/' : path.startsWith(it.href));

  const toggleRail = () => setRail((v) => { const n = !v; try { localStorage.setItem('sbcng_rail', n ? '1' : '0'); } catch (_) {} return n; });
  const toggleGroup = (l) => setAbiertos((a) => (a.includes(l) ? a.filter((x) => x !== l) : [...a, l].slice(-2)));

  if (path === '/login') return children;

  return <ShellInterno {...{ path, rail, abiertos, toggleRail, toggleGroup, isActive }}>{children}</ShellInterno>;
}

function ShellInterno({ children, path, rail, abiertos, toggleRail, toggleGroup, isActive }) {
  const { user } = useAuth();
  const esAdmin = !!(user && user.role === 'admin');
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('dark');
  const toggleScheme = () => setColorScheme(scheme === 'dark' ? 'light' : 'dark');

  const { data: salud } = usePoll('/status', 10000);
  const vivo = !!(salud && salud.kamailio && salud.kamailio.ok);

  const { data: medios } = usePoll('/media/live', 8000);
  const trans = (medios && medios.transcodificando) || 0;

  // Conteos para los badges del menu (extensiones, troncales, rutas, reglas, centrales).
  const { data: conteos } = usePoll('/counts', 15000);

  const navItem = (it) => {
    const active = isActive(it); const Icon = it.icon;
    const cuenta = it.badge === 'transcoding' ? trans : 0;
    const num = it.countKey && conteos ? (conteos[it.countKey] || 0) : 0;

    const right = !rail
      ? (cuenta > 0
          ? <Badge size="sm" circle variant="filled" color="grape" className="sbc-pulse">{cuenta}</Badge>
          : (num > 0
              ? <Badge size="sm" variant="light" color={active ? 'sbc' : 'gray'} radius="sm" style={{ minWidth: 22, paddingInline: 6 }}>{num}</Badge>
              : undefined))
      : undefined;

    const link = (
      <NavLink key={it.href} component={Link} href={it.href} label={rail ? undefined : it.label}
        leftSection={<Icon size={19} stroke={1.7} />} active={active} variant="light" mb={2}
        rightSection={right}
        style={{ borderRadius: 10, justifyContent: rail ? 'center' : undefined }}
        styles={rail ? { body: { display: 'none' }, section: { marginRight: 0 } } : undefined} />
    );

    const conPunto = rail && (cuenta > 0 || num > 0)
      ? <div key={it.href} style={{ position: 'relative' }}>
          {link}
          <span className={cuenta > 0 ? 'sbc-pip sbc-pulse' : 'sbc-pip'}
                style={{ position: 'absolute', top: 6, right: 14, background: cuenta > 0 ? '#7c3aed' : '#3f9dff' }} />
        </div>
      : link;

    return rail
      ? <Tooltip key={it.href} label={num > 0 ? `${it.label} · ${num}` : (cuenta > 0 ? `${it.label} · ${cuenta} en curso` : it.label)} position="right" withArrow>
          {conPunto}
        </Tooltip>
      : conPunto;
  };

  return (
    <AppShell navbar={{ width: rail ? 76 : 248, breakpoint: 'sm' }} padding="lg">
      <AppShell.Navbar p={rail ? 8 : 'sm'}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Group justify="space-between" wrap="nowrap" mb="xs" px={rail ? 0 : 4}
                 style={{ justifyContent: rail ? 'center' : 'space-between' }}>
            {!rail && (
              <Group gap={8} wrap="nowrap">
                <Logo size={34} />
                <div>
                  <Text fw={800} size="sm" lh={1.05}>SBC-NG</Text>
                  <Text size="10px" c="dimmed" lh={1.05}>Session Border Controller</Text>
                </div>
              </Group>
            )}
            {rail && <Logo size={32} />}
            {!rail && (
              <Tooltip label="Contraer menú" position="right">
                <ActionIcon variant="subtle" color="gray" onClick={toggleRail}><IconLayoutSidebarLeftCollapse size={19} /></ActionIcon>
              </Tooltip>
            )}
          </Group>
          {rail && (
            <Tooltip label="Expandir menú" position="right">
              <ActionIcon variant="subtle" color="gray" mx="auto" mb="xs" onClick={toggleRail}><IconLayoutSidebarLeftExpand size={19} /></ActionIcon>
            </Tooltip>
          )}

          <ScrollArea style={{ flex: 1, marginTop: 14 }} type="hover">
            {groups.map((g) => {
              const opened = rail ? true : abiertos.includes(g.label);
              const GIcon = g.icon;
              return (
                <Box key={g.label} mb={6}>
                  {!rail && (
                    <UnstyledButton onClick={() => toggleGroup(g.label)}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <GIcon size={15} stroke={1.7} style={{ opacity: .6 }} />
                      <Text size="10px" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '.06em', flex: 1, textAlign: 'left' }}>{g.label}</Text>
                      <IconChevronRight size={13} style={{ opacity: .5, transform: opened ? 'rotate(90deg)' : 'none', transition: 'transform .18s' }} />
                    </UnstyledButton>
                  )}
                  <Collapse in={opened}>
                    <Box mt={2}>{g.items.filter((it) => !it.adminOnly || esAdmin).map(navItem)}</Box>
                  </Collapse>
                </Box>
              );
            })}
          </ScrollArea>

          <Divider my={8} />
          <Group justify="space-between" wrap="nowrap" px={rail ? 0 : 4} style={{ justifyContent: rail ? 'center' : 'space-between' }}>
            {!rail && (
              <Menu position="top-start" withArrow shadow="md">
                <Menu.Target>
                  <UnstyledButton>
                    <Group gap={8} wrap="nowrap">
                      <Avatar size={30} radius="xl" color="sbc" variant="light">
                        {(user && user.username ? user.username[0] : 'S').toUpperCase()}
                      </Avatar>
                      <div>
                        <Text size="xs" fw={650} lh={1.1}>{(user && user.username) || 'sesión'}</Text>
                        <Group gap={5}>
                          <span className={`sbc-pip ${vivo ? 'sbc-pulse' : ''}`} style={{ background: vivo ? '#12b76a' : '#f04438' }} />
                          <Text size="10px" c="dimmed" lh={1.1}>{vivo ? 'SBC en línea' : 'sin contacto'}</Text>
                        </Group>
                      </div>
                    </Group>
                  </UnstyledButton>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>{(user && user.role) || 'admin'}</Menu.Label>
                  <Menu.Item leftSection={<IconLogout size={15} />} color="red" onClick={logout}>Cerrar sesión</Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
            <Tooltip label={scheme === 'dark' ? 'Tema claro' : 'Tema oscuro'} position="right">
              <ActionIcon variant="subtle" color="gray" onClick={toggleScheme}>
                {scheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
              </ActionIcon>
            </Tooltip>
          </Group>
          {rail && (
            <Tooltip label="Cerrar sesión" position="right">
              <ActionIcon variant="subtle" color="red" mx="auto" mt={6} onClick={logout}><IconLogout size={18} /></ActionIcon>
            </Tooltip>
          )}
        </div>
      </AppShell.Navbar>

      <AppShell.Main>
        <div key={path} className="sbc-anim">{children}</div>
      </AppShell.Main>
    </AppShell>
  );
}
