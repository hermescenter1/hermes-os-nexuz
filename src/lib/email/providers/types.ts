export interface EmailPayload {
  to:      string;
  subject: string;
  html:    string;
  text:    string;
}

export interface EmailSendResult {
  sent:       boolean;
  provider:   string;
  messageId?: string;
  error?:     string;
}

export interface EmailProvider {
  readonly name: string;
  send(payload: EmailPayload): Promise<EmailSendResult>;
}
