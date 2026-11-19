# Requirements Document

## Introduction

This document specifies the production requirements for the **Wealth Trade Stock Market â€” WhatsApp Customer Engagement & Automation Platform**. The platform enables authorized employees to send personalized, automated, and scheduled WhatsApp messages to registered clients via the Meta WhatsApp Cloud API v20.0. It follows the communication style and professional standards of established financial-services brands.

The system must comply with WhatsApp Business Policy, the Digital Personal Data Protection Act 2023 (DPDP), SEBI and AMFI regulations, and India-specific Meta pricing effective 1 October 2026. All messaging is restricted to opted-in clients using Meta-approved message templates.

---

## Glossary

- **Platform**: The Wealth Trade WhatsApp Customer Engagement & Automation Platform.
- **Client**: A registered customer of Wealth Trade Stock Market stored in the Platform's database.
- **Operator**: An authenticated employee user with a role of Super Admin, Admin, Marketing Employee, Operator, or Viewer.
- **Operator_Role**: One of the five named roles â€” Super_Admin, Admin, Marketing_Employee, Operator, or Viewer â€” assigned to each authenticated employee, determining their permission set within the Platform.
- **Super_Admin**: An Operator with unrestricted access to all Platform capabilities.
- **Admin**: An Operator with access to campaign management, client management, and configuration.
- **Marketing_Employee**: An Operator permitted to create but not directly execute campaigns.
- **Viewer**: An Operator with read-only access to analytics and reports.
- **Campaign**: A batch of WhatsApp messages dispatched to a resolved audience using a single approved template.
- **Template**: A Meta-approved WhatsApp message template with parameterized variables.
- **Segment**: A named, dynamically resolved set of Clients matching defined filter criteria evaluated at dispatch time.
- **Consent_Record**: A database record capturing the opt-in or opt-out decision of a Client, including timestamp, source, and evidence.
- **Message_Log**: An immutable record of every WhatsApp message dispatched, including delivery status updates received via Meta webhook.
- **Automation_Rule**: A configured n8n workflow that triggers message dispatch on a schedule or event.
- **WABA**: WhatsApp Business Account registered with Meta.
- **Meta_API**: Meta WhatsApp Cloud API v20.0.
- **BullMQ**: The Redis-backed message queue used for asynchronous job processing.
- **Idempotency_Key**: A unique string attached to each outbound message to prevent duplicate dispatch.
- **DPDP**: Digital Personal Data Protection Act 2023 (India).
- **HMAC_SHA256**: Hash-based Message Authentication Code using SHA-256, used for webhook signature verification.
- **R2**: Cloudflare R2 object storage used for media assets and database backups.
- **IST**: Indian Standard Time (Asia/Kolkata, UTC+5:30).
- **Category_Tier**: One of RETAIL, HNI, CORPORATE, or PROSPECT â€” the business classification of a Client.
- **Delivery_Status**: One of QUEUED, SENT, DELIVERED, READ, FAILED, or UNDELIVERABLE â€” the last known state of a dispatched message.
- **Webhook_Event**: An inbound HTTP POST from Meta carrying message status updates or incoming message notifications.
- **Presigned_URL**: A time-limited, capability-scoped URL granting direct upload or download access to R2 without exposing credentials.
- **Audit_Log**: An append-only record of every write operation performed by an Operator, including actor identity, timestamp, action, and before/after state.

---

## Requirements

---

### Requirement 1: Operator Authentication and Session Management

**User Story:** As an Operator, I want to authenticate securely so that only authorized personnel can access the Platform.

#### Acceptance Criteria

1. WHEN an Operator submits valid credentials (email address and password), THE Platform SHALL issue a signed JWT access token with an expiry of 15 minutes and a signed JWT refresh token with an expiry of 7 days, both bound to the Operator's identity and role.

2. WHEN an Operator submits incorrect credentials, THE Platform SHALL respond with HTTP 401 and increment a per-account failed-attempt counter; IF the counter reaches 5 consecutive failures within a rolling 15-minute window, THEN THE Platform SHALL lock the account and require Admin intervention to unlock; WHEN an Operator submits correct credentials before the counter reaches 5, THE Platform SHALL reset the failed-attempt counter to zero.

3. WHEN an Operator presents an expired access token with a valid, non-expired refresh token, THE Platform SHALL issue a new access token and rotate the refresh token, invalidating the previous refresh token; IF both the access token and the refresh token are expired, THEN THE Platform SHALL reject the request with HTTP 401 and require the Operator to re-authenticate with credentials.

4. WHEN an Operator presents a revoked or malformed JWT, THE Platform SHALL reject the request with HTTP 401 and record the event in the Audit_Log.

5. THE Platform SHALL store JWT signing secrets exclusively in environment variables; no secret value SHALL appear in source code, configuration files committed to version control, or API responses.

6. WHEN an Operator explicitly logs out, THE Platform SHALL add the refresh token to a server-side denylist persisted in Redis with a TTL equal to the token's remaining validity.

7. WHILE an Operator holds a valid, non-expired access or refresh token, THE Platform SHALL record the last-activity timestamp on each authenticated API request; IF the recorded last-activity timestamp is more than 60 consecutive minutes in the past with no intervening authenticated API request, THEN THE Platform SHALL reject the next request with HTTP 401 and require re-authentication with credentials.

8. THE Platform SHALL redirect plaintext HTTP requests on all authentication endpoints to the equivalent HTTPS URL with HTTP 301; requests that cannot be served over HTTPS SHALL be rejected with HTTP 400.

9. WHERE multi-factor authentication is enabled for a role, THE Platform SHALL require a TOTP verification step before issuing tokens; IF the TOTP code submitted by the Operator is invalid or expired, THEN THE Platform SHALL respond with HTTP 401 and increment the per-account failed-attempt counter defined in criterion 2.

---

### Requirement 2: Role-Based Access Control (RBAC)

**User Story:** As a Super Admin, I want to enforce role-based permissions so that each Operator can only access capabilities appropriate to their responsibility.

#### Acceptance Criteria

