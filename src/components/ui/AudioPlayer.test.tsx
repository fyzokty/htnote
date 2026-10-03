import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AudioPlayer } from "./AudioPlayer";
import { audioBarHeights, audioFileName, formatAudioTime } from "./audioPlayerUtils";

function mount() {
  const view = render(<AudioPlayer src="./assets/recording%20one.wav" title="Recording" />);
  const audio = view.container.querySelector("audio")!;
  let paused = true;
  Object.defineProperties(audio, { duration: { configurable: true, value: 125 }, paused: { configurable: true, get: () => paused } });
  const play = vi.spyOn(audio, "play").mockImplementation(async () => { paused = false; fireEvent.play(audio); });
  const pause = vi.spyOn(audio, "pause").mockImplementation(() => { paused = true; fireEvent.pause(audio); });
  fireEvent.loadedMetadata(audio);
  return { ...view, audio, play, pause };
}

describe("AudioPlayer", () => {
  it("formats finite times and generates stable decorative bars", () => {
    expect([0, 65.9, 125, Infinity, NaN, -5].map(formatAudioTime)).toEqual(["0:00", "1:05", "2:05", "0:00", "0:00", "0:00"]);
    expect(audioFileName("./assets/a%20b.wav?rev=1")).toBe("a b.wav");
    expect(audioFileName("./assets/%broken.wav")).toBe("%broken.wav");
    expect(audioFileName("data:audio/wav;base64,abc")).toBe("");
    expect(audioBarHeights("a")).toEqual(audioBarHeights("a"));
    expect(audioBarHeights("a")).not.toEqual(audioBarHeights("b"));
    expect(audioBarHeights("a").every((height) => height >= 25 && height <= 100)).toBe(true);
  });

  it("plays, pauses and mutes the hidden source without native download controls", () => {
    const { audio, play, pause, container } = mount();
    expect(audio.hidden).toBe(true);
    expect(audio.controls).toBe(false);
    expect(audio).toHaveAttribute("controlslist", "nodownload");
    expect(screen.getByText("recording one.wav")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Oynat" }));
    expect(play).toHaveBeenCalledOnce();
    expect(container.querySelector(".ht-audio-card")).toHaveAttribute("data-playing", "true");
    fireEvent.click(screen.getByRole("button", { name: "Duraklat" }));
    expect(pause).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Sesi kapat" }));
    expect(audio.muted).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Sesi aç" }));
    expect(audio.muted).toBe(false);
  });

  it("seeks by five seconds with keys, clamps endpoints and supports Space", () => {
    const { audio, play } = mount();
    const slider = screen.getByRole("slider", { name: "Ses konumu" });
    expect(screen.getByText("0:00 / 2:05")).toBeInTheDocument();
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(audio.currentTime).toBe(5);
    expect(slider).toHaveAttribute("aria-valuenow", "5");
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(audio.currentTime).toBe(0);
    fireEvent.keyDown(slider, { key: "End" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(audio.currentTime).toBe(125);
    fireEvent.keyDown(slider, { key: "Home" });
    fireEvent.keyDown(slider, { key: " " });
    expect(play).toHaveBeenCalledOnce();
    fireEvent.keyDown(slider, { key: "ArrowRight", ctrlKey: true });
    expect(audio.currentTime).toBe(0);
  });

  it("seeks on click and pointer drag, then releases capture", () => {
    const { audio } = mount();
    const slider = screen.getByRole("slider");
    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({ left: 10, width: 100 } as DOMRect);
    slider.setPointerCapture = vi.fn(); slider.hasPointerCapture = () => true; slider.releasePointerCapture = vi.fn();
    fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientX: 60 });
    expect(audio.currentTime).toBe(62.5);
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 110 });
    expect(audio.currentTime).toBe(125);
    fireEvent.pointerUp(slider, { pointerId: 1, clientX: 10 });
    expect(audio.currentTime).toBe(0);
    expect(slider.releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it("disables seek before metadata and handles playback failure without unhandled rejection", async () => {
    const view = render(<AudioPlayer><source src="./assets/a.wav" /></AudioPlayer>);
    const audio = view.container.querySelector("audio")!;
    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("aria-disabled", "true");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(audio.currentTime).toBe(0);
    vi.spyOn(audio, "play").mockRejectedValue(new Error("Unavailable"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Oynat" })); });
    expect(screen.getByRole("status")).toHaveTextContent("Ses oynatılamadı.");
    expect(screen.getByRole("button", { name: "Oynat" })).toBeDisabled();
  });
});
