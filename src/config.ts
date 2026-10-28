// Fixed portrait logical resolution. Using a fixed size (with Scale.FIT) keeps
// layout predictable across devices, which matters for an accessible UI where
// the control target must stay in the same, reachable spot every time.
export const GAME_WIDTH = 450;
export const GAME_HEIGHT = 800;

// The bottom strip is the single control ("the deck"). The boat plays above it.
export const PANEL_HEIGHT = 160;
export const PLAY_HEIGHT = GAME_HEIGHT - PANEL_HEIGHT;

// Size of the boats and obstacles. Bigger is easier to see; obstacle spacing
// (SPAWN_DELAY, MIN_SPAWN_GAP) is scaled up with it so it isn't harder.
export const OBJECT_SCALE = 1.3;

// Gameplay tuning — deliberately gentle and forgiving.
// Speeds past the player's boat (px/s). The water and rocks share
// SCROLL_SPEED so rocks read as anchored; vessels are under way toward the
// player, so they approach faster.
export const SCROLL_SPEED = 95;
export const FERRY_SPEED = 125;
export const SUOMENLINNA_SPEED = 120;
export const FALKO_SPEED = 120;

// Obstacles are spaced by when they reach the player's boat, not when they
// spawn, so the gap stays fair despite the different speeds.
export const SPAWN_DELAY = 2500; // ms between obstacles reaching the boat
export const MIN_SPAWN_GAP = 1600; // ms; stops a fast vessel overlapping a slow one at spawn

// Vessels are rarer than rocks and islands. Wide obstacles (the ferries,
// Falkö and the big islands) get a stretched gap before and after them so there is always
// time to steer around.
export const FERRY_CHANCE = 0.15; // Utö
export const SUOMENLINNA_CHANCE = 0.15; // white Suomenlinna passenger ferry
export const FALKO_CHANCE = 0.15; // yellow Falkö cargo ferry
export const FERRY_WIDTH = 285; // px on screen, before OBJECT_SCALE
export const SUOMENLINNA_WIDTH = 245;
export const FALKO_WIDTH = 240;
export const WIDE_WIDTH = 150; // px, before OBJECT_SCALE; wider counts as wide
export const WIDE_GAP = 2.0; // multiplier on SPAWN_DELAY
// Rocks and islands following each other get extra room too, so they are
// sparser and there is always open water to steer through between them.
export const ROCK_GAP = 1.5; // multiplier on SPAWN_DELAY, rock after rock

// Obstacles float at a random height; keep them away from the very edges so
// there is room to pass on either side.
export const SPAWN_MIN_Y = 100;
export const SPAWN_MAX_Y = PLAY_HEIGHT - 100;

export const GRAVITY = 620; // downward pull when not steering up
export const THRUST = 1500; // upward acceleration while the wheel is held
export const MAX_FALL = 360; // clamp speeds so motion stays readable
