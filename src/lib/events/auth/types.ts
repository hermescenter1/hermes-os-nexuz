export interface UserRegisteredEvent {
  type:              "user.registered";
  userId:            string;
  email:             string;
  name:              string;
  verificationToken: string;
  baseUrl:           string;
}

export interface PasswordResetRequestedEvent {
  type:       "user.password_reset_requested";
  userId:     string;
  email:      string;
  name:       string;
  resetToken: string;
  baseUrl:    string;
}

export interface EmailVerifiedEvent {
  type:   "user.email_verified";
  userId: string;
  email:  string;
  name:   string;
}

export type AuthEvent =
  | UserRegisteredEvent
  | PasswordResetRequestedEvent
  | EmailVerifiedEvent;

export type AuthEventType = AuthEvent["type"];
