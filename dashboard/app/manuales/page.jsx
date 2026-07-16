'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Stack, Card, Group, Text, Button, SimpleGrid, ThemeIcon, Badge, Alert,
  Progress, Tooltip, ActionIcon, Loader, Divider,
} from '@mantine/core';
import {
  IconBook, IconExternalLink, IconFileTypePdf, IconMarkdown, IconPhotoPlus,
  IconClipboardCheck, IconTrash, IconCheck, IconUpload, IconRefresh,
} from '@tabler/icons-react';
import PageHeader from '../PageHeader';
import { api } from '../api';
import { toast } from '../notify';

/* ── una zona de carga por cada recuadro del manual ───────────────────────────
 *  Pegar (Ctrl+V con la zona enfocada), arrastrar, o elegir archivo. La imagen
 *  se sube al control-plane (volumen persistente) con el NOMBRE EXACTO que el
 *  manual espera, asi que aparece sola en su lugar sin recompilar nada.        */
function fileADataURL(file) {
  return new Promise((ok, err) => {
    const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = err; r.readAsDataURL(file);
  });
}

function Zona({ ph, cargada, accent, onHecho }) {
  const [subiendo, setSubiendo] = useState(false);
  const [bust, setBust] = useState(0);
  const inputRef = useRef(null);
  const boxRef = useRef(null);

  const subir = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) { toast('Eso no es una imagen', 'bad'); return; }
    setSubiendo(true);
    try {
      const data = await fileADataURL(file);
      await api('/manuales/img/' + ph.file, { method: 'POST', body: { data } });
      setBust(Date.now()); onHecho(ph.file, true);
      toast(`Cargada: ${ph.file}`, 'ok');
    } catch (e) { toast(e.message || 'No se pudo subir', 'bad'); }
    finally { setSubiendo(false); }
  }, [ph.file, onHecho]);

  const onPaste = (e) => {
    const it = [...(e.clipboardData?.items || [])].find((x) => x.type.startsWith('image/'));
    if (it) { e.preventDefault(); subir(it.getAsFile()); }
  };
  const onDrop = (e) => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) subir(f); };
  const quitar = async () => {
    try { await api('/manuales/img/' + ph.file, { method: 'DELETE' }); onHecho(ph.file, false); setBust(Date.now()); }
    catch (e) { toast(e.message, 'bad'); }
  };

  const src = `/backend/api/v1/manuales/img/${ph.file}?v=${bust}`;

  return (
    <Card withBorder radius="md" p="xs" style={{ borderColor: cargada ? accent + '88' : undefined }}>
      <Group justify="space-between" gap={6} mb={6} wrap="nowrap">
        <Text size="10px" fw={800} c="dimmed" style={{ fontFamily: 'monospace' }}>{ph.file}</Text>
        {cargada
          ? <Badge size="xs" color="teal" variant="light" leftSection={<IconCheck size={10} />}>cargada</Badge>
          : <Badge size="xs" color="gray" variant="light">pendiente</Badge>}
      </Group>

      <div
        ref={boxRef} tabIndex={0} onPaste={onPaste} onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()} onClick={() => boxRef.current?.focus()}
        style={{
          position: 'relative', borderRadius: 10, minHeight: 118, cursor: 'pointer', outline: 'none',
          border: `2px dashed ${cargada ? accent + '55' : 'light-dark(#cbd5e1,#33415580)'}`,
          background: cargada ? 'transparent' : 'light-dark(#f8fafc,#0e1522)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}
      >
        {subiendo && <Loader size="sm" />}
        {!subiendo && cargada && (
          <img src={src} alt={ph.alt} style={{ width: '100%', height: '100%', maxHeight: 160, objectFit: 'cover' }} />
        )}
        {!subiendo && !cargada && (
          <Stack gap={2} align="center" style={{ padding: 8, textAlign: 'center' }}>
            <IconClipboardCheck size={22} style={{ opacity: .5 }} />
            <Text size="10px" c="dimmed" lh={1.2}>Clic y <b>Ctrl+V</b>,<br />arrastrá o elegí archivo</Text>
          </Stack>
        )}
      </div>

      <Text size="10px" c="dimmed" mt={6} lh={1.25} lineClamp={2} title={ph.alt}>{ph.alt}</Text>

      <Group gap={6} mt={6} grow>
        <Button size="compact-xs" variant="light" leftSection={<IconUpload size={12} />}
                onClick={() => inputRef.current?.click()}>Archivo</Button>
        {cargada && (
          <Tooltip label="Quitar para recapturar">
            <ActionIcon variant="light" color="red" size="md" onClick={quitar}><IconTrash size={14} /></ActionIcon>
          </Tooltip>
        )}
      </Group>
      <input ref={inputRef} type="file" accept="image/*" hidden
             onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = ''; }} />
    </Card>
  );
}

