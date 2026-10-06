/** Small info icon. The explanation shows on hover (native tooltip) and is readable by screen readers. */
export default function Tip({ text }: { text: string }) {
  return <span title={text} aria-label={text} className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border border-[#E6E5EC] text-[10px] font-medium leading-none text-[#7A7787]">i</span>;
}
