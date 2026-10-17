// Transactional email markup. Inline styles and tables only: email clients
// ignore <style> blocks and modern layout. Keep in step with supabase/templates/.

const NAVY = "#0B182A";
const ORANGE = "#E87D1F";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(preheader: string, content: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background:${NAVY};padding:20px 32px;font-size:20px;font-weight:bold;color:#ffffff;">
                Innoserve<span style="color:${ORANGE};"> Portal</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">${content}</td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
            <tr>
              <td style="padding:16px 32px;font-size:12px;line-height:1.5;color:#9aa5b1;text-align:center;">
                This is an automated message from Innoserve Portal. Please don't reply.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

const FLOW_LABEL: Record<string, string> = {
  customer: "customer registration",
  engineer: "engineer registration",
};

export function otpEmail(otp: string, flow: string, expiresInMinutes: number): { html: string; text: string } {
  const purpose = FLOW_LABEL[flow] ?? "sign-up";
  const html = layout(`Your verification code is ${otp}`, `
    <p style="margin:0 0 8px;font-size:18px;font-weight:bold;color:${NAVY};">Verify your email address</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">
      Enter this code to continue your Innoserve Portal ${escapeHtml(purpose)}.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="background:#fdf3e9;border:1px solid #f6d3b0;border-radius:8px;padding:16px 28px;font-family:'Courier New',Courier,monospace;font-size:32px;font-weight:bold;letter-spacing:8px;color:${NAVY};">
          ${escapeHtml(otp)}
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.6;">
      The code expires in <strong>${expiresInMinutes} minutes</strong> and can be used once.
    </p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#616e7c;">
      Never share this code with anyone, including Innoserve staff. If you didn't
      request it, you can ignore this email.
    </p>`);
  const text = [
    "Verify your email address",
    "",
    `Your Innoserve Portal ${purpose} verification code is: ${otp}`,
    "",
    `It expires in ${expiresInMinutes} minutes and can be used once.`,
    "Never share this code with anyone. If you didn't request it, ignore this email.",
  ].join("\n");
  return { html, text };
}
