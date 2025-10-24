# Investigation Prompt Template

## To: Codex (Software Architect)
## From: A Developer
## Subject: Code Analysis: Document the Supabase Query Pattern in an Existing Project

### 1. Context and Objective
You are tasked with analyzing an existing codebase to understand its database interaction patterns. The project is a web application that uses Supabase as its backend.
Your mission is to act as a code investigator. You will analyze the provided codebase to identify and document the exact convention used for querying database tables.

### 2. Source of Truth
The definitive source for this investigation is the provided TutRate repository.

### 3. Core Investigation Task
Please analyze the server-side API functions within the repository (located in the /api directory) and produce a concise technical report that answers one critical question:
**What is the standard convention for table names used in Supabase queries within this project?**

To answer this, please:
- Find several examples of Supabase SELECT queries in the code (e.g., `client.from('...').select('...')`).
- Examine the string passed to the `.from()` method in these working examples.
- Report back on the character casing convention used for these table names. Are they lowercase, PascalCase, snake_case, or something else?
- Provide at least two distinct code snippets from the repository that clearly demonstrate this convention.

### 4. Constraints
This is an investigation and reporting task only.
- Base your report only on the code found in the repository. Do not make assumptions.
- The report should be factual and focused solely on answering the question about table naming conventions.