import React from 'react';

/** Symbole trèfle radioactif (SVG), dans un carré arrondi à l'accent de la marque. */
export function Logo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg bg-accent text-black ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" width={size * 0.62} height={size * 0.62} fill="currentColor" role="img">
        <circle cx="50" cy="50" r="9" />
        {[0, 120, 240].map((angle) => (
          <path
            key={angle}
            d="M50 50 L67.3 80 A35 35 0 0 0 32.7 80 Z"
            transform={`rotate(${angle} 50 50)`}
          />
        ))}
      </svg>
    </span>
  );
}
