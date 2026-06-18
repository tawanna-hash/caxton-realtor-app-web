// App-wide style constants applied as inline `style={...}` to enforce
// font choices on portaled / fixed-position elements where Tailwind classes
// can't reliably win the cascade.
//
// As of the font-consistency refresh (June 2026), the app-wide body font
// is wired globally via next/font (Inter) in app/layout.tsx, and Tailwind's
// `font-sans` token resolves through it. Inline `style={SW}` is no longer
// needed anywhere, but the export is preserved as an empty object so
// existing call sites compile without churn. A follow-up pass can drop
// the spreads entirely.

export const SW = {} as const;
