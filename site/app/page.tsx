import Hero from "@/components/home/Hero";
import TerminalFigure from "@/components/home/TerminalFigure";
import Stats from "@/components/home/Stats";
import SectionCase from "@/components/home/SectionCase";
import SectionRules from "@/components/home/SectionRules";
import SectionArrives from "@/components/home/SectionArrives";
import SectionReceipts from "@/components/home/SectionReceipts";
import SectionPrecision from "@/components/home/SectionPrecision";
import SectionComparison from "@/components/home/SectionComparison";
import Footnotes from "@/components/home/Footnotes";
import { Column } from "@/components/primitives";

/* Home. The announcement banner is rendered by the layout, because it sits
   above the nav and the nav is shared — see components/Announcement.tsx. */
export default function Page() {
  return (
    <Column>
      <Hero />
      <TerminalFigure />
      <Stats />
      <SectionCase />
      <SectionRules />
      <SectionArrives />
      <SectionReceipts />
      <SectionPrecision />
      <SectionComparison />
      <Footnotes />
    </Column>
  );
}
