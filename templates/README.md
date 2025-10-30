# PowerPoint Templates

Place the `report_template.pptx` file in this directory. The backend service uses it as the base presentation when generating reports.

Supported placeholder tokens:

- `{{REPORT_TITLE}}`
- `{{REPORT_SUMMARY}}`
- `{{GENERATED_ON}}`
- `{{SECTION_{n}_TITLE}}`
- `{{SECTION_{n}_BODY}}`
- `{{SECTION_{n}_BULLETS}}`
- `{{SECTION_{n}_BULLET_{m}}}`

Where `n` is the section number starting at 1 and `m` is the bullet index starting at 1 (up to the configured maximum).
