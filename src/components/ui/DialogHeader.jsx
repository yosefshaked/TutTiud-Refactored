import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Enhanced DialogHeader with gradient background and icon support
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.icon - Icon component to display in the header
 * @param {string} props.title - Title text to display
 * @param {string} props.className - Additional classes for the header container
 * @param {string} props.gradientFrom - Starting color for gradient (default: 'from-blue-600')
 * @param {string} props.gradientTo - Ending color for gradient (default: 'to-indigo-600')
 */
export function EnhancedDialogHeader({ 
  icon, 
  title, 
  className,
  gradientFrom = 'from-blue-600',
  gradientTo = 'to-indigo-600'
}) {
  return (
    <div className={cn(
      "relative border-b bg-gradient-to-r px-6 py-5",
      gradientFrom,
      gradientTo,
      className
    )}>
      <div className="flex items-center gap-3">
        {icon && (
          <div className="rounded-lg bg-white/20 backdrop-blur-sm p-2.5">
            {React.cloneElement(icon, { className: 'h-6 w-6 text-white' })}
          </div>
        )}
        <h2 className="text-2xl font-bold text-white">
          {title}
        </h2>
      </div>
      {/* Decorative gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none" />
    </div>
  );
}
