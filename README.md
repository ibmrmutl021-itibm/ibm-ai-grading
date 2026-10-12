# IBM AI Teaching & Grading Center

Google Apps Script MVP following the approved blueprint. This repository currently implements **Build 0 and Build 1**: deployment foundation, the central Sheets schema, Drive layout, single-instructor authorization, audit logging, course offerings, roster PDF upload/extraction, immutable roster versions, comparison, enrollment-status confirmation, and confirmed student aliases.

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
├── Initializer.gs          # Safe/idempotent Build 0 setup
├── AuditService.gs         # Immutable append-only audit records
├── TestSuite.gs            # Isolated Apps Script self-test
├── Index.html              # Responsive TH/EN instructor UI
├── appsscript.json         # V8 manifest and scopes
└── tests/static.test.mjs   # Local structural/security checks
```

## Setup

1. Create a standalone Apps Script project owned by the instructor and copy/push these files with `clasp`.
2. In **Project Settings → Script Properties**, set `INSTRUCTOR_EMAIL` to the exact Google account allowed to use the app.
3. Run `setupBuild0({seedSyntheticData: true})` once from the Apps Script editor and grant the requested scopes. It creates a private database spreadsheet and `IBM_Grading_Center` root folder when IDs are not already configured.
4. In **Services**, confirm that the advanced Google Drive API (`Drive`, v3) is enabled. The manifest declares it, but the backing Google Cloud project may also require the Drive API to be enabled.
5. Copy the returned IDs into Script Properties if the runtime has not retained them automatically. `SPREADSHEET_ID` and `ROOT_FOLDER_ID` are stored by the initializer.
6. Run `runBuild1SelfTests()`. It creates isolated temporary resources, validates the foundation, 41/51-person roster reconciliation and offering isolation, then moves those resources to trash. `runBuild0SelfTests()` remains as a compatibility alias.
7. Deploy only after reviewing the test result: **Deploy → New deployment → Web app**, execute as **Me**, and restrict access to the narrowest available organization/account setting. The server still enforces `INSTRUCTOR_EMAIL` on every exposed action.

## Script Properties

| Key | Required | Purpose |
|---|---:|---|
| `INSTRUCTOR_EMAIL` | Yes, before setup | Sole instructor allowed to call server actions |
| `SPREADSHEET_ID` | Created/set by setup | Central metadata and grade database |
| `ROOT_FOLDER_ID` | Created/set by setup | Root of the private Drive hierarchy |

No AI keys are required in Build 0. Never store credentials in source, HTML, or Sheets.

## Permissions and deployment

The manifest requests Drive, Docs, Sheets, and active-user email scopes. Drive API v3 temporarily converts PDFs to private Google Docs for text/OCR extraction and moves each temporary conversion to trash after reading it. Keep the generated spreadsheet and folder private to the instructor/system principal; do not enable public link sharing. The web app runs as the deploying user so repository operations are centralized, while `Session.getActiveUser()` is checked against the allowlist. Confirm that your Workspace deployment policy exposes the active user's email before production use; consumer-account or anonymous deployment modes may return a blank email and will be denied.

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

## Local verification

```powershell
npm test
```

The end-to-end self-test must be run inside Apps Script because it verifies Google authorization, Sheets, Drive, and cleanup.

## Assumptions

- One instructor owns/deploys the MVP.
- Academic year and term are kept as strings to support Thai Buddhist years and preserve formatting.
- Build 0 may create new private resources, but it never deploys or touches an existing database without an explicitly configured ID.
- Score import, rubrics, AI grading, centralized approval queues, and exports remain intentionally out of scope until their numbered builds.

## Proposed Build 2

After Build 1 is accepted: add CSV/XLSX and Teams score ingestion, column/header preview, long/wide mapping, identity review, duplicate-batch detection, missing-versus-zero preservation, audited conflict resolution, and gradebook CSV/XLSX export. Development should use anonymized fixtures first and must not connect to a production database without explicit confirmation.
