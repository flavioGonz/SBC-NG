'use client';
/* ============================================================================
 *  Topología — el borde, vivo y editable.
 *
 *  No es un diagrama decorativo: cada nodo se sondea de verdad (el monitor del
 *  control-plane) y su color sale de ahí. Verde contesta, rojo está caído y late
 *  para que se note desde lejos. Un nodo verde sobre un enlace muerto sería una
 *  mentira cara — manda a buscar el problema al lado equivocado.
 *
 *  Y se opera desde acá: click derecho en el SBC abre un menú para dar de alta una
 *  troncal, una ruta o una central, en un modal, sin salir del mapa. Los nodos se
 *  arrastran y la posición se guarda: cada quien acomoda el dibujo a su red.
 * ==========================================================================*/
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, Background, Panel, Handle, Position, useNodesState, useEdgesState,
  BaseEdge, getSmoothStepPath, EdgeLabelRenderer,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Group, Text, Badge, ThemeIcon, Skeleton, Paper, Stack, Menu, Modal, TextInput,
  NumberInput, Select, Button, SimpleGrid, MultiSelect, Divider, Tooltip, ActionIcon,
} from '@mantine/core';
import {
  IconWorld, IconServer2, IconAlertTriangle, IconPlugConnected, IconPlus, IconRoute,
  IconRefresh, IconLayoutGrid, IconRouter, IconArrowsExchange, IconPhone, IconRouteAltLeft,
} from '@tabler/icons-react';
import Logo from '../../components/Logo';
import { usePoll, api } from '../api';
import { toast, toastPromise } from '../notify';

/* color por estado real del nodo */
const colorEstado = (e) => (!e ? 'gray' : e.ok ? 'teal' : 'red');
const hexEstado = (e) => (!e ? '#64748b' : e.ok ? '#12b76a' : '#f04438');

const marco = (color, ancho = 190) => ({
  padding: '10px 14px', borderRadius: 14, minWidth: ancho,
  border: `1px solid ${color}66`, background: 'var(--mantine-color-body)',
  boxShadow: `0 10px 30px -16px ${color}aa`,
});

/* ── nodos ─────────────────────────────────────────────────────────────── */

/* "hace X" en vivo: cuenta desde el último OPTIONS OK. Si el nodo está caído, el
   número sigue creciendo — se ve de lejos que hace rato que no contesta. */
function Desde({ ts }) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!ts) return <span>—</span>;
  const s = Math.max(0, Math.round((ahora - ts) / 1000));
  if (s < 60) return <span>hace {s}s</span>;
  const m = Math.floor(s / 60);
  return <span>hace {m}m {s % 60}s</span>;
}

const mosColor = (m) => (m == null ? 'gray' : m >= 4.0 ? 'teal' : m >= 3.6 ? 'yellow' : 'red');

/* La barrita de monitoreo de un nodo: latencia, MOS y el timer del último OPTIONS. */
function MonMini({ e }) {
  if (!e) return null;
  return (
    <Group gap={6} mt={6} wrap="nowrap">
      {e.latencia_ms != null && (
        <Badge size="xs" variant="light" color={e.ok ? 'sbc' : 'gray'}>
          {e.latencia_ms === 0 ? '<1 ms' : e.latencia_ms + ' ms'}
        </Badge>
      )}
      {e.mos != null && (
        <Tooltip label="MOS estimado (calidad de voz): 4+ bueno, 3.6-4 regular, <3.6 pobre">
          <Badge size="xs" variant="light" color={mosColor(e.mos)}>MOS {e.mos.toFixed(2)}</Badge>
        </Tooltip>
      )}
      <Text size="9px" c={e.ok ? 'dimmed' : 'red'} ml="auto">
        {e.via === 'OPTIONS' ? '⟳ ' : ''}<Desde ts={e.ultimo_ok} />
      </Text>
    </Group>
  );
}

