import "./globals.css";

export const metadata = {
  title: "RUSHMORE",
  description: "Personal command center",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
