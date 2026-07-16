import '@mantine/core/styles.css';
import 'sileo/styles.css';
import 'slot-text/style.css';
import './globals.css';
import { MantineProvider, ColorSchemeScript, mantineHtmlProps } from '@mantine/core';
import DesktopToaster from './desktoptoaster';
import { theme } from './theme';
import Shell from './shell';
import { AuthProvider } from './auth';

export const metadata = {
  title: 'SBC-NG · Panel',
  description: 'Session Border Controller — borde SIP, seguridad y transcoding',
};
export const viewport = { themeColor: '#0d1117', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="es" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="dark" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning>
        <MantineProvider theme={theme} defaultColorScheme="dark">
          <DesktopToaster />
          <AuthProvider><Shell>{children}</Shell></AuthProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
