# Project Documentation (English)

## Intake Review Queue Dashboard Enhancements
- Pending intake student rows now show key identifiers (ID, contact name, phone) in a single horizontal row for desktop readability.
- Admins see the assigned instructor label inline with the same row.
- Admins can filter pending intake items by instructor, unassigned, or all.
- Mobile layout wraps the row into stacked pill groups for comfortable scanning.
- The intake queue now renders a collapsed summary header with total pending counts split into new (unassigned) and existing (assigned) students.
- The summary highlights large-number tiles for new vs existing pending intakes for quick scanning in a scorecard layout sized to a half-page card.
- Clicking the scorecard tiles (or the "Open Queue" action) opens the detailed queue in a modal with the matching filter applied.
- The summary stays visible with loading, error, and empty states, and exposes a retry action on load failures.
- Admins can assign the intake to an instructor (plus contact details and notes) from the queue modal, which makes the intake visible to the assigned instructor for approval.
- Intake approvals are now completed by the assigned instructor after the admin assignment step.
- Dashboard quick-action cards for students and new session were removed; use the right-side menu entries for navigation and session creation.
