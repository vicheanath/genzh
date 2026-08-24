import { Easing, ReduceMotion, type WithSpringConfig, type WithTimingConfig } from 'react-native-reanimated';

/**
 * The app's motion vocabulary.
 *
 * Three springs and two timings, named for what they are *for* rather than by
 * their stiffness — so a sheet and a dialog cannot end up with two different
 * ideas of what "settling" feels like, and a tuning change happens once.
 *
 * Every config passes `reduceMotion: ReduceMotion.System`: when someone has
 * turned on Reduce Motion, Reanimated collapses the animation to its end state
 * instead of playing it. That setting is an accessibility need — vestibular
 * disorders make large sliding transitions genuinely unpleasant — and honouring
 * it is free here but impossible to retrofit onto a hundred call sites.
 */

/** Panels arriving and leaving: sheets, dialogs, the call bar. */
export const SPRING_PANEL: WithSpringConfig = {
  damping: 22,
  stiffness: 220,
  mass: 0.9,
  reduceMotion: ReduceMotion.System,
};

/** Small controls responding to a touch: switches, checkboxes, chips. */
export const SPRING_CONTROL: WithSpringConfig = {
  damping: 16,
  stiffness: 320,
  mass: 0.6,
  reduceMotion: ReduceMotion.System,
};

/** A gesture being released — softer, because the finger set the velocity. */
export const SPRING_GESTURE: WithSpringConfig = {
  damping: 26,
  stiffness: 180,
  mass: 1,
  reduceMotion: ReduceMotion.System,
};

/** Colour and opacity crossfades, where a spring would look like a wobble. */
export const TIMING_FAST: WithTimingConfig = {
  duration: 140,
  easing: Easing.out(Easing.quad),
  reduceMotion: ReduceMotion.System,
};

export const TIMING_BASE: WithTimingConfig = {
  duration: 220,
  easing: Easing.bezier(0.22, 1, 0.36, 1),
  reduceMotion: ReduceMotion.System,
};

/** How far a sheet has to be dragged before letting go dismisses it. */
export const SHEET_DISMISS_RATIO = 0.28;

/** A downward flick this fast dismisses regardless of distance. */
export const SHEET_DISMISS_VELOCITY = 900;
