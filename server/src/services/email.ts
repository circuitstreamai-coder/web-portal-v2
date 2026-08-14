import nodemailer from "nodemailer";
import { Resend } from "resend";

const smtpPort = Number(process.env.SMTP_PORT ?? 587);
const smtpSecure = process.env.SMTP_SECURE === "true" || smtpPort === 465;
const smtpHost = process.env.SMTP_HOST ?? "smtp.gmail.com";
const smtpServername = process.env.SMTP_SERVERNAME ?? "smtp.gmail.com";
const smtpUser = process.env.SMTP_USER?.trim();
const smtpPass = process.env.SMTP_PASS?.trim();
const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resend = resendApiKey ? new Resend(resendApiKey) : null;
const smtpConfigured = Boolean(smtpUser && smtpPass);

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  tls: { servername: smtpServername },
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
  auth: { user: smtpUser, pass: smtpPass },
});

const FROM = process.env.SMTP_FROM || smtpUser || "noreply@innoserve.in";

export function isEmailConfigured() {
  return Boolean(resend || smtpConfigured);
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}) {
  let resendError: unknown;

  if (resend) {
    try {
      const { error } = await resend.emails.send({
        from: FROM,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      });

      if (error) throw error;
      return;
    } catch (err) {
      resendError = err;
      console.error("[email] Resend delivery failed", err);
    }
  }

  if (smtpConfigured) {
    try {
      await transporter.sendMail({
        from: FROM,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      });
      return;
    } catch (err) {
      console.error("[email] SMTP delivery failed", err);
      throw new Error("Failed to send email");
    }
  }

  if (resendError) throw new Error("Resend delivery failed");
  throw new Error("No email provider is configured");
}

type EmailTone = "info" | "success" | "warning" | "critical" | "security";

type EmailAction = {
  label: string;
  url: string;
};

type EmailLayoutOptions = {
  title: string;
  preview: string;
  icon: string;
  body: string;
  tone?: EmailTone;
  action?: EmailAction;
  notice?: string;
};

