# IBM AI Teaching & Grading Center

Google Apps Script MVP following the approved blueprint. This repository currently implements **Build 0 only**: deployment foundation, the central Sheets schema, Drive layout, single-instructor authorization, audit logging, synthetic test data, and a minimal bilingual course-offering UI.

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
4. Copy the returned IDs into Script Properties if the runtime has not retained them automatically. `SPREADSHEET_ID` and `ROOT_FOLDER_ID` are stored by the initializer.
5. Run `runBuild0SelfTests()`. It creates isolated temporary resources, validates Build 0, then moves those resources to trash.
6. Deploy only after reviewing the test result: **Deploy → New deployment → Web app**, execute as **Me**, and restrict access to the narrowest available organization/account setting. The server still enforces `INSTRUCTOR_EMAIL` on every exposed action.

## Script Properties

| Key | Required | Purpose |
|---|---:|---|
| `INSTRUCTOR_EMAIL` | Yes, before setup | Sole instructor allowed to call server actions |
| `SPREADSHEET_ID` | Created/set by setup | Central metadata and grade database |
| `ROOT_FOLDER_ID` | Created/set by setup | Root of the private Drive hierarchy |

No AI keys are required in Build 0. Never store credentials in source, HTML, or Sheets.

## Permissions and deployment

The manifest requests Drive, Sheets, and active-user email scopes. Keep the generated spreadsheet and folder private to the instructor/system principal; do not enable public link sharing. The web app runs as the deploying user so repository operations are centralized, while `Session.getActiveUser()` is checked against the allowlist. Confirm that your Workspace deployment policy exposes the active user's email before production use; consumer-account or anonymous deployment modes may return a blank email and will be denied.

## Build 0 behavior

- Schema initialization is idempotent and refuses to overwrite incompatible existing headers.
- Sheet writes use `LockService` and batched ranges.
- Course offering creation generates UUIDs and appends an audit event.
- The initializer does not reuse or modify an unknown database unless its ID is deliberately supplied as a Script Property or function option.
- Test records are synthetic. No real student data is included.

## Local verification

```powershell
npm test
```

The end-to-end self-test must be run inside Apps Script because it verifies Google authorization, Sheets, Drive, and cleanup.

## Assumptions

- One instructor owns/deploys the MVP.
- Academic year and term are kept as strings to support Thai Buddhist years and preserve formatting.
- Build 0 may create new private resources, but it never deploys or touches an existing database without an explicitly configured ID.
- Roster parsing, score import, rubrics, AI grading, approval queues, and exports remain intentionally out of scope until their numbered builds.

## Proposed Build 1

After Build 0 is accepted: add classroom/exam roster upload, immutable roster versions, parsing preview, version comparison, explicit-W proposal and confirmation, enrollment status audit, and confirmed student aliases. Development should use anonymized fixtures first and must not connect to a production database without explicit confirmation.
