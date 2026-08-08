export type Severity = 'serious' | 'moderate' | 'minor';

export type RuleId =
  | 'image-alt'
  | 'contrast'
  | 'heading-order'
  | 'form-label'
  | 'link-name'
  | 'button-name'
  | 'page-lang'
  | 'page-title'
  | 'landmark-main'
  | 'duplicate-id';

export interface Finding {
  rule: RuleId;
  severity: Severity;
  /** One line naming the specific problem, with the numbers where there are any. */
  message: string;
  /** A CSS-ish path, enough to find the element in devtools. */
  selector: string;
  /** A short excerpt of the element, so the row is recognisable. */
  snippet: string;
}

export interface AuditResult {
  url: string;
  title: string;
  /** Milliseconds since the epoch. */
  ranAt: number;
  /** How many elements were looked at, for the "checked 412 elements" line. */
  checked: number;
  findings: Finding[];
}

export interface RuleInfo {
  id: RuleId;
  title: string;
  /** Why it matters, in one sentence, for a person who has not read WCAG. */
  why: string;
  severity: Severity;
}
