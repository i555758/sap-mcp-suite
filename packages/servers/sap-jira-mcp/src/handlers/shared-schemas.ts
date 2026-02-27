/**
 * Shared Zod schemas for Jira handler modules
 */
import { z } from "zod";

/**
 * Shared custom field definitions used by both create and update issue schemas
 */
export const jiraCustomFields = {
  assignee: z.string().optional().describe("Issue assignee(inumber)"),
  reporter: z.string().optional().describe("Issue reporter(inumber)"),
  labels: z
    .string()
    .optional()
    .describe("Field for labels (used in Test template)"),
  components: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe(
      "Field for components - accepts string, string array, or object array with id/name",
    ),
  priority: z
    .string()
    .optional()
    .describe("Field for priority (used in Activity template)"),
  customfield_10240: z
    .string()
    .optional()
    .describe(
      "Test Type - Field for Test Type (e.g., Functional Integration, End to End Tests)",
    ),
  customfield_43740: z
    .string()
    .optional()
    .describe("Agile Team - Field for Agile Team (option ID)"),
  customfield_44240: z
    .string()
    .optional()
    .describe(
      "Automation Type - Field for Automation Type (e.g., Mobile, ADFv2)",
    ),
  customfield_43758: z
    .string()
    .optional()
    .describe("Stack - Field for Stack (e.g., Mobile Client(Android))"),
  customfield_22442: z
    .string()
    .optional()
    .describe(
      "Test Execution Type - Field for Test Execution Type (e.g., Manual, Cucumber)",
    ),
  customfield_22453: z
    .string()
    .optional()
    .describe(
      "Test Path - Field for Test Path (e.g., /SHG - Blue/Android/CT/Org Chart, /au-worktech)",
    ),
  customfield_44241: z
    .string()
    .optional()
    .describe("Git Path - Field for Git Path"),
  customfield_15141: z
    .string()
    .optional()
    .describe("Epic Name - Field for Epic Name"),
  customfield_44041: z
    .string()
    .optional()
    .describe(
      "Mobile Required - Field for Mobile Required (e.g., Yes, No)",
    ),
  customfield_43773: z
    .string()
    .optional()
    .describe("UI Required - Field for UI Required (e.g., Yes, No)"),
  customfield_15140: z
    .string()
    .optional()
    .describe("Epic Link - Field for Epic Link"),
  fixVersions: z
    .string()
    .optional()
    .describe("Field for fixVersions (used in Activity template)"),
  versions: z
    .string()
    .optional()
    .describe("Field for versions (used in Activity template)"),
  parent: z
    .string()
    .optional()
    .describe("Field for parent (used in Sub-Task template)"),
  sprint: z
    .string()
    .optional()
    .describe(
      "Sprint - Field for Sprint (e.g., sprint name or sprint ID)",
    ),
  customfield_12740: z
    .string()
    .optional()
    .describe(
      "Sprint - Field for Sprint using field ID (e.g., sprint name or sprint ID)",
    ),
};
