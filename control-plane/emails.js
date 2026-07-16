'use strict';
/* ============================================================================
 *  SBC-NG · plantillas de correo (HTML)
 *
 *  El borde tiene cosas para avisar y ninguna sirve si llega como un texto plano
 *  feo. Acá viven las plantillas: un layout base (shell) y una plantilla por tipo
 *  de evento (alerta, resumen, prueba), con el color del tema según el evento.
 *  Portado del sistema de PBX-NG, recortado a lo que un SBC necesita.
 * ==========================================================================*/
const THEMES = {
  security:  { accent: '#e11d48', soft: '#fff1f3', icon: '🛡️', kicker: 'Seguridad' },
  attack:    { accent: '#be123c', soft: '#fff1f3', icon: '🚨', kicker: 'Seguridad · ataque en curso' },
  auth:      { accent: '#2563eb', soft: '#eff6ff', icon: '🔑', kicker: 'Acceso al panel' },
  infra:     { accent: '#dc2626', soft: '#fef2f2', icon: '⚡', kicker: 'Infraestructura' },
  recovered: { accent: '#16a34a', soft: '#f0fdf4', icon: '✅', kicker: 'Servicio recuperado' },
  fraud:     { accent: '#7c3aed', soft: '#f5f3ff', icon: '💸', kicker: 'Antifraude' },
  digest:    { accent: '#0d9488', soft: '#f0fdfa', icon: '📊', kicker: 'Resumen del borde' },
  info:      { accent: '#475569', soft: '#f8fafc', icon: 'ℹ️', kicker: 'Aviso' },
};
const THEME_BY_EVENT = {
  'security.attack': 'attack', 'security.ban': 'security',
  'service.down': 'infra', 'service.up': 'recovered',
  'trunk.down': 'infra', 'trunk.up': 'recovered',
  'fraud.toll': 'fraud', 'digest.daily': 'digest',
};
const themeFor = (kind) => THEMES[kind] || THEMES.info;
const esc = (t) => String(t == null ? '' : t).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

// Logo de la app (el escudo con los dos dialogos) como SVG inline: se ve solo, sin
// depender de imagenes externas ni del dominio del panel (appliance sin hardcode).
// Los clientes que descartan SVG (Gmail) caen limpio al wordmark "SBC-NG" de al lado.
function emailLogo(size = 72) {
  // Imagen por CID (adjunto inline): es la unica forma que Gmail muestra SIEMPRE.
  return `<img src="cid:sbclogo" width="${size}" height="${size}" alt="SBC-NG" style="display:block;border:0;outline:none;text-decoration:none;margin:0 auto;border-radius:16px" />`;
}

function shell({ brand = 'SBC-NG', kind = 'info', kicker, title, subtitle = '', preheader = '', body = '', cta = null, foot = '' }) {
  const t = themeFor(kind);
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f1f4f9;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader || subtitle || title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f4f9;padding:26px 12px;">
 <tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(16,24,40,.08);font-family:-apple-system,'Segoe UI',Roboto,Inter,Arial,sans-serif;">
   <tr><td style="height:5px;background:${t.accent};line-height:5px;font-size:0;">&nbsp;</td></tr>
   <tr><td align="center" style="padding:26px 26px 0 26px;">
     ${emailLogo(74)}
     <div style="font-size:21px;font-weight:800;letter-spacing:-.3px;color:#0f172a;line-height:1;margin-top:12px;">${esc(brand)}</div>
     <div style="font-size:11.5px;color:#94a3b8;line-height:1.5;margin-top:4px;">Session Border Controller</div>
     <div style="border-top:1px solid #eef1f7;margin-top:18px;"></div>
   </td></tr>
   <tr><td style="padding:18px 26px 0 26px;">
     <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
       <td width="46" valign="top"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
         <td align="center" valign="middle" width="42" height="42" style="width:42px;height:42px;background:${t.soft};border-radius:11px;font-size:20px;line-height:42px;">${t.icon}</td>
       </tr></table></td>
       <td valign="middle" style="padding-left:12px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:${t.accent};">${esc(kicker || t.kicker)}</div>
        <div style="font-size:19px;font-weight:700;color:#0f172a;line-height:1.3;margin-top:2px;">${esc(title)}</div>
       </td>
     </tr></table>
     ${subtitle ? `<div style="font-size:13.5px;color:#64748b;line-height:1.5;margin-top:10px;">${esc(subtitle)}</div>` : ''}
   </td></tr>
   <tr><td style="padding:18px 26px 0 26px;">${body}</td></tr>
   ${cta ? `<tr><td align="center" style="padding:22px 26px 4px 26px;">
     <table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" style="background:${t.accent};border-radius:10px;">
      <a href="${esc(cta.url)}" style="display:inline-block;padding:12px 26px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">${esc(cta.label)}</a>
     </td></tr></table>
   </td></tr>` : ''}
   ${foot ? `<tr><td style="padding:18px 26px 0 26px;"><div style="border-top:1px solid #eef1f7;padding-top:14px;font-size:12.5px;color:#64748b;line-height:1.55;">${foot}</div></td></tr>` : ''}
   <tr><td style="padding:20px 26px 24px 26px;"><div style="font-size:11px;color:#94a3b8;line-height:1.5;">Enviado automáticamente por <b style="color:#64748b;">${esc(brand)}</b> · Session Border Controller. No respondas a este correo.</div></td></tr>
  </table>
 </td></tr>
</table>
</body></html>`;
}

function rowsTable(rows = []) {
  if (!rows.length) return '';
  const body = rows.map(([k, v], i) => `
    <tr>
      <td style="padding:9px 0;border-bottom:${i === rows.length - 1 ? 'none' : '1px solid #f1f5f9'};font-size:13px;color:#64748b;">${esc(k)}</td>
      <td align="right" style="padding:9px 0;border-bottom:${i === rows.length - 1 ? 'none' : '1px solid #f1f5f9'};font-size:13px;color:#0f172a;font-weight:600;">${esc(v)}</td>
    </tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eef1f7;border-radius:12px;padding:4px 14px;">${body}</table>`;
}

