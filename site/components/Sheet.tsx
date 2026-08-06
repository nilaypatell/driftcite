/* The ruled sheet: two margin rules carrying ruler ticks, two interior
   construction lines. Fixed, so the drawing stays put while the content
   moves. Positions are the drawing's, not the container's — they hang off
   the centre line so the rules keep their distance from the 1112px page
   at every width. */

export default function Sheet() {
  return (
    <div className="dc-sheet" aria-hidden="true">
      <u style={{ left: "calc(50% - 559px)" }} />
      <i style={{ left: "calc(50% - 556px)" }} />
      <i className="faint" style={{ left: "calc(50% - 185px)" }} />
      <i className="faint" style={{ left: "calc(50% + 185px)" }} />
      <i style={{ left: "calc(50% + 556px)" }} />
      <u style={{ left: "calc(50% + 553px)" }} />
    </div>
  );
}
