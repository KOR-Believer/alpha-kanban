import { useLayoutEffect, useRef } from "react";
import { appActivity } from "./activity";

// Block an update until the user saves or explicitly discards this draft.
export function usePwaDraft(dirty: boolean) {
  const owner = useRef({});
  useLayoutEffect(() => {
    const key = owner.current;
    appActivity.setDraft(key, dirty);
    return () => appActivity.setDraft(key, false);
  }, [dirty]);
}
