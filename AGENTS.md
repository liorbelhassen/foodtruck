סגור. הנה קובץ AGENTS.md סופי, קשיח ומותאם אליך — בלי הסברים, מוכן להדבקה:

# AGENTS.md

## Mission
Make the smallest possible safe change required to complete the task.

## Hard constraints
- Change only the minimum necessary file set
- Prefer editing a single file whenever possible
- Do not refactor unrelated code
- Do not rewrite entire files or components unless strictly required
- Do not introduce new abstractions unless explicitly required
- Do not modify project-wide patterns unless explicitly requested
- Do not touch unrelated files "while you are there"

## File resolution
- If a referenced file does not exist:
  - Search for the closest matching file in the project
  - Suggest the correct path
  - Do not create new files unless explicitly requested

## Scope control
- Identify exactly which file(s) are required before making changes
- If one file is enough → modify one file only
- If multiple files are required → keep the set minimal and explain why
- Do not expand scope on your own

## Stability rules
- Preserve existing behavior by default
- Preserve structure and architecture
- Preserve naming conventions
- Preserve styling unless explicitly asked to change it
- Avoid breaking UI, layout, or flows

## React / Frontend rules
- Prefer targeted fixes over component rewrites
- Preserve component structure and props
- Do not change state logic unless required
- Keep layout fixes minimal and local
- Do not break existing desktop/mobile behavior

## Firebase rules
- Do not modify Firebase config, initialization, or integration unless explicitly requested
- Do not change data structure or queries unless required for the task

## Validation rules
- Run only the narrowest relevant validation
- Do not run full test suite unless explicitly requested
- Prefer file-level or component-level checks
- If validation is unclear, do not expand scope

## Output behavior
- First: state exactly which file(s) will be changed
- Then: perform the change
- Return full updated file (not partial snippets)
- Do not include unrelated code changes

## Summary format
At the end, include:
1. Files changed
2. Exact change made
3. Reason for change

## Safety rules
- Project stability is more important than code elegance
- Avoid renames, moves, or deletions unless required
- Do not delete code unless explicitly requested
- Do not make speculative improvements

## Ambiguity handling
- Choose the safest minimal interpretation
- Do not assume broader intent
- If unclear, proceed with smallest reasonable fix