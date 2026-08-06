import { Rail } from "@/components/primitives";
import Sheet from "@/components/Sheet";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Terminal from "@/components/Terminal";
import BlindSpot from "@/components/BlindSpot";
import Scan from "@/components/Scan";
import Corpus from "@/components/Corpus";
import Coverage from "@/components/Coverage";
import Rungs from "@/components/Rungs";
import Receipt from "@/components/Receipt";
import Precision from "@/components/Precision";
import CtaBand from "@/components/CtaBand";
import Evidence from "@/components/Evidence";
import Footer from "@/components/Footer";
import Motion from "@/components/Motion";

/* The whole page. Every section is a server component; the only client
   code is Motion, the tab group, the two copy buttons and the star count.
   Rails carry their own numbering, derived from CHAPTERS. */
export default function Page() {
  return (
    <>
      <Sheet />
      <Header />

      <main className="relative z-[1]">
        <Hero />
        <Terminal />

        <Rail n={1} />
        <BlindSpot />

        <Rail n={2} />
        <Scan />

        <Rail n={3} id="corpus" />
        <Corpus />

        <Rail n={4} id="watches" />
        <Coverage />

        <Rail n={5} />
        <Rungs />

        <Rail n={6} />
        <Receipt />

        <Rail n={7} />
        <Precision />

        <CtaBand />
      </main>

      <Evidence />
      <Footer />
      <Motion />
    </>
  );
}
