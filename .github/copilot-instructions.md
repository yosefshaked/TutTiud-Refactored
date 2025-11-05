# Copilot Agent Instructions

## General Rules
- Always produce a change in the repository, even if the requested task is unclear.
- If the task is ambiguous, create a placeholder file or comment explaining what needs clarification.
- Prefer small, incremental changes over large, sweeping edits.
- Include a summary of changes in the commit message.

## When Task Is Unclear
1. Create or update a file named `COPILOT_PLACEHOLDER.md` in the root of the repo.
2. In that file, describe:
   - The original request.
   - Any assumptions made.
   - Suggested next steps for a human contributor.
3. Commit this file so there is always a diff.

## When Task Is Clear
- Make the requested change directly.
- If the change is code-related, ensure it compiles or passes basic linting.
- If the change is documentation-related, ensure formatting is correct.

## Commit Message Format
Details:

Task requested:
Actions taken:
Notes:

## Example
If asked to "Improve documentation" without specifics:
- Add a section to `README.md` titled "Pending Documentation Improvements".
- List possible improvements based on repo content.
- Commit the change.