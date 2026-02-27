/**
 * JQL-related Jira tool handlers
 * Includes: jql_examples
 */
import { HandlerContext } from "./types.js";

/**
 * Register JQL-related tools
 */
export function registerJqlHandlers(context: HandlerContext): void {
  const {
    server,
    getJiraApiService,
    initializeServices,
  } = context;

  // JQL Examples Tool
  server.registerTool(
    "jql_examples",
    {
      title: "Get JQL Examples",
      description: "Get practical JQL query examples with current SAP Jira metadata (projects, fields, statuses, etc.). Provides both example queries and metadata to help construct effective JQL searches.",
      inputSchema: {},
    },
    async (args) => {
      await initializeServices();

      const jiraApiService = getJiraApiService();

      if (!jiraApiService) {
        throw new Error("Services not initialized");
      }

      const examplesData = await jiraApiService.getJqlExamples();

      // Format the response for easy reading
      let formattedOutput = "# JQL Query Examples for SAP Jira\n\n";

      formattedOutput += "## Ready-to-Use JQL Examples\n\n";
      examplesData.examples.forEach((example, index) => {
        formattedOutput += `### ${index + 1}. ${example.title}\n`;
        formattedOutput += `**JQL:** \`${example.jql}\`\n\n`;
        formattedOutput += `**Description:** ${example.description}\n\n`;
      });

      formattedOutput += "## Current SAP Jira Metadata\n\n";

      formattedOutput += `**Current User:** ${examplesData.metadata.currentUser}\n\n`;

      formattedOutput += `**Top Projects:** ${examplesData.metadata.topProjects.join(", ")}\n\n`;

      formattedOutput += `**Common Statuses:** ${examplesData.metadata.commonStatuses.join(", ")}\n\n`;

      formattedOutput += `**Priorities:** ${examplesData.metadata.priorities.join(", ")}\n\n`;

      formattedOutput += `**Issue Types:** ${examplesData.metadata.issueTypes.join(", ")}\n\n`;

      if (examplesData.metadata.customFields.length > 0) {
        formattedOutput += "**Sample Custom Fields:**\n";
        examplesData.metadata.customFields.forEach((field) => {
          formattedOutput += `- \`"${field.name}"\` (${field.id})\n`;
        });
        formattedOutput += "\n";
      }

      formattedOutput += "## JQL Tips for SAP Jira\n\n";
      formattedOutput += "- Use `currentUser()` to find tickets assigned to you\n";
      formattedOutput += "- Date functions: `created >= -7d`, `updated >= -30d`\n";
      formattedOutput += "- Multiple values: `project IN (PTCH, EAS, WSM)`\n";
      formattedOutput += '- Text search: `summary ~ "keyword"` or `description ~ "text"`\n';
      formattedOutput += "- Negation: `status NOT IN (Closed, Resolved)`\n";
      formattedOutput += "- Ordering: `ORDER BY priority DESC, updated DESC`\n";

      return {
        content: [
          {
            type: "text",
            text: formattedOutput,
          },
          {
            type: "text",
            text: JSON.stringify(examplesData, null, 2),
          },
        ],
      };
    },
  );
}
