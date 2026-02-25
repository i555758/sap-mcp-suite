## Technology
- This is a nodejs based application, all code must follow the industry python best practice.

## Best Practice
- IF AI want to run some temporary test (not formal UT), please create a file under {project root}/local-test folder, if folder does not exist, please create one.
- All temporary test code must remove when finish the test, no temp code allow to keep in the project.

## AI use rules
- you must use MCP tools to do web content search, Don't use web_search tool, the model only supports: 'bash_20250124', 'custom', 'text_editor_20250124', 'text_editor_20250429', 'text_editor_20250728'
