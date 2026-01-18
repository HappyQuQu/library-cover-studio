import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-4 py-2 text-sm text-[hsl(var(--foreground))] shadow-sm transition-all duration-200',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[hsl(var(--foreground))]',
          'placeholder:text-[hsl(var(--muted-foreground))]',
          'hover:border-[hsl(var(--border-light))]',
          'focus-visible:outline-none focus-visible:border-[hsl(var(--primary))] focus-visible:ring-3 focus-visible:ring-[hsl(var(--primary))]/15',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