const toneColors: Record<EmailTone, { background: string; foreground: string }> = {
  info: { background: "#eff6ff", foreground: "#1d4ed8" },
  success: { background: "#ecfdf5", foreground: "#047857" },
  warning: { background: "#fffbeb", foreground: "#b45309" },
  critical: { background: "#fef2f2", foreground: "#b91c1c" },
  security: { background: "#fff7ed", foreground: "#c2410c" },
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function frontendUrl(path: string) {
  const base = (process.env.FRONTEND_URL || "https://innoserve-test.vercel.app").replace(
    /\/$/,
    "",
  );
  return `${base}${path}`;
}

function paragraph(content: string) {
  return `<p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#4b5563;">${content}</p>`;
}

function detailsTable(rows: Array<[string, unknown]>) {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
      style="margin:4px 0 22px;background-color:#f8fafc;border:1px solid #eef2f7;border-radius:10px;overflow:hidden;">
      ${rows
        .map(
          ([label, value], index) => `
            <tr>
              <td style="width:38%;padding:11px 14px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;${index ? "border-top:1px solid #eef2f7;" : ""}">
                ${escapeHtml(label)}
              </td>
              <td style="padding:11px 14px;font-size:13px;font-weight:600;color:#0B182A;${index ? "border-top:1px solid #eef2f7;" : ""}">
                ${escapeHtml(value)}
              </td>
            </tr>`,
        )
        .join("")}
    </table>`;
}

function emailLayout(options: EmailLayoutOptions) {
  const tone = toneColors[options.tone ?? "info"];
  const action = options.action
    ? `
      <table cellpadding="0" cellspacing="0" role="presentation" style="margin:26px 0 8px;">
        <tr>
          <td style="border-radius:10px;background-color:#E87D1F;">
            <a href="${escapeHtml(options.action.url)}"
              style="display:inline-block;padding:13px 24px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">
              ${escapeHtml(options.action.label)} &rarr;
            </a>
          </td>
        </tr>
      </table>`
    : "";
  const notice = options.notice
    ? `<div style="margin-top:22px;padding:13px 15px;border-radius:9px;background-color:${tone.background};font-size:12px;line-height:1.65;color:${tone.foreground};">${options.notice}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(options.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f2f0ed;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(options.preview)}</div>
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f2f0ed;padding:38px 14px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;">
          <tr>
            <td align="center" style="padding-bottom:22px;">
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="width:38px;height:38px;border-radius:11px;background-color:#0B182A;text-align:center;vertical-align:middle;border-bottom:3px solid #E87D1F;">
                    <span style="font-size:20px;line-height:38px;font-weight:800;color:#ffffff;">I</span>
                  </td>
                  <td style="padding-left:11px;vertical-align:middle;">
                    <span style="font-size:19px;font-weight:800;color:#0B182A;letter-spacing:-.4px;">InnoServe</span>
                    <span style="display:block;margin-top:2px;font-size:10px;font-weight:600;color:#94a3b8;letter-spacing:.8px;text-transform:uppercase;">Service Management Platform</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(11,24,42,.08);">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr><td style="height:5px;background-color:#0B182A;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td style="padding:34px 38px 32px;">
                    <table cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:20px;">
                      <tr>
                        <td style="width:50px;height:50px;border-radius:50%;background-color:${tone.background};color:${tone.foreground};font-size:23px;text-align:center;vertical-align:middle;">
                          ${options.icon}
                        </td>
                      </tr>
                    </table>
                    <h1 style="margin:0 0 10px;font-size:22px;line-height:1.3;font-weight:800;color:#0B182A;letter-spacing:-.4px;">${escapeHtml(options.title)}</h1>
                    <div style="font-size:14px;line-height:1.7;color:#4b5563;">${options.body}</div>
                    ${action}
                    ${notice}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 8px 6px;text-align:center;">
              <p style="margin:0;font-size:11px;line-height:1.6;color:#94a3b8;">This is an automated message from Innoserve Techsol.</p>
              <p style="margin:5px 0 0;font-size:11px;color:#94a3b8;">Need help? <a href="mailto:support@innoserve.in" style="color:#E87D1F;text-decoration:none;">support@innoserve.in</a></p>
              <p style="margin:5px 0 0;font-size:11px;color:#c0c6cf;">&copy; ${new Date().getFullYear()} Innoserve Techsol. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function greeting(name: string) {
  return paragraph(`Hi <strong style="color:#0B182A;">${escapeHtml(name)}</strong>,`);
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
    html: emailLayout({
      title: "Your engineer account is ready",
      preview: "Your Innoserve engineer account has been approved.",
      icon: "&#10003;",
      tone: "success",
      body:
        greeting(name) +
        paragraph("Your engineer account has been approved. You can now sign in and begin managing assigned service requests.") +
        detailsTable([
          ["Reference ID", referenceId],
          ["Email", email],
          ["Temporary password", password],
        ]),
      action: { label: "Sign in to Innoserve", url: frontendUrl("/auth") },
      notice: "For your security, change this temporary password immediately after signing in.",
    }),
  };
}

export function customerConfirmationEmail(name: string, email: string, referenceId: string) {
  return {
    to: email,
    subject: "Customer Onboarding Received – Innoserve",
    html: emailLayout({
      title: "Registration received",
      preview: "We received your Innoserve customer registration.",
      icon: "&#9993;",
      body:
        greeting(name) +
        paragraph("Thank you for registering with Innoserve. Your application has been received and is awaiting review by a Super Admin.") +
        detailsTable([["Application reference", referenceId]]),
      notice: "We will email your login details after the account is approved.",
    }),
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
    html: emailLayout({
      title: "Your account is approved",
      preview: "Your Innoserve customer account is ready.",
      icon: "&#10003;",
      tone: "success",
      body:
        greeting(name) +
        paragraph("Your customer account has been approved. You can now sign in to the Innoserve service management platform.") +
        detailsTable([
          ["Reference ID", referenceId],
          ["Email", email],
          ["Temporary password", password],
        ]),
      action: { label: "Sign in to Innoserve", url: frontendUrl("/auth") },
      notice: "For your security, change this temporary password immediately after signing in.",
    }),
  };
}

export function superAdminCustomerNotification(
  customerName: string,
  companyName: string,
  referenceId: string,
) {
  return {
    subject: `New Customer Onboarding – ${referenceId}`,
    html: emailLayout({
      title: "New customer registration",
      preview: `${companyName} submitted a customer onboarding request.`,
      icon: "&#128188;",
      body:
        paragraph("A new customer onboarding request is ready for administrative review.") +
        detailsTable([
          ["Customer", customerName],
          ["Company", companyName],
          ["Reference ID", referenceId],
        ]),
      action: { label: "Review customer", url: frontendUrl("/admin/customers") },
    }),
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
    html: emailLayout({
      title: "A ticket has been assigned to you",
      preview: `Ticket ${input.ticketNumber} requires your attention.`,
      icon: "&#128203;",
      body:
        greeting(input.engineerName) +
        paragraph("A new service ticket has been assigned to you. Please review the details and take the appropriate action.") +
        detailsTable([
          ["Ticket number", input.ticketNumber],
          ["Title", input.ticketTitle],
          ["Priority", input.priority ?? "Not specified"],
          ["Location", location || "Not specified"],
          ["Address", input.address ?? "Not specified"],
        ]),
      action: { label: "Open assigned tickets", url: frontendUrl("/engineer/tickets") },
    }),
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
    html: emailLayout({
      title: "Ticket update",
      preview: `${input.ticketNumber}: ${input.heading}`,
      icon: "&#8635;",
      body:
        greeting(input.recipientName) +
        paragraph(escapeHtml(input.heading)) +
        detailsTable([
          ["Ticket number", input.ticketNumber],
          ["Title", input.ticketTitle],
          ["Status", input.status ?? "Not specified"],
          ["Priority", input.priority ?? "Not specified"],
          ["Location", location || "Not specified"],
          ["Address", input.address ?? "Not specified"],
          ...(input.remarks ? ([["Remarks", input.remarks]] as Array<[string, unknown]>) : []),
        ]),
      action: { label: "View latest update", url: frontendUrl("/auth") },
    }),
  };
}

export function otpEmail(otp: string) {
  return {
    subject: "Your Innoserve Verification Code",
    html: emailLayout({
      title: "Verify your email address",
      preview: "Use your six-digit code to continue registration.",
      icon: "&#9993;",
      tone: "security",
      body:
        paragraph("Use the verification code below to continue your Innoserve registration.") +
        `<div style="margin:6px 0 22px;padding:18px 12px;border-radius:12px;background-color:#fff7ed;border:1px solid #fed7aa;text-align:center;font-size:34px;line-height:1;font-weight:800;letter-spacing:10px;color:#E87D1F;">${escapeHtml(otp)}</div>`,
      notice: "This code expires in 5 minutes and can only be used once. If you did not request it, you can safely ignore this email.",
    }),
  };
}

export function roleChangedEmail(name: string, email: string, newRole: string) {
  return {
    to: email,
    subject: "Your Innoserve Role Has Been Updated",
    html: emailLayout({
      title: "Your access role changed",
      preview: "Your Innoserve access permissions have been updated.",
      icon: "&#128273;",
      tone: "security",
      body:
        greeting(name) +
        paragraph("A Super Admin has updated your role and associated access permissions.") +
        detailsTable([["New role", newRole]]),
      action: { label: "Open Innoserve", url: frontendUrl("/auth") },
      notice: "If you did not expect this change, contact support immediately.",
    }),
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
    html: emailLayout({
      title: "Account details updated",
      preview: "Your Innoserve customer profile was updated.",
      icon: "&#9998;",
      body:
        greeting(name) +
        paragraph("A Super Admin has updated your customer account details.") +
        detailsTable([["Reference ID", referenceId]]),
      action: { label: "Review your profile", url: frontendUrl("/profile") },
      notice: "If you did not expect this change or notice incorrect information, contact support.",
    }),
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
    html: emailLayout({
      title: "Engineer profile updated",
      preview: "Your Innoserve engineer profile was updated.",
      icon: "&#9998;",
      body:
        greeting(name) +
        paragraph("A Super Admin has updated your engineer profile details.") +
        detailsTable([["Reference ID", referenceId]]),
      action: { label: "Review your profile", url: frontendUrl("/profile") },
      notice: "If you did not expect this change or notice incorrect information, contact support.",
    }),
  };
}

export function passwordResetEmail(name: string, email: string, resetLink: string) {
  return {
    to: email,
    subject: "Reset your Innoserve password",
    html: emailLayout({
      title: "Reset your password",
      preview: "A password reset was requested for your Innoserve account.",
      icon: "&#128274;",
      tone: "security",
      body:
        greeting(name) +
        paragraph("We received a request to reset the password for your Innoserve account. Use the secure button below to choose a new password."),
      action: { label: "Set a new password", url: resetLink },
      notice: `This link expires in 24 hours. If the button does not work, copy this URL into your browser:<br/><span style="word-break:break-all;">${escapeHtml(resetLink)}</span><br/><br/>If you did not request a reset, you can safely ignore this email.`,
    }),
  };
}

export function emailQuota80Alert(customerName: string, used: number, cap: number) {
  return {
    subject: "Email-to-Ticket Quota Warning – 80% Reached",
    html: emailLayout({
      title: "Email processing quota warning",
      preview: `${customerName} has reached 80% of its monthly email-to-ticket quota.`,
      icon: "&#9888;",
      tone: "warning",
      body:
        paragraph("The monthly email-to-ticket processing quota is approaching its configured limit.") +
        detailsTable([
          ["Customer", customerName],
          ["Emails processed", used],
          ["Monthly cap", cap],
        ]),
      notice: "Contact platform support to extend the cap before processing is automatically paused.",
    }),
  };
}

export function emailQuota100Alert(customerName: string, used: number, cap: number) {
  return {
    subject: "Email-to-Ticket Processing SUSPENDED – Monthly Cap Reached",
    html: emailLayout({
      title: "Email processing suspended",
      preview: `${customerName} reached its monthly email-to-ticket limit.`,
      icon: "!",
      tone: "critical",
      body:
        paragraph("Email-to-ticket processing has been automatically suspended because the monthly limit was reached.") +
        detailsTable([
          ["Customer", customerName],
          ["Emails processed", used],
          ["Monthly cap", cap],
        ]),
      notice: "No further emails will be processed until platform support resumes processing or extends the cap.",
    }),
  };
}

export function emailAnomalySuspendAlert(customerName: string, recentCount: number) {
  return {
    subject: "Email-to-Ticket Processing SUSPENDED – Anomaly Detected",
    html: emailLayout({
      title: "Unusual email activity detected",
      preview: `Email-to-ticket processing for ${customerName} was suspended as a precaution.`,
      icon: "!",
      tone: "critical",
      body:
        paragraph("An unusual volume spike was detected. Email-to-ticket processing has been automatically suspended as a precaution.") +
        detailsTable([
          ["Customer", customerName],
          ["Emails in the last 15 minutes", recentCount],
        ]),
      notice: "Review the recent email activity and contact platform support before resuming processing.",
    }),
  };
}
