// Fixed portrait logical resolution. Using a fixed size (with Scale.FIT) keeps
// layout predictable across devices, which matters for an accessible UI where
// the control target must stay in the same, reachable spot every time.
export const GAME_WIDTH = 450;
export const GAME_HEIGHT = 800;

// The bottom strip is the single control ("the deck"). The boat plays above it.
export const PANEL_HEIGHT = 160;
export const PLAY_HEIGHT = GAME_HEIGHT - PANEL_HEIGHT;

// Gameplay tuning — deliberately gentle and forgiving.
// Speeds past the player's boat (px/s). The water and rocks share
// SCROLL_SPEED so rocks read as anchored; vessels are under way toward the
// player, so they approach faster.
export const SCROLL_SPEED = 95;
export const DAYCRUISER_SPEED = 145;
export const FREIGHTER_SPEED = 125;

// Obstacles are spaced by when they reach the player's boat, not when they
// spawn, so the gap stays fair despite the different speeds.
export const SPAWN_DELAY = 1900; // ms between obstacles reaching the boat
export const MIN_SPAWN_GAP = 1200; // ms; stops a fast vessel overlapping a slow one at spawn

// The freighter is a rarer obstacle. Wide obstacles (the freighter and the
// big islands) get a stretched gap before and after them so there is always
// time to steer around.
export const FREIGHTER_CHANCE = 0.15;
export const WIDE_WIDTH = 150; // px; obstacles wider than this count as wide
export const WIDE_GAP = 1.7; // multiplier on SPAWN_DELAY

// Obstacles float at a random height; keep them away from the very edges so
// there is room to pass on either side.
export const SPAWN_MIN_Y = 100;
export const SPAWN_MAX_Y = PLAY_HEIGHT - 100;

export const GRAVITY = 620; // downward pull when not steering up
export const THRUST = 1500; // upward acceleration while the wheel is held
export const MAX_FALL = 360; // clamp speeds so motion stays readable
