/**
 * Custom Pages Router error page.
 * Exists only to prevent Next.js 14 from auto-generating a broken
 * /_error page that conflicts with the App Router <html> layout.
 * The App Router handles all real routes; this is purely a build-time shim.
 */
function Error({ statusCode }: { statusCode?: number }) {
  return (
    <div style={{ fontFamily: "sans-serif", textAlign: "center", padding: "4rem" }}>
      <h1 style={{ fontSize: "4rem", color: "#00ff87" }}>{statusCode ?? "Error"}</h1>
      <p style={{ color: "#888" }}>Something went wrong.</p>
      <a href="/dashboard" style={{ color: "#00ff87", textDecoration: "none" }}>
        → Go to dashboard
      </a>
    </div>
  );
}

Error.getInitialProps = ({ res, err }: { res?: { statusCode: number }; err?: { statusCode: number } }) => {
  const statusCode = res?.statusCode ?? err?.statusCode ?? 500;
  return { statusCode };
};

export default Error;
