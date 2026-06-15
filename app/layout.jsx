import "./globals.css";

export const metadata = {
  title: "RUSHMORE",
  icons: {
    icon: "/api/img?path=images%2FRushmore%2Fskull.ico",
    shortcut: "/api/img?path=images%2FRushmore%2Fskull.ico",
    apple: "/api/img?path=images%2FRushmore%2Fskull.ico",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
