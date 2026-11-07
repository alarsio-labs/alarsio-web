"use client";

import { useEffect, useRef } from "react";

/**
 * The home page's product video. Nothing downloads until it is on screen (preload="none");
 * then it plays muted and loops, and pauses when it scrolls away. Under reduced motion it never
 * starts by itself. Native controls stay on, so a visitor can pause, replay or go full screen.
 */
export function AdVideo({ src, poster, label }: { src: string; poster: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let userPaused = false;
    // The pause event fires after pause() returns, so the flag is cleared in the handler.
    let autoPausing = false;
    const onPause = () => {
      if (autoPausing) autoPausing = false;
      else userPaused = true;
    };
    const onPlay = () => { userPaused = false; };
    video.addEventListener("pause", onPause);
    video.addEventListener("play", onPlay);

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        // isIntersecting stays true while any pixel shows, so go by the ratio.
        const inView = entry.intersectionRatio >= 0.5;
        if (inView && !userPaused && video.paused) {
          video.play().catch(() => {});
        } else if (!inView && !video.paused) {
          // A pause we cause on scroll is not the visitor's choice.
          autoPausing = true;
          video.pause();
        }
      },
      { threshold: 0.5 }
    );
    io.observe(video);
    return () => {
      io.disconnect();
      video.removeEventListener("pause", onPause);
      video.removeEventListener("play", onPlay);
    };
  }, []);

  return (
    <video
      ref={ref}
      className="hm-video"
      src={src}
      poster={poster}
      aria-label={label}
      preload="none"
      width={1920}
      height={1080}
      muted
      loop
      playsInline
      controls
      controlsList="nodownload noremoteplayback"
      disablePictureInPicture
    />
  );
}
