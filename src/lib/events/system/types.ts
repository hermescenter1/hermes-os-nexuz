export interface LoginSuccessEvent {
  type: "login.success";
  userId: string;
  email: string;
  name: string;
  ip?: string;
}

export interface LoginFailedEvent {
  type: "login.failed";
  userId: string;
  email: string;
  ip?: string;
}

export interface SystemAlertEvent {
  type: "system.alert";
  userId?: string;
  title: string;
  message: string;
  severity?: "info" | "warning" | "error";
}

export interface EmailSentEvent {
  type: "email.sent";
  userId?: string;
  to: string;
  subject: string;
}

export interface EmailFailedEvent {
  type: "email.failed";
  userId?: string;
  to: string;
  subject: string;
  error?: string;
}

export type SystemEvent =
  | LoginSuccessEvent
  | LoginFailedEvent
  | SystemAlertEvent
  | EmailSentEvent
  | EmailFailedEvent;

export type SystemEventType = SystemEvent["type"];
