import ComingSoon from '../agents/ComingSoon';

// The home page waits on a sign-in check before it can render. Show the public landing page meanwhile,
// so visitors (and speed tests) get real text on the first paint instead of grey placeholder bars.
export default function Loading() {
  return <ComingSoon />;
}