1. THE Platform SHALL define exactly five roles â€” Super_Admin, Admin, Marketing_Employee, Operator, Viewer â€” where each role holds an independent set of named permissions (action-resource pairs such as "send_message" or "view_report"), no two roles share an identical permission set, and the permission sets are stored in the database as the authoritative source.

2. WHEN an Operator attempts an action requiring a permission not granted to their role, THE Platform SHALL respond with HTTP 403 and record the denied attempt in the Audit_Log including the Operator's identity, requested resource, and timestamp.

3. THE Platform SHALL enforce role permissions server-side on every API request; client-side UI restrictions alone SHALL NOT constitute access control.

4. WHEN a Super_Admin modifies a role's permission set, THE Platform SHALL propagate the updated permission set to all active sessions belonging to Operators assigned that role within 60 seconds of the change being committed, without requiring those Operators to re-authenticate; on the next API request after propagation, the Operator's session SHALL reflect the updated permissions.

5. IF an Operator attempts to assign themselves a role with greater permissions than their current role, or to grant themselves a permission not present in their current role, THEN THE Platform SHALL reject the request with HTTP 403 and record the attempt in the Audit_Log with the Operator's identity and timestamp.

6. THE Platform SHALL write an Audit_Log entry recording the before-and-after permission or role state atomically with each role assignment or permission change, such that the log entry is committed in the same transaction as the change.

7. WHEN any account's role is changed or the account is deactivated, THE Platform SHALL invalidate all active tokens for that account within 60 seconds of the change being committed.

8. THE Platform SHALL document the minimum required role for every API endpoint in the OpenAPI specification.

9. IF a Super_Admin submits a role assignment that references a role name not defined in the Platform's five-role set, THEN THE Platform SHALL reject the request with an error indicating the role name is invalid and leave the target account's existing role unchanged.

---

### Requirement 3: Client Record Management

**User Story:** As an Admin or Marketing Employee, I want to create, update, and manage Client records so that the Platform has accurate, complete data for targeting and compliance.

#### Acceptance Criteria

1. WHEN an Operator with Admin role or above creates a Client record, THE Platform SHALL persist the following fields: a system-generated UUID primary key, full name (required, 2â€“150 characters), WhatsApp number in E.164 format (required, unique, indexed), email address (optional, RFC 5321 compliant, unique when provided), date of birth in ISO 8601 date format (optional), wedding anniversary in ISO 8601 date format (optional), Category_Tier (required, one of RETAIL/HNI/CORPORATE/PROSPECT), Communication_Consent status (required, one of OPTED_IN/OPTED_OUT/PENDING, default PENDING), preferred language (required, ISO 639-1 code), account status (required, ACTIVE or INACTIVE, default ACTIVE), and created-at timestamp in UTC.

2. THE Platform SHALL reject Client creation if the WhatsApp number fails E.164 validation or is already associated with an existing non-deleted Client record, returning HTTP 422 with a field-level error message.

3. WHEN an Operator with Admin role or above updates a Client's WhatsApp number, THE Platform SHALL require the new number to pass E.164 validation and uniqueness check before persisting; the Platform SHALL write an Audit_Log entry recording the previous and new number values.

4. THE Platform SHALL implement soft-deletion for Client records: a deleted Client's record SHALL remain in the database with a deleted_at timestamp and SHALL be excluded from audience resolution and all outbound messaging; WHEN a Super_Admin restores a soft-deleted Client record, THE Platform SHALL clear the deleted_at timestamp, set account status to INACTIVE, and write an Audit_Log entry recording the restoring Operator's ID and the restoration timestamp.

5. WHEN an Operator imports Clients from a CSV or Excel file, THE Platform SHALL validate every row against the required field schema before persisting any row; IF any row fails validation, THEN THE Platform SHALL return a structured report identifying every failing row by its file line number and the specific validation error, and SHALL NOT persist any row from the file.

6. WHEN an Operator exports Client records, THE Platform SHALL apply the same RBAC filter that governs the requesting Operator's read access; THE Platform SHALL generate the export file asynchronously in CSV format, notify the requesting Operator via an in-platform notification when the file is ready or when generation fails, and deliver the file via a Presigned_URL valid for 15 minutes; IF the export generation is not completed within 10 minutes, THEN THE Platform SHALL cancel the job and notify the requesting Operator with an error message indicating the timeout.

7. THE Platform SHALL support searching Clients by full name (partial match, case-insensitive) and WhatsApp number (exact or prefix match of at least 4 digits) and SHALL return results within 500 ms at the 95th percentile for datasets up to 100,000 Client records.

8. THE Platform SHALL support filtering Client lists by: date of birth month, Category_Tier, Communication_Consent status, account status, preferred language, and creation date range â€” in any combination.

9. WHEN an Operator views a Client's detail page, THE Platform SHALL display the full paginated Communication_History for that Client showing all Message_Log entries associated with their WhatsApp number, ordered by dispatch timestamp descending, with a fixed page size of 25 entries per page.

10. THE Platform SHALL NOT automatically set Communication_Consent to OPTED_IN for any Client imported from an existing database; all imported Clients SHALL default to PENDING unless the import file contains a consent_status column with the value OPTED_IN for that row, in which case THE Platform SHALL set Communication_Consent to OPTED_IN for that Client only.

11. IF a Client record is selected for inclusion in a Campaign audience and any of the WhatsApp number, full name, or Category_Tier fields is null or empty, THEN THE Platform SHALL exclude that Client from the audience and include the Client's UUID in a validation report returned to the Operator before the Campaign is dispatched.

---

### Requirement 4: Communication Consent and Opt-Out Management

**User Story:** As a compliance officer, I want the Platform to enforce explicit WhatsApp marketing consent so that the company remains compliant with DPDP 2023 and WhatsApp Business Policy.

#### Acceptance Criteria

1. THE Platform SHALL maintain a Consent_Record for every Client capturing: consent status (OPTED_IN, OPTED_OUT, PENDING), consent source (IMPORT, MANUAL_ENTRY, WHATSAPP_REPLY, FORM, API), consent timestamp in UTC, evidence reference (a URI or document identifier), and the identity of the Operator who recorded it.

2. WHEN a Client's consent status is updated, THE Platform SHALL create a new immutable Consent_Record rather than modifying the existing record, preserving the full consent history indefinitely.

