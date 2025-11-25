import React from 'react';

export default function InfoTooltip({ message, side = 'left' }) {
  const positionClasses = {
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
  };

  const arrowClasses = {
    left: 'left-full top-1/2 -translate-y-1/2 -ml-[5px] rotate-45',
    right: 'right-full top-1/2 -translate-y-1/2 -mr-[5px] rotate-45',
    top: 'top-full left-1/2 -translate-x-1/2 -mt-[5px] rotate-45',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 -mb-[5px] rotate-45',
  };

  return (
    <button
      type="button"
      className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-blue-600 shadow-md transition-all hover:shadow-lg hover:scale-105 group"
    >
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        viewBox="0 0 320 512"
        className="h-5 w-5 fill-white transition-transform group-hover:animate-[jello-vertical_0.7s_both]"
      >
        <path d="M80 160c0-35.3 28.7-64 64-64h32c35.3 0 64 28.7 64 64v3.6c0 21.8-11.1 42.1-29.4 53.8l-42.2 27.1c-25.2 16.2-40.4 44.1-40.4 74V320c0 17.7 14.3 32 32 32s32-14.3 32-32v-1.4c0-8.2 4.2-15.8 11-20.2l42.2-27.1c36.6-23.6 58.8-64.1 58.8-107.7V160c0-70.7-57.3-128-128-128H144C73.3 32 16 89.3 16 160c0 17.7 14.3 32 32 32s32-14.3 32-32zm80 320a40 40 0 1 0 0-80 40 40 0 1 0 0 80z" />
      </svg>
      
      <span 
        className={`absolute ${positionClasses[side]} pointer-events-none opacity-0 whitespace-nowrap rounded-md bg-gradient-to-br from-blue-400 to-blue-600 px-3 py-1.5 text-xs text-white tracking-wide transition-all duration-300 group-hover:opacity-100 ${
          side === 'left' ? 'group-hover:-translate-x-2' : 
          side === 'right' ? 'group-hover:translate-x-2' :
          side === 'top' ? 'group-hover:-translate-y-2' :
          'group-hover:translate-y-2'
        }`}
      >
        {message}
        <span 
          className={`absolute ${arrowClasses[side]} h-2.5 w-2.5 bg-blue-600`}
        />
      </span>
    </button>
  );
}
