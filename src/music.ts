// Background music: the songs in public/music play one after another and the
// list loops, from the first press onward (browsers only allow audio after a
// user gesture). Plain HTML audio streams each file; Phaser's WebAudio sound
// manager would decode whole songs into memory, which is too much on phones.
// Module-level state, so it keeps playing across scene restarts. The music
// can be muted on its own (sound effects stay on); that choice is remembered.
// When the game sits idle (start screen, docked or sunk) for a while, the
// music fades out and stops; the next play restarts that song from the top.

const SONGS = ["music/song-1.mp3", "music/song-2.mp3", "music/song-3.mp3", "music/song-4.mp3"];
const VOLUME = 0.35; // under the sound effects
const MUTE_KEY = "boatgame.musicMuted";
const IDLE_STOP = 30000; // ms idle before the music fades out
const FADE = 3000; // ms fade-out

let audio: HTMLAudioElement | null = null;
// Start on a random song each launch, then continue in order.
let index = Math.floor(Math.random() * SONGS.length);
let failures = 0;
let muted = loadMuted();
let stoppedIdle = false; // faded out after idling; waits for play to resume
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let fadeTimer: ReturnType<typeof setInterval> | undefined;

function loadMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function resume() {
  if (audio && !muted && !stoppedIdle && !document.hidden) {
    audio.play().catch(() => {
      // blocked or interrupted; the next press or visibility change retries
    });
  }
}

function playCurrent() {
  if (!audio) return;
  audio.src = SONGS[index];
  resume();
}

function next() {
  index = (index + 1) % SONGS.length;
  playCurrent();
}

/** Start the playlist; safe to call on every press (only the first counts). */
export function startMusic() {
  if (stoppedIdle) {
    musicActive();
    return;
  }
  if (audio) {
    // A press after a blocked play() (e.g. autoplay policy) gets another try.
    if (audio.paused) resume();
    return;
  }
  audio = new Audio();
  audio.volume = VOLUME;
  audio.addEventListener("ended", () => {
    failures = 0;
    next();
  });
  // Skip a song that fails to load, but stop if every one does.
  audio.addEventListener("error", () => {
    if (++failures < SONGS.length) next();
  });
  // Pause while the app/tab is in the background.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) audio?.pause();
    else resume();
  });
  playCurrent();
}

function cancelIdle() {
  clearTimeout(idleTimer);
  clearInterval(fadeTimer);
  idleTimer = fadeTimer = undefined;
  if (audio) audio.volume = VOLUME;
}

/** The game went idle: fade out and stop after IDLE_STOP unless play resumes. */
export function musicIdle() {
  cancelIdle();
  idleTimer = setTimeout(() => {
    if (!audio) return;
    const start = performance.now();
    fadeTimer = setInterval(() => {
      if (!audio) return;
      const t = (performance.now() - start) / FADE;
      if (t < 1) {
        audio.volume = VOLUME * (1 - t);
        return;
      }
      clearInterval(fadeTimer);
      fadeTimer = undefined;
      audio.pause();
      audio.volume = VOLUME;
      stoppedIdle = true;
    }, 50);
  }, IDLE_STOP);
}

/** Play is on: cancel a pending fade, or restart the stopped song from the top. */
export function musicActive() {
  cancelIdle();
  if (!stoppedIdle) return;
  stoppedIdle = false;
  if (audio) audio.currentTime = 0;
  resume();
}

export function isMusicMuted() {
  return muted;
}

/** Mute or unmute the music. Call from a user gesture so unmuting can start it. */
export function setMusicMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // storage unavailable: the choice just isn't remembered
  }
  if (muted) audio?.pause();
  else if (audio) resume();
  else startMusic();
}
