import { useCallback, useEffect, useState, type RefObject } from "react";

/** Wraps the Fullscreen API for a single element, staying in sync with the
 * native fullscreenchange event (e.g. when the operator presses Escape). */
export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [ref]);

  const enter = useCallback(() => {
    void ref.current?.requestFullscreen?.();
  }, [ref]);

  const exit = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
  }, []);

  const toggle = useCallback(() => (isFullscreen ? exit() : enter()), [isFullscreen, enter, exit]);

  return { isFullscreen, enter, exit, toggle };
}
