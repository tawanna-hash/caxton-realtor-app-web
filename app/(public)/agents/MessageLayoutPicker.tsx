'use client';

export type MessageLayout = 'inbox' | 'timeline' | 'strip' | 'threads' | 'split';

export const MESSAGE_LAYOUTS: { id: MessageLayout; name: string; text: string }[] = [
  { id: 'inbox', name: 'Inbox With Deal Rail', text: 'People on the left, the conversation in the middle, deal facts on the right.' },
  { id: 'timeline', name: 'One Deal Timeline', text: 'Every email and text on the deal in one feed by day. Write to several people at once.' },
  { id: 'strip', name: 'People Strip With Chat', text: 'People across the top, chat bubbles below, and quick templates.' },
  { id: 'split', name: 'Compose And History Split', text: 'Write on the left. The conversation history stays visible on the right.' },
  { id: 'threads', name: 'Thread List And Panel', text: 'A list of threads by subject. Open one in a side panel to read and reply.' },
];

/** Choose how Messages looks. Used the first time Messages opens, from Messages, and in Settings. */
export default function MessageLayoutPicker({ value, onPick, disabled }: { value: MessageLayout | null; onPick: (v: MessageLayout) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {MESSAGE_LAYOUTS.map((l) => (
        <button key={l.id} type="button" disabled={disabled} onClick={() => onPick(l.id)} className={`rounded-xl border px-4 py-3 text-left transition !bg-white hover:!bg-[#EFEAF8] hover:!text-[#1B1726] ${value === l.id ? '!border-[#301D5D] !bg-[#EFEAF8]' : 'border-[#E6E5EC]'}`}>
          <span className="block text-[14px] font-semibold text-[#1B1726]">{l.name}{value === l.id ? ' (Current)' : ''}</span>
          <span className="mt-0.5 block text-[12px] font-medium text-[#7A7787]">{l.text}</span>
        </button>
      ))}
    </div>
  );
}
