import "./globals.css";

export const metadata = {
  title: "RUSHMORE",
  icons: {
    icon: "/api/img?path=images%2FPersonal%2FThe%20Order%20Icon.png",
    shortcut: "/api/img?path=images%2FPersonal%2FThe%20Order%20Icon.png",
    apple: "/api/img?path=images%2FPersonal%2FThe%20Order%20Icon.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
