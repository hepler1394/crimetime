import "./globals.css";

export const metadata = {
  title: "CrimeTimeSnacks",
  description: "A true crime podcast. Snack-sized cases, fully examined.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="wrap">
          <a className="mark" href="/">CRIME<em>TIME</em>SNACKS</a>
          {children}
        </div>
      </body>
    </html>
  );
}