function callout(text, kind) {
  const t = themeFor(kind);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;background:${t.soft};border-left:3px solid ${t.accent};border-radius:8px;">
    <tr><td style="padding:12px 14px;font-size:13px;color:#334155;line-height:1.55;">${text}</td></tr></table>`;
}

function kpiGrid(kpis = [], accent = '#0d9488') {
  const cells = [];
  for (let i = 0; i < kpis.length; i += 2) {
    const pair = [kpis[i], kpis[i + 1]].filter(Boolean);
    cells.push(`<tr>${pair.map((k) => `
      <td width="50%" style="padding:5px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #eef1f7;border-radius:12px;">
          <tr><td align="center" style="padding:14px 8px;">
            <div style="font-size:26px;font-weight:800;color:${k.color || accent};line-height:1.1;">${esc(k.value)}</div>
            <div style="font-size:11.5px;color:#64748b;margin-top:4px;">${esc(k.label)}</div>
          </td></tr>
        </table>
      </td>`).join('') + (pair.length === 1 ? '<td width="50%"></td>' : '')}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cells.join('')}</table>`;
}

// --- por tipo ---------------------------------------------------------------
function alertEmail({ brand = 'SBC-NG', event, severity = 'warn', title, lines = [], foot = '', panelUrl = '' }) {
  let kind = THEME_BY_EVENT[event] || 'info';
  if (severity === 'info' && (event === 'trunk.down' || event === 'service.down')) kind = 'recovered';
  const sub = severity === 'crit' ? 'Requiere tu atención ahora.' : severity === 'warn' ? 'Conviene revisarlo.' : '';
  const body = rowsTable(lines) + (foot ? callout(foot, kind) : '');
  return shell({ brand, kind, title, subtitle: sub,
    preheader: title + (lines[0] ? ' · ' + lines[0][0] + ': ' + lines[0][1] : ''),
    body, cta: panelUrl ? { url: panelUrl, label: 'Ver en el panel' } : null });
}

function digestEmail({ brand = 'SBC-NG', title = 'Resumen del borde', kpis = [], rows = [], panelUrl = '' }) {
  const t = themeFor('digest');
  const body = kpiGrid(kpis, t.accent)
    + (rows.length ? `<div style="font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#94a3b8;margin:18px 0 8px;">Detalle</div>` + rowsTable(rows) : '');
  return shell({ brand, kind: 'digest', title, subtitle: 'Así estuvo el borde en el período.',
    preheader: title, body, cta: panelUrl ? { url: panelUrl, label: 'Abrir el panel' } : null });
}

function testEmail({ brand = 'SBC-NG' }) {
  return shell({ brand, kind: 'recovered', kicker: 'Prueba de correo',
    title: 'El correo funciona', subtitle: 'La configuración SMTP del borde es correcta.',
    body: callout('Ya podés activar las alertas automáticas del SBC (ataques, motores caídos, troncales, fraude).', 'recovered') });
}

module.exports = { shell, rowsTable, callout, kpiGrid, alertEmail, digestEmail, testEmail, THEMES, THEME_BY_EVENT };
