"use client";

import Image from "next/image";

type Pub = "realtyline" | "newsline";

// Colors match PUBS in app/(dashboard)/dashboard/page.tsx so the hero
// blends with the pub-color bar above it.
const BRAND: Record<Pub, string> = {
  realtyline: "transparent",
  newsline: "transparent",
};

// Skyline assets per pub.
const SKYLINE: Partial<Record<Pub, { src: string; w: number; h: number }>> = {
  realtyline: { src: "/hero/austin-skyline.jpg", w: 2400, h: 1000 },
  newsline: { src: "/hero/san-antonio-skyline.jpg", w: 2400, h: 1000 },
};

type Props = {
  pub: Pub;
  eyebrow?: string;
  headline?: string;
};

export function DashboardHero({ pub, eyebrow, headline }: Props) {
  const sky = SKYLINE[pub];
  if (!sky) return null;

  return (
    <section
      aria-label={`${pub} dashboard hero`}
      className="relative w-full overflow-hidden"
      style={{ backgroundColor: BRAND[pub], aspectRatio: "12 / 5" }}
    >
      <Image
        src={sky.src}
        alt=""
        aria-hidden="true"
        fill
        priority
        sizes="100vw"
        className="object-cover object-bottom"
      />
      {(eyebrow || headline) && (
        <div className="absolute inset-0 flex flex-col justify-start p-6 sm:p-8 pointer-events-none">
          {eyebrow && (
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/70">
              {eyebrow}
            </p>
          )}
          {headline && (
            <h1 className="mt-2 max-w-[60%] text-2xl font-medium leading-tight text-white sm:text-3xl">
              {headline}
            </h1>
          )}
        </div>
      )}
    </section>
  );
}
