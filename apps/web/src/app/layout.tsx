import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Darna',
  description: 'Darna — Gestion immobilière',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
