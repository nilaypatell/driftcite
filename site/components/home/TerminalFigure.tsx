const PRE: React.CSSProperties = { whiteSpace: "pre" };

/** A blank output line. Sized in the body's own line-height so the gaps in
 *  the transcript are real terminal rows, not arbitrary margins. */
function Gap() {
  return <div className="dc-rise" style={{ height: "1.85em" }} />;
}

/**
 * Fig. 1 — the scan, verbatim.
 *
 * Every line here is real driftcite output: two breaking findings, each with
 * the provider's own evidence URL and the call site that trips over it. The
 * lines stagger in so the panel reads as a scan running, not as a picture of
 * one.
 */
export default function TerminalFigure() {
  return (
    <figure className="dc-rise" style={{ margin: "0 auto 84px", maxWidth: 940 }}>
      <div className="dc-term">
        <div className="hd">
          <span>driftcite — a scan</span>
          <span>exit 1</span>
        </div>

        <div className="body" data-stagger="120">
          <div className="dc-rise" style={PRE}>
            <span className="p">$</span>
            {" npx driftcite ."}
          </div>

          <Gap />

          <div className="dc-rise" style={PRE}>
            <span className="brk">[BREAKING]</span>{" "}
            <span style={{ fontWeight: 600 }}>
              openai/model_id/text-davinci-003
            </span>{" "}
            <span className="muted">
              -- retired (DIED 935 days ago, 2024-01-04)
            </span>
          </div>
          <div className="dc-rise muted" style={PRE}>
            {"  Shut down. Requests fail."}
          </div>
          <div className="dc-rise muted" style={PRE}>
            {"  use instead: "}
            <span className="ok">gpt-3.5-turbo-instruct</span>
          </div>
          <div className="dc-rise faint" style={PRE}>
            {"  evidence: https://developers.openai.com/api/docs/deprecations"}
          </div>
          <div className="dc-rise faint" style={PRE}>
            {'    models.py:6  LEGACY = "text-davinci-003"'}
          </div>

          <Gap />

          <div className="dc-rise" style={PRE}>
            <span className="brk">[BREAKING]</span>{" "}
            <span style={{ fontWeight: 600 }}>
              stripe/endpoint//v1/invoices/upcoming
            </span>{" "}
            <span className="muted">-- removed</span>
          </div>
          <div className="dc-rise muted" style={PRE}>
            {"  GET /v1/invoices/upcoming existed in 2024-06-20 and is gone in 2026-06-24."}
          </div>
          <div className="dc-rise faint" style={PRE}>
            {"  evidence: https://github.com/stripe/openapi/compare/v1200...v2345"}
          </div>
          <div className="dc-rise faint" style={PRE}>
            {'    billing.js:5  return stripe.request("GET", "/v1/invoices/upcoming", { customer })'}
          </div>

          <Gap />

          <div className="dc-rise" style={PRE}>
            <span className="p">$</span>{" "}
            <span className="dc-cursor" aria-hidden="true" />
          </div>
        </div>
      </div>

      <figcaption
        className="dc-muted"
        style={{
          fontSize: 12.5,
          lineHeight: "20px",
          marginTop: 12,
          maxWidth: "60ch",
        }}
      >
        <span
          style={{
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontSize: 11,
            color: "var(--color-accent-700)",
          }}
        >
          Fig. 1
        </span>{" "}
        — a scan of a real repository, July 2026. Every finding carries the
        provider’s own evidence URL, and severity is computed against today’s
        date, not the manifest’s.
      </figcaption>
    </figure>
  );
}
