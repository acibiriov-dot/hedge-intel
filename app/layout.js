import Nav from "../components/Nav";

export const metadata = { title: "Hedge Intel — OKI", description: "Elite Market Intelligence" };

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body style={{ margin: 0, padding: 0, background: "#15181C" }}>
        <Nav />
        {children}
      </body>
    </html>
  );
}
