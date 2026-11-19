import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { InvitationEmailContent, renderInvitationEmail } from './invitation.template';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private from = 'Project Tracker <no-reply@localhost>';

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const host = this.config.get<string>('SMTP_HOST');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    if (!host || !user || !pass) {
      this.logger.warn('SMTP is not configured; invitation links will be logged instead of emailed');
      return;
    }

    const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);

    this.transporter = createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    this.from = this.config.get<string>('MAIL_FROM') ?? `Project Tracker <${user}>`;
  }

  get isConfigured(): boolean {
    return this.transporter !== null;
  }

  async sendInvitation(content: InvitationEmailContent): Promise<boolean> {
    const { subject, html, text } = renderInvitationEmail(content);

    if (!this.transporter) {
      this.logger.warn(`Invitation for ${content.recipientEmail}: ${content.acceptUrl}`);
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: content.recipientEmail,
        subject,
        html,
        text,
      });

      this.logger.log(`Invitation email sent to ${content.recipientEmail}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send invitation to ${content.recipientEmail}`, error as Error);
      return false;
    }
  }
}
