/**
 * PHASE 87E — canonical Hermes authentication experience.
 *
 * The premium auth shell + shared form primitives for the /auth/* routes,
 * built on the 87B design system. Consolidates the previous AuthShell: auth
 * pages render `AuthExperienceShell` (server) with client form islands using
 * these primitives. No PublicHeader / AppShell on auth pages.
 */
export { AuthExperienceShell, type AuthExperienceShellProps } from "./AuthExperienceShell";
export { AuthField, type AuthFieldProps } from "./AuthField";
export { PasswordField, type PasswordFieldProps } from "./PasswordField";
export { AuthStatus, type AuthStatusProps } from "./AuthStatus";
export { PasswordStrengthMeter } from "./PasswordStrengthMeter";
export { AuthSubmit, type AuthSubmitProps } from "./AuthSubmit";