3. THE Platform SHALL block dispatch of any Marketing-category message to a Client whose current consent status is not OPTED_IN, returning an error that identifies the count of blocked Clients before any message from that batch is enqueued.

4. WHEN an incoming WhatsApp message containing an opt-out keyword (STOP, UNSUBSCRIBE, OPT OUT, or the Platform-configured opt-out phrase in the Client's preferred language) is received via the Meta webhook, THE Platform SHALL update the Client's consent status to OPTED_OUT within 60 seconds of webhook receipt, halt any in-progress Campaign messages queued for that Client, and log the action with the Operator identity set to SYSTEM.

5. THE Platform SHALL provide an API endpoint and UI workflow for Operators to record manual opt-outs; every manual opt-out SHALL require a reason field (1â€“500 characters) and SHALL create an Audit_Log entry recording the Operator identity, timestamp, and reason provided.

6. WHEN a Client's consent status is OPTED_OUT, THE Platform SHALL suppress all outbound Marketing-category messages for that Client regardless of Segment membership or Campaign configuration; Utility and Authentication messages SHALL proceed only if the Client has not recorded an explicit opt-out from those categories via MANUAL_ENTRY or API consent source.

7. THE Platform SHALL generate a downloadable Consent Register export (CSV format) listing all Client consent records, filterable and sortable by status and date, available to Admin role and above; the export SHALL be generated asynchronously and delivered via a Presigned_URL valid for 15 minutes.

8. THE Platform SHALL permanently retain Consent_Records and unsubscribe records for a minimum of 5 years to satisfy regulatory audit requirements.

9. FOR ALL campaigns, THE Platform SHALL revalidate the consent status of every recipient at the moment of queue insertion, not at campaign creation time; Clients who opted out between campaign scheduling and dispatch SHALL be excluded and counted in the campaign's suppressed-recipient metric.

10. IF an opt-out processing operation fails (e.g., database write error), THEN THE Platform SHALL place the opt-out event on a dedicated dead-letter queue, alert the Super_Admin via configured notification channel, suppress all further Marketing-category messages to the affected Client, and maintain that suppression until the dead-letter event is successfully reprocessed and the opt-out Consent_Record is confirmed written to the database.

---

### Requirement 5: WhatsApp Template Management

**User Story:** As a Marketing Employee, I want to create and manage WhatsApp message templates so that all outbound messages use Meta-approved content.

#### Acceptance Criteria

1. WHEN an Operator with Marketing_Employee role or above creates a Template, THE Platform SHALL require: template name (unique, lowercase alphanumeric with underscores, max 512 characters), category (MARKETING, UTILITY, or AUTHENTICATION), language (ISO 639-1 code), body text (required, 1â€“1024 characters), optional header (TEXT, IMAGE, VIDEO, or DOCUMENT type), optional footer (max 60 characters), variable definitions for each `{{N}}` placeholder listing the variable name and expected data type, and optional interactive buttons (CALL_TO_ACTION or QUICK_REPLY, max 3 per template).

2. THE Platform SHALL validate that every `{{N}}` placeholder in the template body, header, and footer has a corresponding variable definition before allowing the Template to be submitted to Meta; submission SHALL be blocked if any variable is undefined.

3. WHEN a Template is submitted to Meta for approval, THE Platform SHALL record the Meta-assigned template ID, submission timestamp, and transition the template status from DRAFT to PENDING_APPROVAL; THE Platform SHALL poll the Meta Template API or process status webhooks and persist the resulting APPROVED or REJECTED status as an atomic database write.

4. WHEN a Template is REJECTED by Meta, THE Platform SHALL surface the rejection reason returned by the Meta API (if available) in the template detail view and permit the Operator to edit and resubmit a new DRAFT version.

5. THE Platform SHALL version every Template; each submitted version SHALL be immutable after submission; Operators SHALL create a new version to modify an APPROVED template, leaving the previous approved version available for in-progress campaigns.

6. THE Platform SHALL allow Templates to define up to 10 dynamic variable placeholders; each variable SHALL be mapped to one of the following data sources at campaign creation time: Client field (name, phone number, DOB, anniversary, language), Campaign field (name, scheduled date, description), or static Operator-entered value (max 500 characters).

7. WHEN an Operator previews a Template, THE Platform SHALL render a live preview substituting real Client data from a selected sample Client record (chosen by the Operator) into all variable placeholders.

8. THE Platform SHALL prevent deletion of a Template that is referenced by an active or scheduled Campaign; deletion SHALL be blocked with an error message identifying the dependent campaigns by name and ID.

9. THE Platform SHALL track the Meta quality rating (GREEN, YELLOW, RED) for each approved Template, updating it from Meta webhooks or API polling at minimum every 24 hours; IF a Template's quality rating transitions to RED, THEN THE Platform SHALL alert all Operators with Admin role or above via the configured notification channel and prevent new campaigns from being created with that Template until the rating returns to GREEN or YELLOW.

10. FOR ALL templates, THE Platform SHALL ensure that any personally identifiable information used as a variable value (e.g., Client name, phone number) is substituted server-side at dispatch time and is never stored permanently in rendered form in the Message_Log; only the variable placeholder name and its resolved value at time of dispatch SHALL be stored.

---

### Requirement 6: Campaign Management

**User Story:** As an Admin or Marketing Employee, I want to create, preview, schedule, and manage bulk WhatsApp campaigns so that the company can engage clients at scale with approved content.

#### Acceptance Criteria

1. WHEN an Operator creates a Campaign, THE Platform SHALL require: campaign name (unique per organization, 3â€“200 characters), campaign type (BIRTHDAY, ANNIVERSARY, FESTIVAL, ANNOUNCEMENT, PROMOTIONAL, SERVICE_NOTIFICATION), target Segment or explicit Client list, Template (must be in APPROVED status), scheduled dispatch time in IST (or immediate), and an optional campaign description.

2. WHEN an Operator configures a Campaign audience, THE Platform SHALL display the resolved recipient count using real-time Segment evaluation within 3 seconds before the campaign is confirmed; this count SHALL reflect all active consent filters applied.

3. THE Platform SHALL enforce a mandatory explicit confirmation step before any bulk Campaign dispatch: the Operator SHALL be shown the resolved recipient count, the template preview with sample variable values, the estimated cost based on the Meta India pricing rate with the latest effective date at or before the confirmation timestamp, and the message category, and SHALL actively confirm before dispatch is initiated.

4. WHEN a Campaign is dispatched (immediately or at scheduled time), THE Platform SHALL insert one BullMQ job per recipient into the campaign queue; each job SHALL carry an Idempotency_Key constructed from the Campaign ID and Client ID to prevent duplicate dispatch.

5. WHEN a BullMQ job for a Campaign message is processed, THE Platform SHALL substitute all template variable values with the recipient Client's real data, call the Meta Cloud API v20.0 messages endpoint, and persist a Message_Log entry with the Meta-assigned message ID, initial Delivery_Status QUEUED, dispatch timestamp, template ID, and variable values used â€” all within a single atomic database write.

6. WHEN the Meta API returns a non-2xx HTTP response or a network timeout for a Campaign message job, THE Platform SHALL mark the message as FAILED in the Message_Log, apply exponential backoff retry (initial delay 30 seconds, multiplier 2, max 5 retries, max delay 16 minutes), and after exhausting retries move the job to a dead-letter queue and record the final error code and message.

7. WHEN an Operator pauses a Campaign, THE Platform SHALL drain no new messages from the campaign queue; messages already dispatched to Meta SHALL complete; the Campaign status SHALL transition to PAUSED and the remaining queued count SHALL be preserved.

8. WHEN an Operator cancels a Campaign, THE Platform SHALL remove all pending jobs from the campaign queue, mark the Campaign status as CANCELLED, and record the cancelling Operator's identity and timestamp.

9. THE Platform SHALL enforce Meta API rate limits by throttling outbound messages to stay within the Platform's approved per-second and per-day message tier; IF the rate limit would be exceeded, THEN THE Platform SHALL automatically delay queue processing rather than reject jobs, and no delayed job SHALL remain unprocessed in the queue for more than 24 hours due solely to rate-limit throttling.

10. WHEN a Campaign is scheduled for a future time, THE Platform SHALL store the scheduled time in UTC and display it to Operators converted to IST; the BullMQ delayed job SHALL execute no earlier than the scheduled UTC time.

11. THE Platform SHALL prevent an Operator from sending the same Campaign (same template and same recipient) more than once within a rolling 24-hour window measured from the original dispatch timestamp for that recipient; duplicate attempts SHALL be detected via the Idempotency_Key and rejected before queue insertion.

12. FOR ALL campaigns, THE Platform SHALL record the total recipients targeted, messages sent, messages delivered, messages read, messages failed, messages suppressed (due to opt-out), and messages retried, updating these counters in real time as Webhook_Events are received.

---

### Requirement 7: Meta Webhook Processing

**User Story:** As a system, I want to reliably receive and process Meta webhook events so that message delivery statuses and opt-out signals are reflected accurately in real time.

#### Acceptance Criteria

1. WHEN Meta sends a webhook POST to the Platform's webhook endpoint, THE Platform SHALL verify the X-Hub-Signature-256 header using HMAC_SHA256 with the configured App Secret before processing any payload; IF the signature verification fails, THEN THE Platform SHALL respond with HTTP 403, discard the payload, and log the failed verification attempt.

2. THE Platform SHALL respond to every verified webhook POST with HTTP 200 within 5 seconds of receipt; any processing that cannot complete within 5 seconds (including database writes and queue operations) SHALL be deferred to asynchronous background execution after the HTTP 200 response is sent.

3. WHEN a Meta webhook delivers a message status update (sent, delivered, read, failed), THE Platform SHALL update the corresponding Message_Log record's Delivery_Status and timestamp idempotently; processing the same Meta message ID twice SHALL produce the same final state without creating duplicate records.

4. WHEN a Meta webhook delivers an incoming client message, THE Platform SHALL record it as a Webhook_Event, evaluate the message text against opt-out keywords using case-insensitive exact-word matching in the Client's preferred language, and trigger the opt-out workflow defined in Requirement 4.4 if a keyword match is found.

5. THE Platform SHALL process webhook status updates such that a Delivery_Status transition is applied only if the incoming status is later in the progression sequence (SENT â†’ DELIVERED â†’ READ) than the currently stored status; IF an incoming status is earlier in the sequence than the stored status, THEN THE Platform SHALL discard the incoming update without modifying the Message_Log record.

6. WHEN Meta sends a webhook GET request for endpoint verification (hub.mode=subscribe), THE Platform SHALL validate hub.verify_token against the configured Verify Token from environment variables and respond with the hub.challenge value; the Verify Token SHALL NOT be exposed in logs or API responses.

7. THE Platform SHALL store every raw webhook payload in the webhook_events table with receipt timestamp, processing status (PENDING, PROCESSED, FAILED), and processing error message if applicable; raw payloads SHALL be retained for 90 days.

8. IF a webhook event fails processing (database error, queue error), THEN THE Platform SHALL mark it FAILED in the webhook_events table and place it on a retry queue with exponential backoff (initial delay 30 seconds, multiplier 2, maximum delay 8 minutes); IF a single webhook event accumulates 3 consecutive failed processing attempts, THEN THE Platform SHALL send an alert to the Super_Admin identifying the event ID and failure reason.

---

### Requirement 8: n8n Automation Engine

**User Story:** As an Admin, I want automated workflows for birthday, anniversary, festival, and event-triggered campaigns so that the Platform sends timely messages without manual intervention.

#### Acceptance Criteria

1. THE Birthday automation workflow SHALL execute daily at 09:00 IST; it SHALL query the Client table for all Clients whose date_of_birth month and day match the current date in the IST timezone, whose account status is ACTIVE, whose consent status is OPTED_IN, and who have not received a birthday message from the Platform in the current IST calendar year.

2. WHEN the Birthday workflow resolves eligible Clients, THE Platform SHALL validate each Client's consent status at that moment; Clients that have opted out between the daily query and dispatch SHALL be excluded; the workflow SHALL queue one BullMQ job per eligible Client using the Admin-designated birthday Template.

3. THE Anniversary automation workflow SHALL follow the same pattern as the Birthday workflow but match on the anniversary date field and use the Admin-designated anniversary Template; it SHALL execute daily at 09:00 IST.

4. WHEN an Admin configures a Festival automation rule, THE Platform SHALL require: festival name, target dispatch date in IST, target Segment, Template (APPROVED status), and an optional reminder date that must be between 1 day and 30 days before the festival dispatch date; the Festival workflow SHALL execute the campaign at the configured dispatch time and send reminders on the configured reminder date if provided.

5. THE Campaign execution workflow SHALL be triggered by a backend webhook from the Platform's API when a Campaign transitions to EXECUTING status; the workflow SHALL receive the Campaign ID, verify it in the database, and begin queuing BullMQ jobs per recipient without re-resolving the audience (audience is locked at campaign creation time).

6. THE Delivery Status workflow SHALL be triggered by the Meta webhook (processed asynchronously after HTTP 200 is returned) and SHALL update Message_Log Delivery_Status records as defined in Requirement 7.3.

7. THE Opt-out workflow SHALL be triggered by incoming WhatsApp messages containing opt-out signals and SHALL update the Client's consent status as defined in Requirement 4.4 within 60 seconds of webhook receipt; IF the opt-out workflow does not complete the status update within 60 seconds due to a processing error, THEN THE Platform SHALL mark the event FAILED and alert the Super_Admin.

8. WHEN any n8n workflow encounters an unhandled error, THE Platform SHALL route the execution to an Error Trigger node that records the error details in the automation_rules log, sends an alert to the configured notification channel, and does not silently discard the failure.

9. THE Platform SHALL provide an Admin UI for viewing the execution history of each Automation_Rule, including execution timestamp, status (SUCCESS, FAILED, PARTIAL), clients processed count, messages queued count, and error details if applicable.

10. WHEN the Platform restarts or n8n reconnects, THE Platform SHALL verify that all active Automation_Rules have their schedules registered and active; any workflow whose scheduled execution time passed during the downtime window SHALL log the missed execution timestamp without retroactively dispatching messages.

11. FOR ALL n8n workflows that dispatch messages, THE Platform SHALL pass an Idempotency_Key per recipient per workflow execution to prevent duplicate messages if a workflow node is retried.

---

### Requirement 9: Message Queue and Delivery Reliability

**User Story:** As a system, I want all outbound messages to be processed reliably through a persistent queue so that temporary failures do not result in lost or duplicate messages.

#### Acceptance Criteria

1. THE Platform SHALL use BullMQ backed by Redis (with AUTH password) as the sole mechanism for enqueuing and processing outbound WhatsApp messages; no message SHALL be dispatched synchronously from an API request handler.

2. WHEN Redis is unavailable, THE Platform SHALL reject new Campaign dispatch requests with HTTP 503 and a descriptive error; the Platform SHALL attempt to reconnect to Redis with exponential backoff (initial delay 1 second, multiplier 2, maximum delay 60 seconds) and alert the Super_Admin if Redis remains unreachable for more than 2 minutes.

3. THE Platform SHALL configure BullMQ job retention for completed jobs (24-hour TTL) and failed jobs (7-day TTL) to allow inspection and debugging without unbounded growth.

4. WHEN a Meta API call for a message fails with a retriable error code (network timeout, 5xx, or rate limit 429), THE Platform SHALL retry the job with exponential backoff: initial 30 seconds, factor 2, up to 5 attempts, maximum delay 16 minutes.

5. WHEN a Meta API call fails with a non-retriable error code (invalid phone number, template not approved, account suspended), THE Platform SHALL mark the job as permanently failed, update the Message_Log Delivery_Status to UNDELIVERABLE, and NOT retry.

6. THE Platform SHALL enforce a maximum concurrency limit on the BullMQ campaign worker, configurable via environment variable with a default of 10 concurrent jobs; IF the configured concurrency value is not a positive integer between 1 and 100, THEN THE Platform SHALL reject the configuration and log an error indicating the valid range.

7. THE Platform SHALL generate a unique Idempotency_Key for each (Campaign ID, Client ID, Automation execution ID) tuple before inserting a job; IF a job with the same Idempotency_Key already exists in the queue or in a completed/failed state within the last 24 hours, THEN the duplicate job SHALL be rejected without enqueuing.

8. THE Platform SHALL persist all BullMQ job state in Redis with AOF (Append-Only File) persistence enabled to survive process restarts without losing queued jobs.

9. FOR ALL Message_Log entries, THE Platform SHALL record the BullMQ job ID alongside the Meta message ID to enable end-to-end tracing from queue to delivery confirmation.

---

### Requirement 10: Media Asset Management

**User Story:** As a Marketing Employee, I want to upload and manage images and documents used in WhatsApp campaigns so that media content is served reliably and securely.

#### Acceptance Criteria

1. WHEN an Operator uploads a media asset, THE Platform SHALL validate: file type (JPEG, PNG for images; PDF for documents; MP4 for videos), file size (images â‰¤ 5 MB, documents â‰¤ 100 MB, videos â‰¤ 16 MB), and that the MIME type matches the declared file extension; IF any validation check fails, THEN THE Platform SHALL reject the upload with HTTP 422 and an error message identifying which validation rule was violated.

2. THE Platform SHALL generate a Presigned_URL for direct client-to-R2 upload; the Presigned_URL SHALL be valid for exactly 10 minutes from generation time; WHEN the Platform receives confirmation that the R2 upload completed successfully, THE Platform SHALL record the R2 object key, file name, MIME type, file size, uploader identity, and upload timestamp in the media_assets table.

3. WHEN a media asset is referenced in a Campaign or Template, THE Platform SHALL generate a fresh Presigned_URL for download at the time of rendering; the download Presigned_URL SHALL be valid for exactly 15 minutes from generation time; stored R2 object keys SHALL NOT be served as direct public URLs.

4. WHEN an Operator attempts to delete a media asset that is referenced by an active Template or an in-progress Campaign, THE Platform SHALL block the deletion and return an error message identifying each dependent Template and Campaign by name and ID.

5. THE Platform SHALL soft-delete media assets; deleted assets SHALL be retained in R2 for 30 days after the deletion timestamp before permanent deletion to allow recovery within that window.

6. WHEN a media asset is used in a WhatsApp Template header, THE Platform SHALL upload the media to Meta using the Media Upload API and store the resulting Meta media ID alongside the R2 object key; the Meta media ID SHALL be used in all subsequent API calls, not the R2 URL; IF the Meta Media Upload API call fails, THEN THE Platform SHALL reject the Template save operation and return an error message indicating that the Meta media upload failed, leaving the media_assets record unchanged.

7. THE Platform SHALL enforce a maximum storage quota per organization (configurable via environment variable) and reject uploads that would cause the organization's total stored asset size to exceed the quota with HTTP 413 and an error message stating the current usage and the quota limit.

---

### Requirement 11: Analytics and Reporting

**User Story:** As a Viewer or Admin, I want real-time and historical campaign analytics so that the team can measure client engagement and optimize messaging strategy.

#### Acceptance Criteria

1. WHEN a Webhook_Event is received for a Campaign, THE Platform SHALL update the following Campaign-level metrics: total recipients, delivered count, delivery rate (%), read count, read rate (%), failed count, failure rate (%), suppressed count (opt-out), retry count, and estimated cost in INR (pre-GST and post-GST at 18%); the updated metrics SHALL be reflected in the Campaign report view within 5 seconds of the Webhook_Event being processed.

2. WHEN an Operator views the Campaign report for a specific Campaign, THE Platform SHALL render all metrics within 500 ms for campaigns with up to 50,000 recipients.

3. THE Platform SHALL provide an aggregate analytics dashboard showing: total messages sent (all time, 30-day, 7-day), total delivery rate, total read rate, total failed rate, messages by category (MARKETING, UTILITY, AUTHENTICATION), messages by template, messages by campaign type, and trend charts by day for the last 90 days; the dashboard SHALL load and display all metrics within 3 seconds for datasets covering up to 90 days.

4. THE Platform SHALL support exporting Campaign reports as CSV and PDF; exports SHALL be generated asynchronously within 60 seconds of the export request and made available via Presigned_URL valid for 15 minutes; IF the export is not ready within 60 seconds, THEN THE Platform SHALL notify the requesting Operator with an error message indicating the export failed.

5. WHEN a Campaign's failure rate exceeds 10% of dispatched messages, THE Platform SHALL surface a warning alert in the Campaign dashboard and notify the Admin via email to the address recorded in the Admin's user profile.

6. THE Platform SHALL track the WhatsApp messaging cost per Campaign based on the message category and the Meta India pricing rates configured in application_settings; cost calculations SHALL reflect the rates effective at the time of dispatch, not the current rate.

7. THE Platform SHALL record a per-Client engagement history that shows: last message received, last message delivered, last message read, total messages sent, total messages read, and opt-out/opt-in events with timestamps, queryable from the Client detail view.

8. FOR ALL analytics queries involving Message_Log aggregation, THE Platform SHALL use database indexes on (campaign_id, delivery_status, dispatched_at) to satisfy the 500 ms response time target.

---

### Requirement 12: Audit Logging

**User Story:** As a Super Admin, I want an immutable audit trail of all Operator actions so that the company can investigate incidents and satisfy regulatory audits.

#### Acceptance Criteria

1. THE Platform SHALL record an Audit_Log entry for every write operation performed by an Operator, including: actor user ID and role, action type (CREATE, UPDATE, DELETE, RESTORE, LOGIN, LOGOUT, EXPORT, CAMPAIGN_EXECUTE, CONSENT_CHANGE, ROLE_CHANGE), resource type and resource ID, timestamp in UTC, IP address of the requesting client, and a JSON snapshot of the before and after state for data-modification actions.

2. THE Audit_Log table SHALL be append-only; no Operator role, including Super_Admin, SHALL have database-level permission to UPDATE or DELETE Audit_Log rows.

3. THE Platform SHALL retain Audit_Log records for a minimum of 5 years, with records older than 1 year archived to Cloudflare R2 in compressed JSON format on a monthly schedule.

4. WHEN an Operator views the Audit Log, THE Platform SHALL support filtering by actor, action type, resource type, resource ID, date range, and IP address; queries against the last 90 days of records SHALL return a paginated result set of up to 500 entries per page within 500 ms.

5. THE Platform SHALL include Audit_Log entries for all Campaign execution events, consent changes, role modifications, login attempts (success and failure), data exports, and configuration changes.

6. FOR ALL Audit_Log entries, THE Platform SHALL ensure PII fields (client name, phone number) in the before/after JSON snapshots are stored as-is for compliance purposes and are accessible only to Super_Admin and Admin roles.

---

### Requirement 13: Security Controls

**User Story:** As a Super Admin, I want comprehensive security controls so that the Platform, client data, and API credentials are protected against unauthorized access and attack.

#### Acceptance Criteria

1. THE Platform SHALL enforce HTTPS with TLS 1.2 or higher on all endpoints; Nginx SHALL redirect all HTTP requests to HTTPS using HTTP 301; SSL certificates SHALL be provisioned via Let's Encrypt with automatic renewal triggered no later than 14 days before certificate expiry.

2. THE Platform SHALL store all credentials, API keys, database connection strings, JWT secrets, Meta API tokens, Redis passwords, and R2 credentials exclusively in environment variables; no such values SHALL appear in source code, docker-compose files, or logs.

3. THE Platform SHALL apply input validation and parameterized queries (via Prisma ORM) for all database operations; raw SQL string concatenation with user-supplied values SHALL NOT be used anywhere in the codebase.

4. THE Platform SHALL implement per-IP and per-Operator rate limiting on all API endpoints: 100 requests per minute per authenticated Operator, 20 requests per minute per IP for unauthenticated endpoints; requests exceeding limits SHALL receive HTTP 429 with a Retry-After header.

5. THE Platform SHALL verify Meta webhook payloads using HMAC_SHA256 as defined in Requirement 7.1; unverified webhooks SHALL be rejected and logged.

6. THE Platform SHALL enforce content-type validation on all file uploads, accepting only the MIME types explicitly defined in the Platform's allowed file type configuration; uploaded files that pass content-type validation SHALL be virus-scanned before being written to R2 using an integrated scanning service capable of detecting known malware signatures; files failing either content-type validation or virus scan SHALL be rejected, the upload SHALL be rolled back with no data written to R2, and the event SHALL be logged with the file metadata and rejection reason.

7. THE Platform SHALL rotate the system-user Meta API access token and all application secrets on a minimum 90-day schedule; rotation SHALL be achievable without application downtime by supporting simultaneous validity of the outgoing and incoming secret for a transition window of at least 5 minutes.

8. THE Platform SHALL enable PostgreSQL encryption at rest via the hosting provider's managed encryption; database backups stored in R2 SHALL be encrypted using a KMS-managed key.

9. THE Platform SHALL deny direct database access from any source other than the Platform's backend service; database credentials SHALL NOT be accessible to the frontend or n8n directly.

10. WHEN Sentry error monitoring captures an exception, THE Platform SHALL scrub PII (phone numbers, names, email addresses, and dates of birth) from Sentry payloads before transmission using Sentry's before-send hook.

11. THE Platform SHALL apply HTTP security headers on all responses: Strict-Transport-Security (max-age >= 31536000, includeSubDomains), Content-Security-Policy, X-Frame-Options (DENY), X-Content-Type-Options (nosniff), and Referrer-Policy (no-referrer).

---

### Requirement 14: Infrastructure and Deployment

**User Story:** As a Super Admin, I want the Platform deployed on production-grade infrastructure with automated backups and monitoring so that it meets the 99.5% availability target.

#### Acceptance Criteria

1. THE Platform SHALL target 99.5% monthly uptime, measured as the fraction of minutes in the month during which the API health endpoint returns HTTP 200; planned maintenance SHALL be announced at least 24 hours in advance via the Platform's in-app notification system and the configured notification channel.

2. THE Platform SHALL expose a /api/v1/health endpoint returning HTTP 200 with a JSON payload including service name, version, database connectivity status, Redis connectivity status, and UTC timestamp; this endpoint SHALL NOT require authentication.

3. WHEN 2 consecutive health probes to the PostgreSQL database fail, THE Platform SHALL return HTTP 503 on all data-dependent endpoints and SHALL alert the Super_Admin via the configured notification channel within 2 minutes of the second consecutive failed probe.

4. THE Platform SHALL execute daily PostgreSQL backups using pg_dump, compress the dump, and upload it to a dedicated Cloudflare R2 bucket with a naming convention that includes the UTC date and database schema version; backups SHALL be retained for 30 days.

5. THE Platform SHALL be deployed via Docker containers defined in a docker-compose.prod.yml file; the backend, n8n, Redis, and Nginx services SHALL each run in separate containers; the frontend SHALL be deployed to Vercel via GitHub main branch push.

6. THE Platform's backend container SHALL pass the Docker health check defined in the Dockerfile by responding to the internal health probe within 30 seconds of container start; failed health checks SHALL trigger a container restart.

7. WHEN the backend service is redeployed, THE Platform SHALL apply Prisma database migrations automatically as part of the deployment start sequence before accepting traffic; failed migrations SHALL halt the deployment and alert the Super_Admin.

8. THE Platform SHALL use Sentry with separate DSNs for the frontend and backend; every unhandled exception, API error rate spike where errors exceed 5% of total requests in any single minute, and any individual queue processing failure SHALL generate a Sentry alert.

9. THE Platform SHALL configure all environment-specific values exclusively in environment variable files or the hosting provider's secret manager; no environment-specific configuration SHALL be baked into Docker images.

10. THE Platform SHALL run n8n as a separate Docker service accessible only from the internal Docker network; the n8n webhook URL reachable by Meta SHALL be proxied through Nginx with IP allowlisting restricted to Meta's published webhook IP ranges.

---

### Requirement 15: Compliance â€” DPDP 2023 and WhatsApp Policy

**User Story:** As a compliance officer, I want the Platform to enforce all applicable data protection and WhatsApp Business Policy requirements so that the company avoids regulatory penalties and account suspension.

#### Acceptance Criteria

1. THE Platform SHALL display a consent notice at every Client data collection touchpoint stating the purpose of data collection, the types of messages the Client will receive, the right to withdraw consent, and a reference to the company's privacy policy URL.

2. THE Platform SHALL implement a right-to-erasure workflow: WHEN an Admin initiates erasure for a Client, THE Platform SHALL anonymize all identifying fields (name, phone number, email, date of birth, anniversary) in the Client record and all associated Message_Log entries, retaining only non-identifiable operational data and consent history for the statutory retention period.

3. THE Platform SHALL enforce template category restrictions: Marketing templates SHALL require OPTED_IN consent; Utility templates MAY be sent to Clients who have not explicitly opted out; Authentication templates SHALL be sent regardless of consent status when initiated by the Client.

4. WHEN a Campaign is created with Marketing category templates, THE Platform SHALL automatically exclude all Clients whose consent status is not OPTED_IN from the audience resolution and display the excluded count to the Operator before dispatch confirmation.

5. THE Platform SHALL monitor the WABA quality rating (GREEN, YELLOW, RED) by polling the Meta Business Management API every 6 hours; IF the WABA quality rating drops to RED, THEN THE Platform SHALL automatically pause all Marketing campaign dispatches and alert the Super_Admin; IF a poll attempt fails, THEN THE Platform SHALL retry after 15 minutes and alert the Super_Admin if 3 consecutive poll attempts fail without a successful response.

6. THE Platform SHALL log all outbound messages with their template category, enabling a regulatory audit report showing message volume by category, by date, and by consent basis.

7. THE Platform SHALL enforce a data retention policy: Client records SHALL be retained for 7 years after account closure (per SEBI regulations); Message_Log records SHALL be retained for 5 years; records exceeding the retention period SHALL be automatically anonymized by a scheduled nightly job; IF the nightly anonymization job fails, THEN THE Platform SHALL alert the Super_Admin via the configured notification channel within 1 hour of the failed job execution.

8. THE Platform SHALL display the company's registered business name (Wealth Trade Stock Market) and SEBI/AMFI registration number in all client-facing template footers where the template category is MARKETING; this SHALL be enforced as a template validation rule that blocks submission of Marketing templates lacking this footer content.

9. THE Platform SHALL provide an Operator-accessible Privacy Centre UI that shows each Client their data, consent history, and communication history, and allows them to exercise DPDP rights (access, correction, erasure, withdrawal of consent) via a time-limited authenticated link that expires after 24 hours of generation.

10. FOR ALL data exports and reports containing personal data, THE Platform SHALL log the export event in the Audit_Log with the requesting Operator's identity, the data scope, and the generation timestamp.

---

### Requirement 16: Campaign Approval Workflow

**User Story:** As an Admin, I want Marketing campaigns to require explicit approval before dispatch so that unauthorized or non-compliant messages are not sent to clients.

#### Acceptance Criteria

1. WHEN a Marketing_Employee creates a Campaign of type PROMOTIONAL or ANNOUNCEMENT, THE Platform SHALL place the Campaign in PENDING_APPROVAL status and notify all Operators with Admin role or above via the Platform's in-app notification system within 60 seconds of the Campaign creation event.

2. WHEN an Admin approves a Campaign, THE Platform SHALL transition it to APPROVED status, record the approving Operator's identity and timestamp in the Campaign record, and allow the Campaign to be scheduled or dispatched.

3. WHEN an Admin rejects a Campaign, THE Platform SHALL transition it to REJECTED status, require the Admin to provide a rejection reason of at least 10 characters, and notify the creating Operator with the rejection reason via in-app notification.

4. THE Platform SHALL prevent any Campaign of type PROMOTIONAL or ANNOUNCEMENT from transitioning to EXECUTING or SCHEDULED status without an approval record from an Operator with Admin role or above.

5. WHEN a Super_Admin creates or approves a Campaign, THE Platform SHALL enforce the same compliance checks (consent validation, template approval status, audience resolution) as for any other role; Super_Admin status SHALL NOT bypass compliance checks.

6. THE Platform SHALL record the full Campaign lifecycle (DRAFT â†’ PENDING_APPROVAL â†’ APPROVED/REJECTED â†’ SCHEDULED/EXECUTING â†’ COMPLETED/CANCELLED/PAUSED) as a state transition log in the Campaign record with actor and timestamp for each transition.

---

### Requirement 17: Application Settings and Configuration Management

**User Story:** As a Super Admin, I want to manage Platform-wide configuration through the UI so that settings can be updated without redeployment.

#### Acceptance Criteria

1. THE Platform SHALL provide a Super_Admin-only Application Settings UI for configuring: default timezone (must be Asia/Kolkata, non-editable), business name as it appears in template footers, birthday and anniversary template assignments, festival calendar entries, opt-out keyword list per language, notification channel configuration (email address or webhook URL), Meta message pricing rates per category with effective date, and data retention periods.

2. WHEN a Super_Admin updates application settings, THE Platform SHALL validate all changed values before persisting; invalid values (e.g., malformed webhook URL, negative retention period, non-ISO-639-1 language code) SHALL be rejected with field-level error messages.

3. THE Platform SHALL apply setting changes without requiring a service restart; the updated value SHALL be used by all subsequent requests after the settings update API call completes.

4. THE Platform SHALL maintain a version history of application_settings changes in the Audit_Log, allowing a Super_Admin to view the previous value and who changed it.

5. WHEN the Meta India pricing rates are updated in application_settings with a future effective date, THE Platform SHALL use the rate in effect at the time of message dispatch for all cost calculations; historical campaign cost figures SHALL retain the rates that were active when those campaigns were dispatched.

---

## Correctness Properties

The following properties define invariants and round-trip behaviors the system must maintain and that are suitable for property-based testing:

### P1 â€” Consent Filter Invariant
FOR ALL campaigns dispatched by the Platform:
`recipients_dispatched âŠ† { clients | consent_status = OPTED_IN }` for Marketing-category campaigns.
No client with consent_status âˆˆ { OPTED_OUT, PENDING } SHALL appear in the Message_Log with a Marketing-category message.

### P2 â€” Idempotency Invariant
FOR ALL Idempotency_Keys:
`count(message_log WHERE idempotency_key = K) â‰¤ 1`
Inserting the same (Campaign ID, Client ID) pair into the queue N times SHALL result in exactly one Message_Log entry.

### P3 â€” Delivery Status Monotonicity
FOR ALL Message_Log entries, the Delivery_Status transitions SHALL follow the order: `QUEUED â†’ SENT â†’ DELIVERED â†’ READ`; a status SHALL NOT transition backwards (e.g., from READ to DELIVERED), even if out-of-order webhooks arrive.

### P4 â€” Audit Log Append-Only Invariant
FOR ALL Audit_Log entries written at time T:
No write operation (UPDATE or DELETE) on the audit_logs table SHALL succeed; the count of Audit_Log entries SHALL be monotonically non-decreasing.

### P5 â€” Soft Delete Exclusion Invariant
FOR ALL clients with deleted_at IS NOT NULL:
`count(campaign_recipients WHERE client_id = C AND campaign_dispatched_at > deleted_at) = 0`
Soft-deleted clients SHALL never appear as recipients in any campaign dispatched after their deletion timestamp.

### P6 â€” Template Variable Completeness Round-Trip
FOR ALL Templates with N defined variable placeholders:
`parse(template_body) â†’ extract_placeholders â†’ count = N`
AND
`render(template, variable_values) â†’ all_N_placeholders_replaced`
No rendered message SHALL contain an unreplaced `{{N}}` placeholder.

### P7 â€” Webhook Idempotency
FOR ALL Webhook_Events with Meta message ID M:
Processing the same webhook payload twice SHALL produce the same final Delivery_Status in Message_Log and SHALL NOT create duplicate webhook_events records (upsert behavior on Meta message ID + status).

### P8 â€” Cost Calculation Accuracy
FOR ALL Message_Log entries with category C dispatched at time T:
`calculated_cost = pricing_rate(C, T) Ã— 1`
where `pricing_rate(C, T)` is the rate configured in application_settings with the latest effective_date â‰¤ T.
`sum(message_log.cost WHERE campaign_id = X) = campaign_reports.total_cost[X]`
