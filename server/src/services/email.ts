import nodemailer from "nodemailer";
import { Resend } from "resend";

const smtpPort = Number(process.env.SMTP_PORT ?? 587);
const smtpSecure =
  process.env.SMTP_SECURE === "true" || smtpPort === 465;
const smtpHost = process.env.SMTP_HOST ?? "smtp.gmail.com";
const smtpServername = process.env.SMTP_SERVERNAME ?? "smtp.gmail.com";
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  tls: {
    servername: smtpServername,
  },
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@innoserve.com";

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}) {
  try {
    if (resend) {
      const { error } = await resend.emails.send({
        from: FROM,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      });

      if (error) throw error;
      return;
    }

    await transporter.sendMail({
      from: FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
  } catch (err) {
    console.error("[email] failed to send to", opts.to, err);
    throw new Error("Failed to send email");
  }
}

export function engineerWelcomeEmail(
  name: string,
  email: string,
  password: string,
  referenceId: string,
) {
  return {
    to: email,
    subject: "Welcome to Innoserve – Your Engineer Account",
    html: `
      <p>Hi ${name},</p>
      <p>Your engineer account (Ref: <strong>${referenceId}</strong>) has been approved. You can now log in.</p>
      <p>Your login credentials:</p>
      <ul>
        <li><strong>Email:</strong> ${email}</li>
        <li><strong>Password:</strong> ${password}</li>
      </ul>
      <p>Regards,<br/>Innoserve Team</p>
    `,
  };
}

export function customerConfirmationEmail(
  name: string,
  email: string,
  referenceId: string,
) {
  return {
    to: email,
    subject: "Customer Onboarding Received – Innoserve",
    html: `
      <p>Hi ${name},</p>
      <p>Thank you for registering with Innoserve.</p>
      <p>Your application reference: <strong>${referenceId}</strong></p>
      <p>A Super Admin will review and approve your account. You will receive login credentials once approved.</p>
      <p>Regards,<br/>Innoserve Team</p>
    `,
  };
}

export function customerWelcomeEmail(
  name: string,
  email: string,
  password: string,
  referenceId: string,
) {
  return {
    to: email,
    subject: "Your Innoserve Account is Approved",
    html: `
      <p>Hi ${name},</p>
      <p>Your account (Ref: <strong>${referenceId}</strong>) has been approved. You can now log in.</p>
      <p>Your login credentials:</p>
      <ul>
        <li><strong>Email:</strong> ${email}</li>
        <li><strong>Password:</strong> ${password}</li>
      </ul>
      <p>Regards,<br/>Innoserve Team</p>
    `,
  };
}

export function superAdminCustomerNotification(
  customerName: string,
  companyName: string,
  referenceId: string,
) {
  return {
    subject: `New Customer Onboarding – ${referenceId}`,
    html: `
      <p>A new customer has submitted an onboarding request:</p>
      <ul>
        <li><strong>Name:</strong> ${customerName}</li>
        <li><strong>Company:</strong> ${companyName}</li>
        <li><strong>Reference:</strong> ${referenceId}</li>
      </ul>
      <p>Please review and approve in the admin panel.</p>
      <p>Regards,<br/>Innoserve System</p>
    `,
  };
}

export function engineerTicketAssignedEmail(input: {
  engineerName: string;
  ticketNumber: string;
  ticketTitle: string;
  priority?: string | null;
  state?: string | null;
  city?: string | null;
  address?: string | null;
}) {
  const location = [input.city, input.state].filter(Boolean).join(", ");

  return {
    subject: `New Ticket Assigned – ${input.ticketNumber}`,
    html: `
      <p>Hi ${input.engineerName},</p>
      <p>A new ticket has been assigned to you.</p>
      <ul>
        <li><strong>Ticket Number:</strong> ${input.ticketNumber}</li>
        <li><strong>Title:</strong> ${input.ticketTitle}</li>
        <li><strong>Priority:</strong> ${input.priority ?? "Not specified"}</li>
        <li><strong>Location:</strong> ${location || "Not specified"}</li>
        <li><strong>Address:</strong> ${input.address ?? "Not specified"}</li>
      </ul>
      <p>Please log in to Innoserve to review and take action.</p>
      <p>Regards,<br/>Innoserve Team</p>
    `,
  };
}

export function ticketFlowNotificationEmail(input: {
  recipientName: string;
  subjectLine: string;
  heading: string;
  ticketNumber: string;
  ticketTitle: string;
  status?: string | null;
  priority?: string | null;
  state?: string | null;
  city?: string | null;
  address?: string | null;
  remarks?: string | null;
}) {
  const location = [input.city, input.state].filter(Boolean).join(", ");

  return {
    subject: `${input.subjectLine} – ${input.ticketNumber}`,
    html: `
      <p>Hi ${input.recipientName},</p>
      <p>${input.heading}</p>
      <ul>
        <li><strong>Ticket Number:</strong> ${input.ticketNumber}</li>
        <li><strong>Title:</strong> ${input.ticketTitle}</li>
        <li><strong>Status:</strong> ${input.status ?? "Not specified"}</li>
        <li><strong>Priority:</strong> ${input.priority ?? "Not specified"}</li>
        <li><strong>Location:</strong> ${location || "Not specified"}</li>
        <li><strong>Address:</strong> ${input.address ?? "Not specified"}</li>
      </ul>
      ${input.remarks ? `<p><strong>Remarks:</strong> ${input.remarks}</p>` : ""}
      <p>Please log in to Innoserve to review the latest update.</p>
      <p>Regards,<br/>Innoserve Team</p>
    `,
  };
}

export function otpEmail(otp: string) {
  return {
    subject: "Your Innoserve Verification Code",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#0B182A">Your OTP</h2>
        <p>Use the code below to verify your email address. It expires in <strong>5 minutes</strong>.</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:12px;color:#E87D1F;padding:16px 0">${otp}</div>
        <p style="color:#888;font-size:13px">If you did not request this, you can safely ignore this email.</p>
      </div>
    `,
  };
}

export function roleChangedEmail(name: string, email: string, newRole: string) {
  return {
    to: email,
    subject: "Your Innoserve Role Has Been Updated",
    html: `
      <p>Hi ${name},</p>
      <p>A Super Admin has updated your role on Innoserve.</p>
      <p><strong>New Role:</strong> ${newRole}</p>
      <p>If you have any questions, please contact support.</p>
      <p>Regards,<br/>Innoserve Team</p>
    `,
  };
}

export function customerProfileUpdatedEmail(
  name: string,
  email: string,
  referenceId: string,
) {
  return {
    to: email,
    subject: "Your Innoserve Account Details Have Been Updated",
    html: `
      <p>Hi ${name},</p>
      <p>This is to inform you that a Super Admin has updated your account details (Ref: <strong>${referenceId}</strong>).</p>
      <p>If you did not expect this change or have any concerns, please contact support.</p>
      <p>Regards,<br/>Innoserve Team</p>
    `,
  };
}

export function engineerProfileUpdatedEmail(
  name: string,
  email: string,
  referenceId: string,
) {
  return {
    to: email,
    subject: "Your Innoserve Engineer Profile Has Been Updated",
    html: `
      <p>Hi ${name},</p>
      <p>This is to inform you that a Super Admin has updated your engineer profile details (Ref: <strong>${referenceId}</strong>).</p>
      <p>If you did not expect this change or have any concerns, please contact support.</p>
      <p>Regards,<br/>Innoserve Team</p>
    `,
  };
}

export function passwordResetEmail(
  name: string,
  email: string,
  resetLink: string,
) {
  return {
    to: email,
    subject: "Reset your Innoserve password",
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your password</title>
</head>
<body style="margin:0;padding:0;background-color:#f2f0ed;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f0ed;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#E87D1F;border-radius:10px;width:36px;height:36px;text-align:center;vertical-align:middle;">
                    <span style="font-size:18px;line-height:36px;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 215 323" style="height: 36px; width: auto;">
  <!-- Navy icon -->
  <g transform="translate(0,323) scale(0.1,-0.1)" fill="#1b3e5c" stroke="none">
    <path d="M1302 2955 c-29 -13 -330 -195 -537 -325 -33 -21 -109 -68 -170 -105
    -60 -37 -112 -70 -115 -74 -3 -4 -18 -15 -33 -25 -67 -42 -67 -38 -67 -684 0
    -553 1 -585 19 -620 18 -34 119 -106 321 -229 35 -21 35 -21 375 193 666 421
    640 404 645 430 13 75 4 397 -11 405 -12 6 -22 2 -34 -11 -10 -11 -29 -20 -42
    -20 -12 0 -33 -10 -44 -21 -25 -25 -125 -79 -145 -79 -8 0 -17 -7 -20 -15 -3
    -8 -18 -21 -32 -28 -15 -8 -53 -28 -85 -45 -31 -18 -63 -32 -70 -32 -13 0 -67
    -27 -124 -62 -33 -20 -33 -20 -33 235 0 247 1 255 23 287 23 34 60 56 605 354
    138 76 252 143 252 147 0 11 -120 90 -176 116 -21 10 -43 23 -49 29 -11 12
    -239 150 -292 178 -39 20 -116 20 -161 1z"/>
  </g>
  <!-- Orange icon -->
  <g transform="translate(0,323) scale(0.1,-0.1)" fill="#e8841f" stroke="none">
    <path d="M2100 2543 c-8 -3 -17 -9 -20 -13 -5 -6 -49 -31 -180 -103 -488 -267
    -608 -337 -630 -367 -23 -32 -31 -360 -9 -360 5 0 7 -5 4 -10 -9 -14 131 60
    155 82 10 10 24 18 30 18 6 0 42 18 78 41 94 57 92 55 146 80 81 37 79 43 83
    -264 3 -305 6 -294 -104 -359 -30 -18 -70 -42 -87 -53 -120 -75 -178 -111
    -228 -143 -32 -21 -145 -92 -253 -160 -107 -68 -198 -128 -202 -135 -7 -12
    -8 -11 142 -110 376 -248 348 -244 590 -90 72 46 137 88 145 93 17 12 180 116
    290 186 41 26 119 76 173 111 53 35 101 63 105 63 4 0 22 14 40 31 32 30 32
    30 32 658 0 707 6 647 -77 703 -160 106 -182 116 -223 101z"/>
  </g>
</svg></span>
                  </td>
                  <td style="padding-left:10px;vertical-align:middle;">
                    <span style="font-size:18px;font-weight:700;color:#0B182A;letter-spacing:-0.3px;">InnoServe</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">

              <!-- Card top accent -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="height:4px;background:linear-gradient(to right,#0B182A,#021E44);font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>

              <!-- Card body -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:36px 40px 32px;">

                    <!-- Icon -->
                    <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                      <tr>
                        <td style="background-color:#fff7ed;border-radius:50%;width:52px;height:52px;text-align:center;vertical-align:middle;">
                          <span style="font-size:24px;line-height:52px;">🔒</span>
                        </td>
                      </tr>
                    </table>

                    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0B182A;letter-spacing:-0.3px;">
                      Reset your password
                    </h1>
                    <p style="margin:0 0 20px;font-size:13px;color:#6b7280;line-height:1.6;">
                      Hi ${name}, we received a request to reset the password for your Innoserve account.
                    </p>

                    <!-- CTA Button -->
                    <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                      <tr>
                        <td style="border-radius:10px;background-color:#E87D1F;">
                          <a href="${resetLink}"
                             style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.1px;">
                            Set New Password →
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Fallback link -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                      <tr>
                        <td style="background-color:#f9fafb;border-radius:8px;padding:14px 16px;">
                          <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.6px;">
                            Or copy this link into your browser
                          </p>
                          <p style="margin:0;font-size:12px;color:#0B182A;word-break:break-all;font-family:monospace;">
                            ${resetLink}
                          </p>
                        </td>
                      </tr>
                    </table>

                    <!-- Divider -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                      <tr>
                        <td style="border-top:1px solid #f3f4f6;font-size:0;line-height:0;">&nbsp;</td>
                      </tr>
                    </table>

                    <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.7;">
                      This link will expire in <strong style="color:#6b7280;">24 hours</strong>.
                      If you did not request a password reset, you can safely ignore this email —
                      your password will not change.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 8px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                © ${new Date().getFullYear()} Innoserve Techsol. All rights reserved.
              </p>
              <p style="margin:6px 0 0;font-size:12px;color:#9ca3af;">
                Need help? <a href="mailto:support@innoserve.in" style="color:#E87D1F;text-decoration:none;">support@innoserve.in</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  };
}

export function emailQuota80Alert(customerName: string, used: number, cap: number) {
  return {
    subject: "Email-to-Ticket Quota Warning – 80% Reached",
    html: `
      <p>This is an automated alert from Innoserve.</p>
      <p>The email-to-ticket processing quota for customer <strong>${customerName}</strong> has reached <strong>80%</strong> of the monthly limit.</p>
      <ul>
        <li><strong>Emails processed this month:</strong> ${used}</li>
        <li><strong>Monthly cap:</strong> ${cap}</li>
      </ul>
      <p>If you expect a higher volume, please contact platform support to extend the cap before processing is automatically paused.</p>
      <p>Regards,<br/>Innoserve Platform</p>
    `,
  };
}

export function emailQuota100Alert(customerName: string, used: number, cap: number) {
  return {
    subject: "Email-to-Ticket Processing SUSPENDED – Monthly Cap Reached",
    html: `
      <p>This is an automated alert from Innoserve.</p>
      <p>The email-to-ticket processing for customer <strong>${customerName}</strong> has been <strong>automatically suspended</strong> because the monthly cap has been reached.</p>
      <ul>
        <li><strong>Emails processed:</strong> ${used}</li>
        <li><strong>Monthly cap:</strong> ${cap}</li>
      </ul>
      <p>No further emails will be processed until a platform support staff member resumes processing or the cap is extended.</p>
      <p>Regards,<br/>Innoserve Platform</p>
    `,
  };
}

export function emailAnomalySuspendAlert(customerName: string, recentCount: number) {
  return {
    subject: "Email-to-Ticket Processing SUSPENDED – Anomaly Detected",
    html: `
      <p>This is an automated alert from Innoserve.</p>
      <p>An unusual volume spike was detected for customer <strong>${customerName}</strong>. Email-to-ticket processing has been <strong>automatically suspended</strong> as a precaution.</p>
      <ul>
        <li><strong>Emails received in last 15 minutes:</strong> ${recentCount}</li>
      </ul>
      <p>Please review your email activity and contact platform support to resume processing.</p>
      <p>Regards,<br/>Innoserve Platform</p>
    `,
  };
}
