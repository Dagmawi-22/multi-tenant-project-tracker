export interface InvitationEmailContent {
  organizationName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
  expiresAt: Date;
  recipientEmail: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatExpiry(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function renderInvitationEmail(content: InvitationEmailContent): {
  subject: string;
  html: string;
  text: string;
} {
  const organizationName = escapeHtml(content.organizationName);
  const inviterName = escapeHtml(content.inviterName);
  const role = escapeHtml(content.role);
  const acceptUrl = escapeHtml(content.acceptUrl);
  const expiry = formatExpiry(content.expiresAt);

  const subject = `${content.inviterName} invited you to ${content.organizationName} on Project Tracker`;

  const text = [
    `${content.inviterName} has invited you to join ${content.organizationName} on Project Tracker as ${content.role}.`,
    '',
    'Accept the invitation:',
    content.acceptUrl,
    '',
    `This link expires on ${expiry}.`,
    '',
    'If you were not expecting this invitation you can ignore this email.',
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f6f7f9;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  ${inviterName} invited you to join ${organizationName} as ${role}.
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f6f7f9;padding:32px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:#ffffff;border:1px solid #e3e6ea;border-radius:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr>
          <td style="padding:28px 32px 0;">
            <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#2f6f4f;">Project Tracker</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 0;">
            <h1 style="margin:0;font-size:21px;line-height:1.3;color:#1d2127;font-weight:650;">
              You have been invited to ${organizationName}
            </h1>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 32px 0;">
            <p style="margin:0;font-size:15px;line-height:1.6;color:#4a5159;">
              ${inviterName} invited you to join <strong style="color:#1d2127;">${organizationName}</strong>
              as <strong style="color:#1d2127;">${role}</strong>. Accept the invitation to see the
              organization's projects, budgets and tasks.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background-color:#2f6f4f;border-radius:8px;">
                  <a href="${acceptUrl}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
                    Accept invitation
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:22px 32px 0;">
            <p style="margin:0;font-size:13px;line-height:1.6;color:#6b727d;">
              Or paste this link into your browser:<br>
              <a href="${acceptUrl}" style="color:#2f6f4f;word-break:break-all;">${acceptUrl}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:22px 32px 28px;">
            <hr style="border:none;border-top:1px solid #e3e6ea;margin:0 0 16px;">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#8a9099;">
              This invitation was sent to ${escapeHtml(content.recipientEmail)} and expires on ${expiry}.
              If you were not expecting it, you can safely ignore this email.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  return { subject, html, text };
}
