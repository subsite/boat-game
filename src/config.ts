// Fixed portrait logical resolution. Using a fixed size (with Scale.FIT) keeps
// layout predictable across devices, which matters for an accessible UI where
// the control target must stay in the same, reachable spot every time.
export const GAME_WIDTH = 450;
export const GAME_HEIGHT = 800;

// The bottom strip is the single control ("the deck"). The boat plays above it.
export const PANEL_HEIGHT = 160;
export const PLAY_HEIGHT = GAME_HEIGHT - PANEL_HEIGHT;

// Gameplay tuning — deliberately gentle and forgiving.
export const SCROLL_SPEED = 115; // slow horizontal pace
export const SPAWN_DELAY = 1900; // ms between free-floating obstacles

// Obstacles float at a random height; keep them away from the very edges so
// there is room to pass on either side.
export const SPAWN_MIN_Y = 100;
export const SPAWN_MAX_Y = PLAY_HEIGHT - 100;

export const GRAVITY = 620; // downward pull when not steering up
export const THRUST = 1500; // upward acceleration while the wheel is held
export const MAX_FALL = 360; // clamp speeds so motion stays readable
