import { useCall } from "./GlobalCallProvider";
import { IncomingCallPopup } from "./IncomingCallPopup";
import FullScreenCallView from "./FullScreenCallView";
import FloatingCallWindow from "./FloatingCallWindow";

// Renders whatever the call state needs: ringing popups, the full meeting, or the small draggable window.
// It is mounted by GlobalCallProvider, so it is never torn down by route changes.
export default function GlobalCallManager() {
  const { active, view, incoming } = useCall();
  return (
    <>
      {incoming.length > 0 && (
        <div className="fixed right-4 top-4 z-[110] grid w-[min(22rem,calc(100vw-2rem))] gap-3">
          {incoming.map((c) => <IncomingCallPopup key={c.id} call={c} busy={!!active} />)}
        </div>
      )}
      {active && (view === "full" ? <FullScreenCallView /> : <FloatingCallWindow />)}
    </>
  );
}
