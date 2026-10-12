# IBM AI Teaching & Grading Center

Google Apps Script MVP following the approved blueprint. This repository currently implements **Build 0 through Build 2**: the deployment foundation, roster/identity workflow, CSV/XLSX score ingestion, reviewable mapping, conflict-safe gradebook commit/rollback, and roster-ordered CSV export.

## File tree

```text
.
├── Code.gs                 # Web entry point and bootstrap API
├── Config.gs               # Constants and Script Property access
├── Auth.gs                 # Single-instructor allowlist guard
├── Schema.gs               # Logical workbook schema
├── SheetsRepo.gs           # Bulk-oriented Sheets repository
├── DriveRepo.gs            # Restricted Drive folder initializer
├── CourseService.gs        # Build 0 course-offering service
├── RosterService.gs        # Build 1 roster extraction, comparison and approval
├── IdentityMatchService.gs # Section-scoped exact and suggested matching
├── ImportService.gs        # Build 2 CSV/XLSX upload, mapping and normalization
├── GradebookService.gs     # Conflict-safe commit and audited rollback
├── ExportService.gs        # Official-roster-order CSV export
├── Initializer.gs          # Safe/idempotent Build 0 setup
├── AuditService.gs         # Immutable append-only audit records
├── TestSuite.gs            # Isolated Apps Script self-test
├── Index.html              # Responsive TH/EN instructor UI
├── appsscript.json         # V8 manifest and scopes
└── tests/static.test.mjs   # Local structural/security checks
```

## Setup

1. Create a standalone Apps Script project owned by the instructor and copy/push these files with `clasp`.
2. In **Project Settings → Script Properties**, set `INSTRUCTOR_EMAIL` to the exact Google account allowed to use the app. For a new standalone project, the first signed-in owner can initialize this property automatically; non-owners cannot claim it.
3. Run `setupBuild0({seedSyntheticData: true})` once from the Apps Script editor and grant the requested scopes. It creates a private database spreadsheet and `IBM_Grading_Center` root folder when IDs are not already configured.
4. In **Services**, confirm that the advanced Google Drive API (`Drive`, v3) is enabled. The manifest declares it, but the backing Google Cloud project may also require the Drive API to be enabled.
5. Copy the returned IDs into Script Properties if the runtime has not retained them automatically. `SPREADSHEET_ID` and `ROOT_FOLDER_ID` are stored by the initializer.
6. Run `runBuild2SelfTests()`. It creates isolated temporary resources, validates the foundation, 41/51-person roster reconciliation, offering isolation, identity precedence, and score-state separation, then moves those resources to trash. Earlier self-test names remain as compatibility aliases.
7. Deploy only after reviewing the test result: **Deploy → New deployment → Web app**, execute as **User accessing the web app**, and require a signed-in Google account. The server still enforces `INSTRUCTOR_EMAIL` on every exposed action.

## Script Properties

| Key | Required | Purpose |
|---|---:|---|
| `INSTRUCTOR_EMAIL` | Yes, before setup | Sole instructor allowed to call server actions |
| `SPREADSHEET_ID` | Created/set by setup | Central metadata and grade database |
| `ROOT_FOLDER_ID` | Created/set by setup | Root of the private Drive hierarchy |

No AI keys are required in Build 0. Never store credentials in source, HTML, or Sheets.

## Permissions and deployment

The manifest requests Drive, Docs, Sheets, and active-user email scopes. Drive API v3 temporarily converts PDFs to private Google Docs for text/OCR extraction and moves each temporary conversion to trash after reading it. Keep the generated spreadsheet and folder private to the instructor/system principal; do not enable public link sharing. The web app runs as the signed-in accessing user so `Session.getActiveUser()` can be checked against the instructor allowlist. Anonymous or identity-hidden sessions are denied.

## Build 0 behavior

- Schema initialization is idempotent and refuses to overwrite incompatible existing headers.
- Sheet writes use `LockService` and batched ranges.
- Course offering creation generates UUIDs and appends an audit event.
- The initializer does not reuse or modify an unknown database unless its ID is deliberately supplied as a Script Property or function option.
- Test records are synthetic. No real student data is included.

## Build 1 behavior

- Accepts classroom or exam-attendance roster PDFs up to 10 MB, selected before upload.
- Preserves the private source PDF and SHA-256 lineage before review.
- Converts the PDF to a temporary private Google Doc for text/OCR extraction; ambiguous rows remain review-required.
- Compares against the latest approved roster in the same offering only.
- An explicit `ถอนวิชา(W)` is proposed and requires an instructor decision; it is never silently committed.
- A student missing from a later roster becomes `PENDING_VERIFICATION`, never automatic W.
- Official names are not silently overwritten when a later roster differs.
- Confirmed aliases record actor, timestamp, type and scope.

## Build 2 behavior

- Accepts Teams or generic CSV/XLSX files up to 10 MB; source files are stored privately with SHA-256 duplicate detection.
- Supports long and wide layouts with instructor-controlled column mapping.
- Exact validated Student ID is matched first, followed by confirmed alias and unique exact normalized name.
- Fuzzy suggestions are never committed until the instructor explicitly confirms a student in the selected offering.
- Blank, `Viewed`, `Absent`, `Not submitted`, `Ungraded`, `Excused`, and numeric zero remain distinct.
- Existing grades require `SKIP`, `REPLACE_WITH_AUDIT`, or `REVIEW_DIFF`; duplicate rows within a batch cannot silently create duplicate gradebook records.
- Import rollback restores replaced values from audit history or voids newly created entries without deleting provenance.
- CSV export follows the latest approved roster order, can include W students, does not calculate a letter grade for W, and mitigates spreadsheet-formula injection.

## Local verification

```powershell
npm test
```

The end-to-end self-test must be run inside Apps Script because it verifies Google authorization, Sheets, Drive, and cleanup.

## Assumptions

- One instructor owns/deploys the MVP.
- Academic year and term are kept as strings to support Thai Buddhist years and preserve formatting.
- Build 0 may create new private resources, but it never deploys or touches an existing database without an explicitly configured ID.
- Rubrics, AI grading, photo extraction, and the centralized approval queue remain intentionally out of scope until their numbered builds.

## Proposed Build 3

After Build 2 is accepted: replace import placeholders with the full assessment form, criterion rubric editor, answer-key editor, strict maximum validation, immutable rubric versions, approval and locking. Development should use anonymized fixtures first and must not connect to a production database without explicit confirmation.
