/**
 * Email templates. Each template returns { subject, html, text } so the
 * email.service.ts can pass them straight to sendEmail().
 */

export interface SubInvitationParams {
  vendorName: string;
  projectName: string;
  projectNumber?: string;
  trade: string;
  dueAt: Date | null;
  inviteUrl: string;
  senderName?: string;
  senderTitle?: string;
}

function fmtDate(d: Date | null): string {
  if (!d) return "the date listed in the bid package";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function subcontractorInvitation(p: SubInvitationParams) {
  const dueLine = fmtDate(p.dueAt);
  const projectId = p.projectNumber ? ` (Project #${p.projectNumber})` : "";
  const sender = p.senderName || "BLACKHAWK Construction";
  const senderTitle = p.senderTitle || "";

  const subject = `Bid Invitation — ${p.trade} — ${p.projectName}`;

  const text = [
    `Hi ${p.vendorName},`,
    ``,
    `BLACKHAWK Construction is inviting you to submit a bid for the ${p.trade} scope on ${p.projectName}${projectId}.`,
    ``,
    `Bids are due: ${dueLine}.`,
    ``,
    `View the bid package and submit your quote here:`,
    p.inviteUrl,
    ``,
    `This link is unique to your firm — please don't forward it. If you've moved on or this should go to someone else at your company, just reply to this email and let us know.`,
    ``,
    `Thanks,`,
    `${sender}${senderTitle ? "\n" + senderTitle : ""}`,
    `bids@blackhawkconst.com`,
  ].join("\n");

  const html = `<!doctype html>
<html><body style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #1a1a1a; line-height: 1.5;">
  <div style="border-bottom: 3px solid #c8102e; padding-bottom: 12px; margin-bottom: 24px;">
    <div style="font-size: 14px; color: #666; letter-spacing: 0.05em; text-transform: uppercase;">BLACKHAWK Construction</div>
    <div style="font-size: 22px; font-weight: 700; margin-top: 4px;">Bid Invitation</div>
  </div>

  <p>Hi <strong>${escapeHtml(p.vendorName)}</strong>,</p>

  <p>BLACKHAWK Construction is inviting you to submit a bid for the <strong>${escapeHtml(p.trade)}</strong> scope on <strong>${escapeHtml(p.projectName)}</strong>${projectId}.</p>

  <p style="background:#f5f6f8; border-left: 4px solid #c8102e; padding: 12px 16px; margin: 16px 0;">
    <strong>Bids due:</strong> ${escapeHtml(dueLine)}
  </p>

  <p style="text-align:center; margin: 32px 0;">
    <a href="${escapeAttr(p.inviteUrl)}" style="display:inline-block; background:#c8102e; color:#fff; padding:14px 28px; text-decoration:none; font-weight:600; border-radius:4px;">View Bid Package &amp; Submit Quote</a>
  </p>

  <p style="font-size: 13px; color: #555;">This link is unique to your firm &mdash; please don&rsquo;t forward it. If this should go to someone else at your company, reply and let us know.</p>

  <p style="margin-top: 32px;">Thanks,<br/>${escapeHtml(sender)}${senderTitle ? "<br/><span style='color:#666'>" + escapeHtml(senderTitle) + "</span>" : ""}<br/><a href="mailto:bids@blackhawkconst.com" style="color:#c8102e;">bids@blackhawkconst.com</a></p>

  <hr style="border:none; border-top:1px solid #e5e5e5; margin: 32px 0 12px;"/>
  <p style="font-size: 11px; color: #999;">Sent by BLACKHAWK Construction via the Sentinel Command Center bid platform. If you received this in error, please disregard.</p>
</body></html>`;

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]!));
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}

export interface ApprovalRequestParams {
  approverName: string;
  bidProjectName: string;
  bidProjectNumber?: string;
  approvalUrl: string;
  requestedBy?: string;
  totalAmount?: number | null;
  itemsCount?: number;
}

export function approvalRequestEmail(p: ApprovalRequestParams) {
  const projectId = p.bidProjectNumber ? ` (Project #${p.bidProjectNumber})` : "";
  const subject = `Approval needed — ${p.bidProjectName}`;

  const text = [
    `Hi ${p.approverName},`,
    ``,
    `${p.requestedBy || "HERBIE"} has finished assembling the bid jacket for ${p.bidProjectName}${projectId} and it's ready for your review.`,
    p.totalAmount != null ? `Total: $${p.totalAmount.toLocaleString()}` : "",
    p.itemsCount != null ? `Line items: ${p.itemsCount}` : "",
    ``,
    `Review and approve in the Sentinel Command Center:`,
    p.approvalUrl,
    ``,
    `Thanks,`,
    `Sentinel Command Center`,
  ].filter(Boolean).join("\n");

  const html = `<!doctype html>
<html><body style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #1a1a1a; line-height: 1.5;">
  <div style="border-bottom: 3px solid #c8102e; padding-bottom: 12px; margin-bottom: 24px;">
    <div style="font-size: 14px; color: #666; letter-spacing: 0.05em; text-transform: uppercase;">Sentinel Command Center</div>
    <div style="font-size: 22px; font-weight: 700; margin-top: 4px;">Approval Needed</div>
  </div>
  <p>Hi <strong>${escapeHtml(p.approverName)}</strong>,</p>
  <p>${escapeHtml(p.requestedBy || "HERBIE")} has finished assembling the bid jacket for <strong>${escapeHtml(p.bidProjectName)}</strong>${projectId} and it&rsquo;s ready for your review.</p>
  ${p.totalAmount != null ? `<p><strong>Total:</strong> $${p.totalAmount.toLocaleString()}</p>` : ""}
  ${p.itemsCount != null ? `<p><strong>Line items:</strong> ${p.itemsCount}</p>` : ""}
  <p style="text-align:center; margin: 32px 0;">
    <a href="${escapeAttr(p.approvalUrl)}" style="display:inline-block; background:#c8102e; color:#fff; padding:14px 28px; text-decoration:none; font-weight:600; border-radius:4px;">Review &amp; Approve in Sentinel</a>
  </p>
  <p style="font-size: 13px; color: #555;">All review and approval happens inside the Sentinel Command Center &mdash; no external tools, no logins to other sites.</p>
  <hr style="border:none; border-top:1px solid #e5e5e5; margin: 32px 0 12px;"/>
  <p style="font-size: 11px; color: #999;">Sent by Sentinel Command Center.</p>
</body></html>`;

  return { subject, html, text };
}
