import { forwardRef } from "react";
import { useContextMenuTrigger } from "../../hooks/useContextMenuTrigger.js";

function composeHandlers(...handlers) {
  return (event) => {
    handlers.forEach((handler) => {
      if (typeof handler === "function") {
        handler(event);
      }
    });
  };
}

const ContextMenuSurface = forwardRef(function ContextMenuSurface(
  {
    as: Tag = "div",
    contextMenu,
    onContextMenu,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClickCapture,
    ...props
  },
  ref,
) {
  const triggerProps = useContextMenuTrigger(contextMenu || {});
  return (
    <Tag
      ref={ref}
      onContextMenu={composeHandlers(onContextMenu, triggerProps.onContextMenu)}
      onPointerDown={composeHandlers(onPointerDown, triggerProps.onPointerDown)}
      onPointerMove={composeHandlers(onPointerMove, triggerProps.onPointerMove)}
      onPointerUp={composeHandlers(onPointerUp, triggerProps.onPointerUp)}
      onPointerCancel={composeHandlers(
        onPointerCancel,
        triggerProps.onPointerCancel,
      )}
      onClickCapture={composeHandlers(
        onClickCapture,
        triggerProps.onClickCapture,
      )}
      {...props}
    />
  );
});

export default ContextMenuSurface;
