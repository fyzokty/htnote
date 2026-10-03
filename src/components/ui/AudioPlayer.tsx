import { useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useTranslation } from "react-i18next";

import { IconButton } from "./IconButton";
import { audioBarHeights, audioFileName, formatAudioTime } from "./audioPlayerUtils";

interface Props {
  src?: string;
  nameSrc?: string;
  title?: string;
  loop?: boolean;
  muted?: boolean;
  children?: ReactNode;
}

export function AudioPlayer({ src, nameSrc, title, loop, muted, children }: Props) {
  const { t } = useTranslation();
  const audio = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState({ playing: false, muted: !!muted, time: 0, duration: 0, failed: false });
  const sync = () => {
    const media = audio.current!;
    setState({ playing: !media.paused && !media.ended, muted: media.muted, time: media.currentTime,
      duration: Number.isFinite(media.duration) ? media.duration : 0, failed: !!media.error });
  };
  const toggle = () => {
    const media = audio.current!;
    if (media.paused) void media.play().catch(() => setState((previous) => ({ ...previous, failed: true })));
    else media.pause();
  };
  const seek = (time: number) => {
    if (!state.duration || state.failed) return;
    audio.current!.currentTime = Math.max(0, Math.min(state.duration, time));
    sync();
  };
  const pointerSeek = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width) seek((event.clientX - rect.left) / rect.width * state.duration);
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault(); event.stopPropagation();
      seek(state.time + (event.key === "ArrowRight" ? 5 : -5));
    } else if (event.key === " " && !(event.target as HTMLElement).closest("button")) {
      event.preventDefault(); event.stopPropagation(); if (!state.failed) toggle();
    } else if ((event.key === "Home" || event.key === "End") && (event.target as HTMLElement).getAttribute("role") === "slider") {
      event.preventDefault(); event.stopPropagation(); seek(event.key === "Home" ? 0 : state.duration);
    }
  };
  const file = audioFileName(src || nameSrc || "");
  const name = title || file || t("audioPlayer.title");
  return <div className="ht-audio-card htnote-media-preview" data-playing={state.playing} onKeyDown={keyboard}>
    <audio ref={audio} hidden src={src} controlsList="nodownload" preload="metadata" loop={loop} muted={muted}
      onLoadedMetadata={sync} onDurationChange={sync} onTimeUpdate={sync} onPlay={sync} onPause={sync}
      onEnded={sync} onVolumeChange={sync} onError={sync} onEmptied={sync}>{children}</audio>
    <IconButton type="button" variant="primary" className="ht-audio-play" disabled={state.failed}
      label={t(state.playing ? "audioPlayer.pause" : "audioPlayer.play")} onClick={toggle}>
      {state.playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
    </IconButton>
    <div className="ht-audio-main">
      <div className="ht-audio-title" title={name}>{name}{title && file && <small>{file}</small>}</div>
      <div className="ht-audio-progress" role="slider" tabIndex={0} aria-label={t("audioPlayer.seek")}
        aria-valuemin={0} aria-valuemax={state.duration} aria-valuenow={state.time}
        aria-valuetext={`${formatAudioTime(state.time)} / ${formatAudioTime(state.duration)}`}
        aria-disabled={!state.duration || state.failed} onPointerDown={(event) => {
          if (event.button !== 0 || !state.duration || state.failed) return;
          event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); pointerSeek(event);
        }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) pointerSeek(event); }}
        onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) { pointerSeek(event); event.currentTarget.releasePointerCapture(event.pointerId); } }}>
        {audioBarHeights(name).map((height, index) => <span key={index} aria-hidden="true" className="ht-audio-bar"
          data-played={state.duration > 0 && index / 40 <= state.time / state.duration}
          style={{ height: `${height}%`, animationDelay: `${index * 37}ms` }} />)}
      </div>
    </div>
    <span className="ht-audio-time">{formatAudioTime(state.time)} / {formatAudioTime(state.duration)}</span>
    <IconButton type="button" className="ht-audio-mute" label={t(state.muted ? "audioPlayer.unmute" : "audioPlayer.mute")}
      onClick={() => { audio.current!.muted = !audio.current!.muted; sync(); }}>
      {state.muted ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
    </IconButton>
    {state.failed && <span className="ht-audio-error" role="status">{t("audioPlayer.error")}</span>}
  </div>;
}
