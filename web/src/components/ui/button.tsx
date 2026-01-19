import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium text-[hsl(var(--foreground))] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--background))] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-[hsl(var(--primary))] text-white shadow-lg shadow-[hsl(var(--primary))]/25 hover:shadow-xl hover:shadow-[hsl(var(--primary))]/30 hover:-translate-y-0.5 active:translate-y-0',
        destructive:
          'bg-[hsl(var(--destructive))] text-white shadow-lg shadow-[hsl(var(--destructive))]/25 hover:shadow-xl hover:shadow-[hsl(var(--destructive))]/30',
        outline:
          'border border-[hsl(var(--border))] bg-transparent text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] hover:border-[hsl(var(--border-light))]',
        secondary:
          'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] hover:border-[hsl(var(--border-light))]',
        ghost:
          'text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]',
        link: 'text-[hsl(var(--primary))] underline-offset-4 hover:underline',
        gradient:
          'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/30 hover:-translate-y-0.5 active:translate-y-0'
      },
      size: {
        default: 'h-10 px-5 py-2',
        sm: 'h-8 rounded-lg px-3.5 text-xs',
        lg: 'h-11 rounded-xl px-8 text-base',
        icon: 'h-10 w-10 p-0'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
