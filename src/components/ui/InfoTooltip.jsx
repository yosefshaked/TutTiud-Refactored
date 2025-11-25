import React from 'react';
import { Info } from 'lucide-react';

export default function InfoTooltip({ message, side = 'top' }) {
  const positionClasses = {
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
  };

  return (
    <div className="relative inline-flex items-center group" style={{ zIndex: 10000 }}>
      <button
        type="button"
        className="h-5 w-5 p-0 shrink-0 inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <Info className="h-3 w-3 text-muted-foreground group-hover:animate-jello-vertical" />
      </button>
      <span
        style={{ zIndex: 10001 }}
        className={`
          absolute ${positionClasses[side]}
          px-2 py-1 text-xs text-white rounded shadow-lg
          bg-gradient-to-br from-blue-400 to-blue-600
          opacity-0 group-hover:opacity-100
          transition-opacity duration-200
          pointer-events-none whitespace-nowrap
        `}
      >
        {message}
      </span>
    </div>
  );
}
