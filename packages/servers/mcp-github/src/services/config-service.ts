/**
 * Configuration service for GitHub MCP server
 */

export interface GitHubConfig {
  defaultOwner?: string;
  workingDirectory?: string;
}

/**
 * Configuration service class
 */
export class ConfigService {
  /**
   * Get default owner from environment
   */
  getDefaultOwner(): string | undefined {
    return process.env.GITHUB_DEFAULT_OWNER;
  }

  /**
   * Get working directory from environment
   */
  getWorkingDirectory(): string {
    return process.env.GITHUB_WORKING_DIRECTORY || process.cwd();
  }

  /**
   * Get all configuration
   */
  getAll(): GitHubConfig {
    return {
      defaultOwner: this.getDefaultOwner(),
      workingDirectory: this.getWorkingDirectory()
    };
  }
}
