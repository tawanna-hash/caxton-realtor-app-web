import { LANDING_HTML, LANDING_STYLE } from './landing-content';

// Public home page for Closing Time. Shown to visitors who are not signed in to an enabled account.
export default function ComingSoon() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: LANDING_STYLE }} />
      <div dangerouslySetInnerHTML={{ __html: LANDING_HTML }} />
    </>
  );
}