export default function Manuales() {
  const [meta, setMeta] = useState(null);
  const [phs, setPhs] = useState(null);          // [{manual, title, accent, file, alt}]
  const [cargadas, setCargadas] = useState(new Set());

  // manuales + placeholders (leidos del .md servido) + estado de imagenes cargadas
  useEffect(() => {
    (async () => {
      const m = await fetch('/manuales/index.json').then((r) => r.json()).catch(() => ({ manuals: [] }));
      setMeta(m);
      const todos = [];
      for (const man of (m.manuals || [])) {
        const md = await fetch(`/manuales/${man.id}.md`).then((r) => r.text()).catch(() => '');
        const re = /!\[([^\]]*)\]\(img\/([^)]+)\)/g; let x;
        while ((x = re.exec(md))) todos.push({ manual: man.id, title: man.title, accent: man.accent, alt: x[1], file: x[2] });
      }
      setPhs(todos);
    })();
    api('/manuales/img-list').then((d) => setCargadas(new Set(d.cargadas || []))).catch(() => {});
  }, []);

  const marcar = useCallback((file, ok) => {
    setCargadas((s) => { const n = new Set(s); ok ? n.add(file) : n.delete(file); return n; });
  }, []);

  const list = (meta && meta.manuals) || [];
  const total = phs ? phs.length : 0;
  const hechas = phs ? phs.filter((p) => cargadas.has(p.file)).length : 0;
  const porManual = (id) => (phs || []).filter((p) => p.manual === id);

  return (
    <Stack>
      <PageHeader icon={<IconBook size={24} />} color="grape" title="Manuales"
        subtitle="Documentación de la plataforma · abrir, exportar a PDF y cargar las capturas de pantalla" />

      <SimpleGrid cols={{ base: 1, md: 3 }}>
        {list.map((m) => (
          <Card key={m.id} withBorder radius="lg" padding="lg" shadow="sm">
            <Group gap="sm" mb="xs">
              <ThemeIcon size={46} radius="md" variant="light" style={{ color: m.accent, background: m.accent + '18' }}>
                <span style={{ fontSize: 22 }}>{m.icon}</span>
              </ThemeIcon>
              <div style={{ minWidth: 0 }}>
                <Text fw={700} lh={1.2}>{m.title}</Text>
                <Text size="xs" c="dimmed">{m.subtitle}</Text>
              </div>
            </Group>
            <Badge size="xs" variant="light" color="gray" mb="md">Dirigido a: {m.audience}</Badge>
            <Stack gap={8}>
              <Button component="a" href={`/manuales/${m.id}.html`} target="_blank" leftSection={<IconExternalLink size={16} />} variant="filled" style={{ background: m.accent }}>
                Abrir manual
              </Button>
              <Group grow gap={8}>
                <Button component="a" href={`/manuales/${m.id}.html?print=1`} target="_blank"
                  size="xs" variant="light" leftSection={<IconFileTypePdf size={14} />}>PDF</Button>
                <Button component="a" href={`/manuales/${m.id}.md`} download size="xs" variant="light" leftSection={<IconMarkdown size={14} />}>Markdown</Button>
              </Group>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>

      <Divider my="xs" />

      <Group justify="space-between" align="flex-end">
        <div>
          <Group gap={8}><IconPhotoPlus size={20} /><Text fw={700}>Cargar capturas</Text></Group>
          <Text size="sm" c="dimmed" maw={640}>
            Cada recuadro es un lugar del manual. Pegá la captura (clic en el recuadro y <b>Ctrl+V</b>),
            arrastrala o elegí el archivo: se guarda sola en su sitio, sin tocar el diseño ni recompilar.
          </Text>
        </div>
        {phs && <Badge size="lg" variant="light" color={hechas === total && total ? 'teal' : 'grape'}>{hechas} / {total}</Badge>}
      </Group>

      {phs && total > 0 && <Progress value={(hechas / total) * 100} color="teal" radius="xl" size="sm" />}

      {!phs && <Group justify="center" p="xl"><Loader /></Group>}

      {phs && list.map((m) => (
        <div key={m.id}>
          <Group gap={8} mt="sm" mb={6}>
            <span style={{ fontSize: 16 }}>{m.icon}</span>
            <Text fw={700} size="sm">{m.title}</Text>
            <Badge size="xs" variant="light" style={{ color: m.accent, background: m.accent + '18' }}>
              {porManual(m.id).filter((p) => cargadas.has(p.file)).length} / {porManual(m.id).length}
            </Badge>
          </Group>
          <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} spacing="xs">
            {porManual(m.id).map((ph) => (
              <Zona key={ph.file} ph={ph} accent={m.accent} cargada={cargadas.has(ph.file)} onHecho={marcar} />
            ))}
          </SimpleGrid>
        </div>
      ))}

      <Alert icon={<IconClipboardCheck size={18} />} color="grape" variant="light" radius="md" mt="sm">
        <Text size="sm">
          Las imágenes quedan guardadas en el borde (volumen persistente) y se ven al instante al abrir el manual —
          también en el PDF. Para reemplazar una, tocá <b>Quitar</b> y volvé a pegar.
        </Text>
      </Alert>
    </Stack>
  );
}
