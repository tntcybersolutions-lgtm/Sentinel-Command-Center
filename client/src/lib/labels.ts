const ENTITY_TYPE_LABELS: Record<string, string> = {
  bid_project: "Bid Project",
  opportunity: "Opportunity",
  document: "Document",
  approval_request: "Approval Request",
  company: "Company",
  vendor: "Vendor",
  subcontractor: "Subcontractor",
  jacket: "Bid Jacket",
  jacket_build: "Bid Setup",
  herbie_action: "HERBIE Action",
  sam_ingest: "SAM Ingest",
  system: "System",
  user: "User",
  contact: "Contact",
  project: "Project",
  task: "Task",
  compliance_item: "Compliance Item",
  blueprint: "Blueprint",
  takeoff: "Takeoff Estimate",
  building_system: "Building System",
  competitor: "Competitor",
  award: "Award",
  notification: "Notification",
  knowledge_doc: "Knowledge Document",
  folder: "Folder",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  herbie_score: "HERBIE Scoring",
  herbie_action: "HERBIE Action",
  herbie_chat: "HERBIE Chat",
  herbie_autonomous: "HERBIE Auto",
  approval_requested: "Approval Requested",
  approval_approved: "Approved",
  approval_rejected: "Rejected",
  bid_created: "Bid Created",
  bid_updated: "Bid Updated",
  bid_submission: "Bid Submitted",
  bid_decision: "Bid Decision",
  document_uploaded: "Document Uploaded",
  document_processed: "Document Processed",
  document_filed: "Document Filed",
  jacket_build: "Bid Setup",
  sam_ingest: "SAM Ingest",
  user_login: "User Login",
  compliance_check: "Compliance Check",
  compliance_expiry: "Compliance Expiry",
  deadline_alert: "Deadline Alert",
  egnyte_sync: "Egnyte Sync",
  vendor_created: "Vendor Created",
  vendor_approved: "Vendor Approved",
  company_created: "Company Created",
  auto_filed: "Auto-Filed",
  retro_organized: "Retro-Organized",
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  bid: "Bid Opportunity",
  bid_decision: "Bid Decision",
  approve: "Approve",
  reject: "Reject",
  review: "Review",
  score: "Score",
  ingest: "Ingest",
  create: "Create",
  update: "Update",
  delete: "Delete",
  file: "File",
  upload: "Upload",
  process: "Process",
  sync: "Sync",
  schedule: "Schedule",
  notify: "Notify",
  analyze: "Analyze",
  route: "Route",
  draft_email: "Draft Email",
  send_email: "Send Email",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  draft: "Draft",
  submitted: "Submitted",
  won: "Won",
  lost: "Lost",
  archived: "Archived",
  open: "Open",
  closed: "Closed",
  watching: "Watching",
  bidding: "Bidding",
  needs_review: "Needs Review",
  auto_approved: "Auto-Approved",
  auto_rejected: "Auto-Rejected",
};

const ROLE_LABELS: Record<string, string> = {
  estimator: "Estimator",
  project_manager: "Project Manager",
  executive: "Executive",
  admin: "Administrator",
  field_staff: "Field Staff",
  superintendent: "Superintendent",
  safety_officer: "Safety Officer",
  owner: "Owner",
};

function humanize(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/\bherbie\b/gi, "HERBIE")
    .replace(/\bai\b/gi, "AI")
    .replace(/\bsdvosb\b/gi, "SDVOSB")
    .replace(/\bnaics\b/gi, "NAICS")
    .replace(/\bsam\b/gi, "SAM")
    .replace(/\begnyte\b/gi, "Egnyte")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function entityLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  return ENTITY_TYPE_LABELS[raw] ?? humanize(raw);
}

export function eventLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  return EVENT_TYPE_LABELS[raw] ?? humanize(raw);
}

export function actionLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  return ACTION_TYPE_LABELS[raw] ?? humanize(raw);
}

export function statusLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  return STATUS_LABELS[raw] ?? humanize(raw);
}

export function roleLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  return ROLE_LABELS[raw] ?? humanize(raw);
}

export function professionalLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  return ENTITY_TYPE_LABELS[raw]
    ?? EVENT_TYPE_LABELS[raw]
    ?? ACTION_TYPE_LABELS[raw]
    ?? STATUS_LABELS[raw]
    ?? humanize(raw);
}
