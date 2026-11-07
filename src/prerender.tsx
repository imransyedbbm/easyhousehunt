// Build-time only: renders the welcome screen to static HTML so first-time visitors see it
// before the app's JavaScript arrives; the app then hydrates it (src/components/WelcomeIsland.tsx). Used by scripts/inject-welcome.mjs (see "build" in package.json).
import { renderToString } from "react-dom/server";
import Welcome from "@/components/Welcome";

const noop = () => {};
export function renderWelcome(): string {
  return renderToString(<Welcome listingCount={0} onPickArea={noop} onBrowse={noop} onListProperty={noop} />);
}
