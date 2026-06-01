/*
 * Dataverse Spreadsheet
 * Author: Jeroen Jonckheer
 * License: MIT
 *
 * Lightweight stand-ins for the Fluent UI components the control uses. The real
 * Fluent library renders the same semantics (an input, a button, a status
 * region); these stubs keep the component tests fast and deterministic while
 * preserving the props and callback shapes our code relies on.
 */

import * as React from "react";

export const webLightTheme = { name: "light" };
export const webDarkTheme = { name: "dark" };
export type Theme = typeof webLightTheme;

export const FluentProvider: React.FC<{
  children?: React.ReactNode;
  className?: string;
}> = ({ children, className }) => <div className={className}>{children}</div>;

interface InputProps {
  value?: string;
  className?: string;
  autoFocus?: boolean;
  appearance?: string;
  "aria-label"?: string;
  onChange?: (
    ev: React.ChangeEvent<HTMLInputElement>,
    data: { value: string },
  ) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
}

export const Input: React.FC<InputProps> = ({
  value,
  className,
  autoFocus,
  onChange,
  onKeyDown,
  onBlur,
  ...rest
}) => (
  <input
    className={className}
    autoFocus={autoFocus}
    value={value}
    aria-label={rest["aria-label"]}
    onChange={(e) => onChange?.(e, { value: e.target.value })}
    onKeyDown={onKeyDown}
    onBlur={onBlur}
  />
);

interface ButtonProps {
  children?: React.ReactNode;
  disabled?: boolean;
  appearance?: string;
  size?: string;
  onClick?: () => void;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  disabled,
  onClick,
}) => (
  <button disabled={disabled} onClick={onClick}>
    {children}
  </button>
);

export const Spinner: React.FC<{ size?: string; label?: string }> = ({
  label,
}) => <span role="progressbar">{label}</span>;
