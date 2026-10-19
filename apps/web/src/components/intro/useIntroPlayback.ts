import { useCallback, useEffect, useReducer } from "react";
import { INTRO_DURATION, MESSAGE_DURATION } from "./demo";

export const PLAYBACK_RATES = [0.5, 1, 1.5, 2, 3] as const;
export type PlaybackState = { position: number; playing: boolean; started: boolean; rate: number; clock: number };
type Action = { now: number } & (
  | { type: "tick" | "pause" | "toggle" }
  | { type: "seek"; position: number }
  | { type: "rate"; rate: number }
);
export const initialPlayback: PlaybackState = { position: 0, playing: false, started: false, rate: 1, clock: 0 };

export function playbackReducer(state: PlaybackState, action: Action): PlaybackState {
  const position = state.playing
    ? Math.min(INTRO_DURATION, state.position + Math.max(0, action.now - state.clock) * state.rate)
    : state.position;
  const settled = { ...state, position, playing: state.playing && position < INTRO_DURATION, clock: action.now };
  switch (action.type) {
    case "tick": return state.playing ? settled : state;
    case "pause": return { ...settled, playing: false };
    case "toggle": return state.playing ? { ...settled, playing: false } : {
      ...settled, position: position >= INTRO_DURATION ? 0 : position, playing: true, started: true,
    };
    case "seek": return Number.isFinite(action.position) ? {
      ...settled, position: Math.max(0, Math.min(action.position, INTRO_DURATION)), playing: false, started: true,
    } : settled;
    case "rate": return PLAYBACK_RATES.some(rate => rate === action.rate) ? { ...settled, rate: action.rate } : settled;
  }
}

export function playbackLabel(state: PlaybackState) {
  return state.position >= INTRO_DURATION ? "Playback finished" : state.playing ? "Playing" : state.started ? "Playback paused" : "Ready to play";
}

export function playbackTime(position: number) {
  const seconds = Math.floor(position / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function useIntroPlayback(language: string) {
  const [state, dispatch] = useReducer(playbackReducer, initialPlayback);
  const pause = useCallback(() => dispatch({ type: "pause", now: Date.now() }), []);
  useEffect(() => {
    if (!state.playing) return;
    const timer = window.setInterval(() => dispatch({ type: "tick", now: Date.now() }), 100);
    return () => window.clearInterval(timer);
  }, [state.playing]);
  useEffect(() => { pause(); }, [language, pause]);
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) pause(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pause]);
  return {
    ...state, index: Math.floor(state.position / MESSAGE_DURATION), pause,
    toggle: () => dispatch({ type: "toggle", now: Date.now() }),
    seek: (position: number) => dispatch({ type: "seek", position, now: Date.now() }),
    changeRate: (rate: number) => dispatch({ type: "rate", rate, now: Date.now() }),
  };
}