function Pip({ e }) {
  const c = hexEstado(e);
  return <span style={{ width: 8, height: 8, borderRadius: 999, background: c, display: 'inline-block',
                        boxShadow: `0 0 0 0 ${c}` }} className={e && !e.ok ? 'topo-late' : undefined} />;
}

function NodoGateway({ data }) {
  const c = hexEstado(data.estado);
  return (
    <div style={marco(c, 168)}>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Group gap={9} wrap="nowrap">
        <ThemeIcon size={30} radius="md" variant="light" color={colorEstado(data.estado)}><IconWorld size={17} /></ThemeIcon>
        <div>
          <Group gap={6}><Text fw={700} size="sm">Gateway</Text><Pip e={data.estado} /></Group>
          <Text size="10px" c="dimmed" ff="monospace">{data.ip || 'salida a internet'}</Text>
        </div>
      </Group>
      <MonMini e={data.estado} />
    </div>
  );
}

function NodoTroncal({ data }) {
  const c = hexEstado(data.estado);
  return (
    <div style={{ ...marco(c, 172) }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Group gap={8} wrap="nowrap">
        <ThemeIcon size={26} radius="md" variant="light" color={colorEstado(data.estado)}><IconPlugConnected size={14} /></ThemeIcon>
        <div>
          <Group gap={6}><Text fw={650} size="xs">{data.name}</Text><Pip e={data.estado} /></Group>
          <Text size="10px" c="dimmed" ff="monospace">{data.remote_url || data.provider_host}</Text>
          {data.gateway_ip && (
            <Group gap={3} wrap="nowrap" mt={1}>
              <IconRouteAltLeft size={9} style={{ opacity: .6 }} />
              <Text size="9px" c="dimmed" ff="monospace">vía {data.gateway_ip}</Text>
            </Group>
          )}
        </div>
      </Group>
      <MonMini e={data.estado} />
    </div>
  );
}

function NodoCentral({ data }) {
  const c = hexEstado(data.estado);
  return (
    <div style={marco(c)}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Group gap={9} wrap="nowrap">
        <ThemeIcon size={32} radius="md" variant="light" color={colorEstado(data.estado)}><IconServer2 size={18} /></ThemeIcon>
        <div>
          <Group gap={6}><Text fw={700} size="sm">{data.name}</Text><Pip e={data.estado} /></Group>
          <Text size="10px" c="dimmed" ff="monospace">{data.sip_uri}</Text>
        </div>
      </Group>
      <MonMini e={data.estado} />
    </div>
  );
}

function NodoSbc({ data }) {
  const ok = data.kam.ok;
  const c = ok ? '#2f74e6' : '#f04438';
  return (
    <div style={{ ...marco(c, 220), cursor: 'context-menu' }} onContextMenu={data.onMenu}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Group justify="space-between" mb={6} wrap="nowrap">
        <Group gap={9} wrap="nowrap">
          <Logo size={34} />
          <div>
            <Text fw={800} size="sm" lh={1.05}>SBC-NG</Text>
            <Text size="10px" c="dimmed" lh={1.05}>{ok ? 'Motor SIP activo' : 'sin respuesta'}</Text>
          </div>
        </Group>
        <Badge size="xs" variant="light" color={ok ? 'teal' : 'red'}>{ok ? 'activo' : 'caído'}</Badge>
      </Group>
      {data.llamadas > 0 && (
        <Group gap={6} mb={6} wrap="nowrap" className="topo-callrow">
          {/* pila de llamadas en vivo: hasta 5 fichas superpuestas + contador */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {Array.from({ length: Math.min(data.llamadas, 5) }).map((_, i) => (
              <span key={i} className="topo-callchip" style={{ marginLeft: i ? -7 : 0, zIndex: 5 - i }}>
                <IconPhone size={10} />
              </span>
            ))}
          </div>
          <Text size="10px" fw={700} c="teal.7">{data.llamadas} en vivo</Text>
        </Group>
      )}
      <Group gap={6}>
        <Badge size="xs" variant="light" color={data.modo === 'switch' ? 'cyan' : 'orange'}
               leftSection={data.modo === 'switch' ? <IconArrowsExchange size={10} /> : <IconRouter size={10} />}>
          {data.modo === 'switch' ? 'switch' : 'router'}
        </Badge>
        <Text size="10px" c="dimmed">click derecho para configurar</Text>
      </Group>
    </div>
  );
}

const tipos = { sbc: NodoSbc, central: NodoCentral, troncal: NodoTroncal, gateway: NodoGateway };

/* Edge con "latido": el pulso del OPTIONS viajando hacia el SBC. Un punto recorre el
 * enlace de forma continua; en las centrales va en reversa para que SIEMPRE llegue al
 * SBC (la central la sondea el SBC, pero el latido que interesa es el que vuelve). */
function LatidoEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style = {}, data = {} }) {
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 18 });
  const c = data.color || '#2f74e6';
  return (
    <>
      <BaseEdge id={id} path={path} style={style} />
      {data.vivo && (
        <circle r="4.5" fill={c} style={{ filter: `drop-shadow(0 0 6px ${c})` }}>
          <animateMotion dur="1.9s" repeatCount="indefinite" calcMode="linear"
                         keyPoints={data.reverse ? '1;0' : '0;1'} keyTimes="0;1">
            <mpath href={`#${id}`} />
          </animateMotion>
          <animate attributeName="r" values="3.2;5.4;3.2" dur="1.9s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;1;0.5" dur="1.9s" repeatCount="indefinite" />
        </circle>
      )}
      {data.label && (
        <EdgeLabelRenderer>
          <div style={{ position: 'absolute', transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
                        background: 'light-dark(#e9fbf6,#0f2b27)', color: '#0d9488', fontWeight: 800, fontSize: 11,
                        padding: '2px 7px', borderRadius: 8, pointerEvents: 'all' }}>{data.label}</div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
const edgeTypes = { latido: LatidoEdge };

/* ── página ────────────────────────────────────────────────────────────── */

const CODECS = [
  { value: 'ulaw', label: 'G.711 μ-law' }, { value: 'alaw', label: 'G.711 A-law' },
  { value: 'g722', label: 'G.722' }, { value: 'g729', label: 'G.729' },
  { value: 'opus', label: 'Opus' }, { value: 'gsm', label: 'GSM' },
];

export default function Topologia() {
  const { data, recargar } = usePoll('/topology', 8000);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [menu, setMenu] = useState(null);            // {x, y}
  const [modal, setModal] = useState(null);          // 'troncal' | 'ruta' | 'central'
  const [verRutas, setVerRutas] = useState(false);   // superponer rutas de salida/entrada
  const dataRef = useRef(data);
  dataRef.current = data;

  const abrirMenu = useCallback((e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }, []);

  // (re)construir el grafo cuando llegan datos, respetando posiciones guardadas
  useEffect(() => {
    if (!data) return;
    const est = data.estados || {};
    const pos = data.pos || {};
    const modo = data.modo || 'router';
    const trs = data.troncales || [];
    const cens = data.centrales || [];

    const P = (key, xAuto, yAuto) => pos[key] || { x: xAuto, y: yAuto };

    // IP del gateway: las troncales cuyo tracer da esta IP "cuelgan" detras del gateway
    const gwIp = data.gateway && data.gateway.ip;
    const hayGw = !!(data.gateway || modo === 'router');
    const detrasDeGw = (t) => hayGw && !!gwIp && t.gateway_ip === gwIp;

    const ns = [];
    // gateway (o internet en router): en el centro-izquierda, para que las troncales que
    // salen por el queden a su espalda (mas a la izquierda) y el flujo lea izq->der.
    if (hayGw) {
      ns.push({ id: 'gw', type: 'gateway', position: P('gw', 250, 190),
                data: { ip: gwIp, estado: est.gw || (data.gateway && data.gateway.estado) } });
    }
    // dos filas: las de detras del gateway a la izquierda del todo; las directas, cerca del SBC.
    let iDetras = 0, iDir = 0;
    trs.forEach((t) => {
      const via = detrasDeGw(t);
      const posDef = via
        ? { x: 20, y: 120 + iDetras++ * 96 }
        : { x: 250, y: 20 + iDir++ * 96 };
      ns.push({
        id: 'tr' + t.id, type: 'troncal', position: P('tr' + t.id, posDef.x, posDef.y),
        data: { name: t.name, provider_host: t.provider_host, enabled: t.enabled, estado: est['tr' + t.id], gateway_ip: t.gateway_ip, remote_url: t.remote_url, viaGw: via },
      });
    });
    const vivas = (data.llamadas && data.llamadas.total) || 0;
    ns.push({ id: 'sbc', type: 'sbc', position: P('sbc', 360, 120),
              data: { kam: { ok: !!(data.sbc && data.sbc.ok), version: data.sbc && data.sbc.version }, modo, onMenu: abrirMenu, llamadas: vivas } });
    cens.forEach((c, i) => ns.push({
      id: 'pbx' + c.id, type: 'central', position: P('pbx' + c.id, 760, 80 + i * 108),
      data: { name: c.name, sip_uri: c.sip_uri, enabled: c.enabled, estado: est['pbx' + c.id] },
    }));

    const vivo = (e) => e && e.ok;
    const es = [];
    if (ns.find((n) => n.id === 'gw'))
      es.push({ id: 'e-gw', source: 'gw', target: 'sbc', type: 'latido',
                style: { stroke: hexEstado(est.gw), strokeWidth: 2 },
                data: { vivo: vivo(est.gw), color: hexEstado(est.gw), reverse: false } });
    trs.forEach((t) => {
      // si el tracer detecto que esta troncal sale por el gateway, la colgamos DETRAS
      // de el (troncal->gateway->sbc) en vez de dibujar un enlace directo troncal->sbc.
      const via = detrasDeGw(t) && ns.find((n) => n.id === 'gw');
      es.push({
        id: 'e-tr' + t.id, source: 'tr' + t.id, target: via ? 'gw' : 'sbc', type: 'latido',
        style: { stroke: hexEstado(est['tr' + t.id]), strokeWidth: 1.8, strokeDasharray: vivo(est['tr' + t.id]) ? undefined : '5 5' },
        data: { vivo: vivo(est['tr' + t.id]), color: hexEstado(est['tr' + t.id]), reverse: false },
      });
    });
    cens.forEach((c) => {
      const up = vivo(est['pbx' + c.id]);
      // Todas las llamadas del borde cruzan el enlace SBC<->central: cuando hay trafico,
      // el enlace se engrosa, se pinta de "en curso" y muestra la pila de llamadas.
      const conTrafico = up && vivas > 0;
      es.push({
        id: 'e-pbx' + c.id, source: 'sbc', target: 'pbx' + c.id, type: 'latido',
        style: {
          stroke: conTrafico ? '#0d9488' : hexEstado(est['pbx' + c.id]),
          strokeWidth: conTrafico ? 3 : 2,
          strokeDasharray: up ? undefined : '5 5',
          filter: conTrafico ? 'drop-shadow(0 0 4px #0d948877)' : undefined,
        },
        data: {
          vivo: up, reverse: true,
          color: conTrafico ? '#0d9488' : hexEstado(est['pbx' + c.id]),
          label: conTrafico ? '☎ ' + vivas : undefined,
        },
      });
    });

    // Rutas logicas superpuestas (toggle, por defecto ocultas): salida = central -> troncal
    // (etiquetada con el prefijo); entrada = troncal -> central. Muestran el CAMINO, no el cable.
    if (verRutas) {
      const cid = cens[0] ? ('pbx' + cens[0].id) : null;
      (data.rutas_salida || []).forEach((r) => {
        if (!r.trunk_id || !ns.find((x) => x.id === 'tr' + r.trunk_id)) return;
        cens.forEach((c) => {
          es.push({ id: `e-ro-${r.id}-${c.id}`, source: 'pbx' + c.id, target: 'tr' + r.trunk_id, animated: true,
            label: (r.pattern && r.pattern !== '*') ? r.pattern + '\u2026' : 'todo',
            style: { stroke: '#7c3aed', strokeWidth: 1.6, strokeDasharray: '6 4' },
            labelStyle: { fill: '#7c3aed', fontWeight: 700, fontSize: 10 },
            labelBgStyle: { fill: 'var(--mantine-color-body)', fillOpacity: 0.9 }, labelBgPadding: [4, 2], labelBgBorderRadius: 4 });
        });
      });
      if (cid) trs.forEach((t) => {
        es.push({ id: `e-in-${t.id}`, source: 'tr' + t.id, target: cid, animated: true,
          label: 'entrante',
          style: { stroke: '#12b76a', strokeWidth: 1.4, strokeDasharray: '2 4' },
          labelStyle: { fill: '#12b76a', fontWeight: 700, fontSize: 10 },
          labelBgStyle: { fill: 'var(--mantine-color-body)', fillOpacity: 0.9 }, labelBgPadding: [4, 2], labelBgBorderRadius: 4 });
      });
    }

    setNodes(ns);
    setEdges(es);
  }, [data, abrirMenu, setNodes, setEdges, verRutas]);

  // guardar la posicion al soltar un nodo
  const onNodeDragStop = useCallback((_e, node) => {
    api('/topology/pos', { method: 'PUT', body: { node_key: node.id, x: Math.round(node.position.x), y: Math.round(node.position.y) } })
      .catch(() => {});
  }, []);

  const reordenar = () => toastPromise(
    api('/topology/pos', { method: 'DELETE' }).then(recargar),
    { loading: 'Volviendo al orden automático…', success: 'Listo', error: 'No se pudo' });

  const alto = 'calc(100vh - var(--mantine-spacing-lg) * 2)';
  if (!data) return <Skeleton h={alto} radius="lg" />;

  const kamOk = !!(data.sbc && data.sbc.ok);
  const caidos = Object.values(data.estados || {}).filter((e) => e && !e.ok).length;
  const vivas = (data.llamadas && data.llamadas.total) || 0;

  return (
    <div style={{ height: alto, width: '100%', borderRadius: 16, overflow: 'hidden',
                  border: '1px solid light-dark(#e6eaf2, rgba(120,130,150,.14))' }}>
      <style>{`.topo-late{animation:topolate 1s ease-in-out infinite}@keyframes topolate{0%,100%{box-shadow:0 0 0 0 #f04438aa}50%{box-shadow:0 0 0 5px #f0443800}}.topo-callchip{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#0d9488;color:#fff;border:2px solid var(--mantine-color-body);box-shadow:0 1px 3px #0003}.topo-callrow{animation:topocall 1.6s ease-in-out infinite}@keyframes topocall{0%,100%{opacity:.78}50%{opacity:1}}`}</style>
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={tipos} edgeTypes={edgeTypes}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeDragStop={onNodeDragStop}
        fitView fitViewOptions={{ padding: 0.25 }} proOptions={{ hideAttribution: true }}
        nodesDraggable nodesConnectable={false} elementsSelectable={false}
        minZoom={0.4} maxZoom={1.8} zoomOnScroll panOnScroll={false}
      >
        <Background gap={26} size={1} color="rgba(120,140,180,.16)" />

        {/* overlay: título + estado. Sin chips sueltos ni recuadro de zoom. */}
        <Panel position="top-left">
          <Paper p="sm" radius="lg" withBorder className="sbc-fade-in"
                 style={{ backdropFilter: 'blur(10px)', background: 'light-dark(rgba(255,255,255,.82), rgba(16,22,32,.78))' }}>
            <Group gap={10} wrap="nowrap">
              <Logo size={30} />
              <div>
                <Text fw={800} size="sm" lh={1.15}>Topología</Text>
                <Group gap={8}>
                  <Badge size="xs" variant="light" color={kamOk ? 'teal' : 'red'}>{kamOk ? 'SBC activo' : 'SBC caído'}</Badge>
                  {caidos > 0 && <Badge size="xs" variant="light" color="red">{caidos} caído(s)</Badge>}
                  {vivas > 0 && <Badge size="xs" variant="light" color="teal" leftSection={<IconPhone size={10} />}>{vivas} en vivo</Badge>}
                </Group>
              </div>
              <Tooltip label={verRutas ? 'Ocultar rutas' : 'Ver rutas de salida y entrada'}>
                <ActionIcon variant={verRutas ? 'filled' : 'subtle'} color={verRutas ? 'grape' : 'gray'} onClick={() => setVerRutas((v) => !v)} ml="sm"><IconRouteAltLeft size={16} /></ActionIcon>
              </Tooltip>
              <Tooltip label="Reacomodar automáticamente">
                <ActionIcon variant="subtle" color="gray" onClick={reordenar}><IconLayoutGrid size={16} /></ActionIcon>
              </Tooltip>
            </Group>
          </Paper>
        </Panel>
      </ReactFlow>

      {/* menú contextual del SBC */}
      {menu && (
        <Menu opened onClose={() => setMenu(null)} position="bottom-start" withArrow shadow="md">
          <Menu.Target>
            <div style={{ position: 'fixed', left: menu.x, top: menu.y, width: 1, height: 1 }} />
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Configurar el borde</Menu.Label>
            <Menu.Item leftSection={<IconPlugConnected size={15} />} onClick={() => { setMenu(null); setModal('troncal'); }}>
              Nueva troncal
            </Menu.Item>
            <Menu.Item leftSection={<IconRoute size={15} />} onClick={() => { setMenu(null); setModal('ruta'); }}>
              Nueva ruta de salida
            </Menu.Item>
            <Menu.Item leftSection={<IconServer2 size={15} />} onClick={() => { setMenu(null); setModal('central'); }}>
              Nueva central interna
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      )}

      <ModalTroncal abierto={modal === 'troncal'} cerrar={() => setModal(null)} onOk={recargar} />
      <ModalRuta abierto={modal === 'ruta'} cerrar={() => setModal(null)} onOk={recargar}
                 troncales={data.troncales || []} />
      <ModalCentral abierto={modal === 'central'} cerrar={() => setModal(null)} onOk={recargar} />
    </div>
  );
}

/* ── modales (los mismos altas que las páginas, pero sin salir del mapa) ──── */

function ModalTroncal({ abierto, cerrar, onOk }) {
  const [f, setF] = useState({ name: '', provider_host: '', provider_port: 5060, transport: 'udp', mode: 'ip',
                               codecs: ['ulaw', 'alaw'], dtmf: 'rfc4733', outbound_prefix: '', outbound_strip: 0 });
  const crear = () => {
    if (!f.name || !f.provider_host) { toast('Faltan el nombre y el host', 'warn'); return; }
    return toastPromise(
      api('/trunks', { method: 'POST', body: { ...f, codecs: f.codecs.join(',') } }).then(() => { cerrar(); onOk(); }),
      { loading: 'Creando…', success: 'Troncal creada · cargá una regla en Ruteo', error: (e) => e.message });
  };
  return (
    <Modal opened={abierto} onClose={cerrar} title="Nueva troncal" size="lg">
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <TextInput label="Nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.currentTarget.value })} required />
          <Select label="Modo" data={[{ value: 'ip', label: 'IP fija' }, { value: 'register', label: 'Registro' }]}
                  value={f.mode} onChange={(v) => setF({ ...f, mode: v })} />
        </SimpleGrid>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <TextInput label="Host del operador" value={f.provider_host} required
                     onChange={(e) => setF({ ...f, provider_host: e.currentTarget.value })} />
          <NumberInput label="Puerto" value={f.provider_port} onChange={(v) => setF({ ...f, provider_port: v || 5060 })} />
          <Select label="Transporte" data={['udp', 'tcp', 'tls']} value={f.transport} onChange={(v) => setF({ ...f, transport: v })} />
        </SimpleGrid>
        <MultiSelect label="Códecs" data={CODECS} value={f.codecs} onChange={(v) => setF({ ...f, codecs: v })} />
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <NumberInput label="Sacar dígitos al salir" min={0} value={f.outbound_strip} onChange={(v) => setF({ ...f, outbound_strip: v || 0 })} />
          <TextInput label="Prefijo al salir" placeholder="0" value={f.outbound_prefix} onChange={(e) => setF({ ...f, outbound_prefix: e.currentTarget.value })} />
        </SimpleGrid>
        <Group justify="flex-end"><Button variant="default" onClick={cerrar}>Cancelar</Button><Button onClick={crear}>Crear</Button></Group>
      </Stack>
    </Modal>
  );
}

function ModalRuta({ abierto, cerrar, onOk, troncales }) {
  const [f, setF] = useState({ name: '', pattern: '', trunk_id: '', priority: 10 });
  const crear = () => {
    if (!f.trunk_id) { toast('Elegí la troncal', 'warn'); return; }
    return toastPromise(
      api('/routes', { method: 'POST', body: { ...f, trunk_id: +f.trunk_id } })
        .then(() => api('/routes/apply', { method: 'POST' })).then(() => { cerrar(); onOk(); }),
      { loading: 'Creando y aplicando…', success: 'Ruta creada y aplicada', error: (e) => e.message });
  };
  return (
    <Modal opened={abierto} onClose={cerrar} title="Nueva ruta de salida" size="lg">
      <Stack gap="md">
        <Select label="Sale por la troncal" searchable
                data={troncales.map((t) => ({ value: String(t.id), label: `${t.name} · ${t.provider_host}` }))}
                value={f.trunk_id} onChange={(v) => setF({ ...f, trunk_id: v })}
                nothingFoundMessage="Cargá una troncal primero" />
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <TextInput label="Prefijo" description='Vacío = atrapa-todo' placeholder="09"
                     value={f.pattern} onChange={(e) => setF({ ...f, pattern: e.currentTarget.value })} />
          <NumberInput label="Prioridad" value={f.priority} min={0} onChange={(v) => setF({ ...f, priority: v || 0 })} />
        </SimpleGrid>
        <TextInput label="Nombre (opcional)" value={f.name} onChange={(e) => setF({ ...f, name: e.currentTarget.value })} />
        <Group justify="flex-end"><Button variant="default" onClick={cerrar}>Cancelar</Button><Button onClick={crear}>Crear y aplicar</Button></Group>
      </Stack>
    </Modal>
  );
}

function ModalCentral({ abierto, cerrar, onOk }) {
  const [f, setF] = useState({ name: '', sip_uri: '', context: 'from-trunk', priority: 10 });
  const crear = () => {
    if (!f.name || !f.sip_uri) { toast('Faltan el nombre y la URI', 'warn'); return; }
    return toastPromise(
      api('/attach', { method: 'POST', body: f }).then(() => { cerrar(); onOk(); }),
      { loading: 'Creando…', success: 'Central agregada', error: (e) => e.message });
  };
  return (
    <Modal opened={abierto} onClose={cerrar} title="Nueva central interna" size="md">
      <Stack gap="md">
        <TextInput label="Nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.currentTarget.value })} required />
        <TextInput label="SIP URI" description="A dónde el SBC entrega las llamadas" placeholder="sip:192.168.1.10:5060"
                   value={f.sip_uri} onChange={(e) => setF({ ...f, sip_uri: e.currentTarget.value })} required />
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <TextInput label="Contexto" value={f.context} onChange={(e) => setF({ ...f, context: e.currentTarget.value })} />
          <NumberInput label="Prioridad" value={f.priority} min={1} onChange={(v) => setF({ ...f, priority: v || 10 })} />
        </SimpleGrid>
        <Group justify="flex-end"><Button variant="default" onClick={cerrar}>Cancelar</Button><Button onClick={crear}>Crear</Button></Group>
      </Stack>
    </Modal>
  );
}
