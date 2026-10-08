'use client';

/** The standard Closing Time on/off switch. Styling lives in button.ct-switch in globals.css. */
export default function Switch({ on, onChange, label, disabled, className = '' }: { on: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean; className?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} className={`ct-switch relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-50 ${on ? 'bg-[#301D5D]' : 'bg-[#E6E5EC]'} ${className}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  );
}
