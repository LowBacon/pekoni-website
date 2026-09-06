"use client";

/**
 * The last line of defence: an error thrown by the root layout itself, before
 * fonts, providers or the design system are available. It has to render its own
 * <html> and cannot rely on anything the app normally provides, so the styling
 * here is deliberately self-contained.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fi">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#080B09",
          color: "#E8EDE4",
          fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 480 }}>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#6E7A6C",
            }}
          >
            Pekoni
          </p>
          <h1 style={{ margin: "12px 0 0", fontSize: 28, fontWeight: 600, lineHeight: 1.2 }}>
            Sovellus ei käynnistynyt.
          </h1>
          <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.6, color: "#93A08F" }}>
            Palvelin ei pystynyt muodostamaan sivua. Tarkista palvelimen loki — yleisin syy on
            puuttuva ympäristömuuttuja (DATABASE_URL tai PEKONI_SECRET) tai tietokanta, jota ei ole
            vielä luotu komennolla <code>npm run setup</code>.
          </p>

          {error.digest && (
            <p
              style={{
                margin: "18px 0 0",
                padding: "8px 12px",
                borderRadius: 10,
                background: "#0C110E",
                border: "1px solid rgba(232,237,228,0.08)",
                fontFamily: "ui-monospace, monospace",
                fontSize: 11,
                color: "#6E7A6C",
              }}
            >
              digest: {error.digest}
            </p>
          )}

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 26,
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid rgba(145,182,93,0.4)",
              background: "rgba(145,182,93,0.14)",
              color: "#B1D875",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Yritä uudelleen
          </button>
        </div>
      </body>
    </html>
  );
}
