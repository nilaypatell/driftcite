import Link from "next/link";

/**
 * The full-bleed accent banner that sits above the nav.
 *
 * Deliberately outside the ruled column: it is the only element on the site
 * that spans the whole viewport, which is what makes it read as an
 * announcement rather than as page content.
 */
export default function Announcement() {
  return (
    <div
      style={{
        background: "var(--color-accent)",
        textAlign: "center",
        padding: "9px clamp(20px, 5vw, 72px)",
        fontSize: 13.5,
        fontWeight: 500,
        color: "#fff",
      }}
    >
      Introducing the GitHub App — the fix arrives as a pull request.{" "}
      <Link href="/changelog" style={{ color: "#fff" }}>
        Read the announcement →
      </Link>
    </div>
  );
}
