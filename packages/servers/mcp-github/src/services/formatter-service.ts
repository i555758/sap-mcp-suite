/**
 * Formatter functions for GitHub MCP server
 */
import {
  GitHubRepository,
  GitHubUser,
  GitHubIssue,
  GitHubPullRequest
} from '../types.js';
import { formatDate } from 'mcp-utils';

/**
 * Format repository list
 */
export function formatRepositoryList(repositories: GitHubRepository[]): string {
  if (repositories.length === 0) {
    return 'No repositories found.';
  }

  let output = `Found ${repositories.length} repositories:\n\n`;

  repositories.forEach(repo => {
    output += `**${repo.full_name}**\n`;
    if (repo.description) {
      output += `  Description: ${repo.description}\n`;
    }
    output += `  Language: ${repo.language || 'N/A'}\n`;
    output += `  Stars: ${repo.stargazers_count} | Forks: ${repo.forks_count}\n`;
    output += `  Private: ${repo.private ? 'Yes' : 'No'}\n`;
    output += `  URL: ${repo.html_url}\n`;
    output += `  Updated: ${formatDate(repo.updated_at)}\n\n`;
  });

  return output;
}

/**
 * Format single repository
 */
export function formatRepository(repo: GitHubRepository): string {
  let output = `# ${repo.full_name}\n\n`;

  if (repo.description) {
    output += `**Description:** ${repo.description}\n\n`;
  }

  output += `**Details:**\n`;
  output += `- Language: ${repo.language || 'N/A'}\n`;
  output += `- Stars: ${repo.stargazers_count}\n`;
  output += `- Forks: ${repo.forks_count}\n`;
  output += `- Open Issues: ${repo.open_issues_count}\n`;
  output += `- Private: ${repo.private ? 'Yes' : 'No'}\n`;
  output += `- Default Branch: ${repo.default_branch}\n`;
  output += `- Created: ${formatDate(repo.created_at)}\n`;
  output += `- Updated: ${formatDate(repo.updated_at)}\n`;
  output += `- Last Push: ${formatDate(repo.pushed_at)}\n\n`;

  if (repo.topics && repo.topics.length > 0) {
    output += `**Topics:** ${repo.topics.join(', ')}\n\n`;
  }

  if (repo.license) {
    output += `**License:** ${repo.license.name}\n\n`;
  }

  output += `**URLs:**\n`;
  output += `- GitHub: ${repo.html_url}\n`;
  output += `- Clone (HTTPS): ${repo.clone_url}\n`;
  output += `- Clone (SSH): ${repo.ssh_url}\n`;

  return output;
}

/**
 * Format user details
 */
export function formatUser(user: GitHubUser): string {
  let output = `# ${user.login}\n\n`;

  if (user.name) {
    output += `**Name:** ${user.name}\n`;
  }

  if (user.bio) {
    output += `**Bio:** ${user.bio}\n`;
  }

  output += `**Details:**\n`;
  output += `- Type: ${user.type}\n`;

  if (user.company) {
    output += `- Company: ${user.company}\n`;
  }

  if (user.location) {
    output += `- Location: ${user.location}\n`;
  }

  if (user.blog) {
    output += `- Blog: ${user.blog}\n`;
  }

  if (user.email) {
    output += `- Email: ${user.email}\n`;
  }

  if (user.public_repos !== undefined) {
    output += `- Public Repos: ${user.public_repos}\n`;
  }

  if (user.followers !== undefined) {
    output += `- Followers: ${user.followers}\n`;
  }

  if (user.following !== undefined) {
    output += `- Following: ${user.following}\n`;
  }

  if (user.created_at) {
    output += `- Joined: ${formatDate(user.created_at)}\n`;
  }

  output += `\n**Profile:** ${user.html_url}\n`;

  return output;
}

/**
 * Format issue list
 */
export function formatIssueList(issues: GitHubIssue[]): string {
  if (issues.length === 0) {
    return 'No issues found.';
  }

  let output = `Found ${issues.length} issues:\n\n`;

  issues.forEach(issue => {
    output += `**#${issue.number}** ${issue.title}\n`;
    output += `  State: ${issue.state}\n`;
    output += `  Author: ${issue.user.login}\n`;

    if (issue.assignee) {
      output += `  Assignee: ${issue.assignee.login}\n`;
    }

    if (issue.labels.length > 0) {
      output += `  Labels: ${issue.labels.map(label => label.name).join(', ')}\n`;
    }

    output += `  Comments: ${issue.comments}\n`;
    output += `  Created: ${formatDate(issue.created_at)}\n`;
    output += `  URL: ${issue.html_url}\n\n`;
  });

  return output;
}

/**
 * Format single issue
 */
export function formatIssue(issue: GitHubIssue): string {
  let output = `# Issue #${issue.number}: ${issue.title}\n\n`;

  output += `**State:** ${issue.state}\n`;
  output += `**Author:** ${issue.user.login}\n`;

  if (issue.assignee) {
    output += `**Assignee:** ${issue.assignee.login}\n`;
  }

  if (issue.labels.length > 0) {
    output += `**Labels:** ${issue.labels.map(label => label.name).join(', ')}\n`;
  }

  if (issue.milestone) {
    output += `**Milestone:** ${issue.milestone.title}\n`;
  }

  output += `**Comments:** ${issue.comments}\n`;
  output += `**Created:** ${formatDate(issue.created_at)}\n`;
  output += `**Updated:** ${formatDate(issue.updated_at)}\n`;

  if (issue.closed_at) {
    output += `**Closed:** ${formatDate(issue.closed_at)}\n`;
  }

  output += `\n**URL:** ${issue.html_url}\n`;

  if (issue.body) {
    output += `\n**Description:**\n${issue.body}\n`;
  }

  return output;
}

/**
 * Format pull request list
 */
export function formatPullRequestList(prs: GitHubPullRequest[]): string {
  if (prs.length === 0) {
    return 'No pull requests found.';
  }

  let output = `Found ${prs.length} pull requests:\n\n`;

  prs.forEach(pr => {
    output += `**#${pr.number}** ${pr.title}\n`;
    output += `  State: ${pr.state}\n`;
    output += `  Author: ${pr.user.login}\n`;
    output += `  Branch: ${pr.head.ref} → ${pr.base.ref}\n`;

    if (pr.assignee) {
      output += `  Assignee: ${pr.assignee.login}\n`;
    }

    if (pr.labels.length > 0) {
      output += `  Labels: ${pr.labels.map(label => label.name).join(', ')}\n`;
    }

    output += `  Comments: ${pr.comments} | Review Comments: ${pr.review_comments}\n`;
    output += `  Changes: +${pr.additions} -${pr.deletions} (${pr.changed_files} files)\n`;
    output += `  Created: ${formatDate(pr.created_at)}\n`;
    output += `  URL: ${pr.html_url}\n\n`;
  });

  return output;
}

/**
 * Format single pull request
 */
export function formatPullRequest(pr: GitHubPullRequest): string {
  let output = `# Pull Request #${pr.number}: ${pr.title}\n\n`;

  output += `**State:** ${pr.state}\n`;
  output += `**Author:** ${pr.user.login}\n`;
  output += `**Branch:** ${pr.head.ref} → ${pr.base.ref}\n`;

  if (pr.assignee) {
    output += `**Assignee:** ${pr.assignee.login}\n`;
  }

  if (pr.requested_reviewers.length > 0) {
    output += `**Reviewers:** ${pr.requested_reviewers.map(reviewer => reviewer.login).join(', ')}\n`;
  }

  if (pr.labels.length > 0) {
    output += `**Labels:** ${pr.labels.map(label => label.name).join(', ')}\n`;
  }

  if (pr.milestone) {
    output += `**Milestone:** ${pr.milestone.title}\n`;
  }

  output += `**Comments:** ${pr.comments} | **Review Comments:** ${pr.review_comments}\n`;
  output += `**Commits:** ${pr.commits}\n`;
  output += `**Changes:** +${pr.additions} -${pr.deletions} (${pr.changed_files} files)\n`;
  output += `**Draft:** ${pr.draft ? 'Yes' : 'No'}\n`;
  output += `**Mergeable:** ${pr.mergeable !== null ? (pr.mergeable ? 'Yes' : 'No') : 'Unknown'}\n`;

  output += `**Created:** ${formatDate(pr.created_at)}\n`;
  output += `**Updated:** ${formatDate(pr.updated_at)}\n`;

  if (pr.closed_at) {
    output += `**Closed:** ${formatDate(pr.closed_at)}\n`;
  }

  if (pr.merged_at) {
    output += `**Merged:** ${formatDate(pr.merged_at)}\n`;
    if (pr.merged_by) {
      output += `**Merged by:** ${pr.merged_by.login}\n`;
    }
  }

  output += `\n**URL:** ${pr.html_url}\n`;

  if (pr.body) {
    output += `\n**Description:**\n${pr.body}\n`;
  }

  return output;
}


/**
 * Format simple list
 */
export function formatList(items: string[], title: string): string {
  if (items.length === 0) {
    return `No ${title.toLowerCase()} found.`;
  }

  let output = `${title} (${items.length}):\n\n`;
  items.forEach(item => {
    output += `- ${item}\n`;
  });

  return output;
}

/**
 * Format pull request reviews
 */
export function formatPullRequestReviews(reviews: any[]): string {
  if (reviews.length === 0) {
    return 'No reviews found.';
  }

  let output = `Found ${reviews.length} reviews:\n\n`;

  reviews.forEach(review => {
    output += `**Review #${review.id}** by ${review.user.login}\n`;
    output += `  State: ${review.state}\n`;
    output += `  Submitted: ${formatDate(review.submitted_at)}\n`;
    if (review.body) {
      output += `  Comment: ${review.body.substring(0, 200)}${review.body.length > 200 ? '...' : ''}\n`;
    }
    output += `  URL: ${review.html_url}\n\n`;
  });

  return output;
}

/**
 * Format pull request review comments
 */
export function formatPullRequestReviewComments(comments: any[]): string {
  if (comments.length === 0) {
    return 'No review comments found.';
  }

  let output = `Found ${comments.length} review comments:\n\n`;

  comments.forEach(comment => {
    output += `**Comment #${comment.id}** by ${comment.user.login}\n`;
    output += `  File: ${comment.path}:${comment.line || comment.original_line}\n`;
    output += `  Created: ${formatDate(comment.created_at)}\n`;
    if (comment.updated_at !== comment.created_at) {
      output += `  Updated: ${formatDate(comment.updated_at)}\n`;
    }
    output += `  Comment: ${comment.body.substring(0, 300)}${comment.body.length > 300 ? '...' : ''}\n`;
    output += `  URL: ${comment.html_url}\n\n`;
  });

  return output;
}

/**
 * Format pull request issue comments
 */
export function formatPullRequestIssueComments(comments: any[]): string {
  if (comments.length === 0) {
    return 'No general comments found.';
  }

  let output = `Found ${comments.length} general comments:\n\n`;

  comments.forEach(comment => {
    output += `**Comment #${comment.id}** by ${comment.user.login}\n`;
    output += `  Created: ${formatDate(comment.created_at)}\n`;
    if (comment.updated_at !== comment.created_at) {
      output += `  Updated: ${formatDate(comment.updated_at)}\n`;
    }
    output += `  Comment: ${comment.body.substring(0, 300)}${comment.body.length > 300 ? '...' : ''}\n`;
    output += `  URL: ${comment.html_url}\n\n`;
  });

  return output;
}

/**
 * Format detailed pull request information
 */
export function formatPullRequestWithDetails(data: {
  pullRequest: GitHubPullRequest;
  reviews: any[];
  reviewComments: any[];
  issueComments: any[];
}): string {
  let output = formatPullRequest(data.pullRequest);

  output += '\n---\n\n';

  // Review summary
  const approvals = data.reviews.filter(r => r.state === 'APPROVED').length;
  const changesRequested = data.reviews.filter(r => r.state === 'CHANGES_REQUESTED').length;
  const comments = data.reviews.filter(r => r.state === 'COMMENTED').length;

  output += `## Review Summary\n`;
  output += `- **Total Reviews:** ${data.reviews.length}\n`;
  output += `- **Approvals:** ${approvals}\n`;
  output += `- **Changes Requested:** ${changesRequested}\n`;
  output += `- **Comments Only:** ${comments}\n`;
  output += `- **Review Comments:** ${data.reviewComments.length}\n`;
  output += `- **General Comments:** ${data.issueComments.length}\n\n`;

  if (data.reviews.length > 0) {
    output += '## Reviews\n\n';
    output += formatPullRequestReviews(data.reviews);
  }

  if (data.reviewComments.length > 0) {
    output += '\n## Code Review Comments\n\n';
    output += formatPullRequestReviewComments(data.reviewComments);
  }

  if (data.issueComments.length > 0) {
    output += '\n## General Comments\n\n';
    output += formatPullRequestIssueComments(data.issueComments);
  }

  return output;
}

/**
 * Format pull request list with review summaries
 */
export function formatPullRequestListWithDetails(data: {
  pullRequests: GitHubPullRequest[];
  reviewSummaries: { [key: number]: { reviewCount: number; approvals: number; changesRequested: number; } };
}): string {
  if (data.pullRequests.length === 0) {
    return 'No pull requests found.';
  }

  let output = `Found ${data.pullRequests.length} pull requests:\n\n`;

  data.pullRequests.forEach(pr => {
    const summary = data.reviewSummaries[pr.number] || { reviewCount: 0, approvals: 0, changesRequested: 0 };

    output += `**#${pr.number}** ${pr.title}\n`;
    output += `  State: ${pr.state}\n`;
    output += `  Author: ${pr.user.login}\n`;
    output += `  Branch: ${pr.head.ref} → ${pr.base.ref}\n`;

    if (pr.assignee) {
      output += `  Assignee: ${pr.assignee.login}\n`;
    }

    if (pr.requested_reviewers.length > 0) {
      output += `  Requested Reviewers: ${pr.requested_reviewers.map(r => r.login).join(', ')}\n`;
    }

    output += `  Reviews: ${summary.reviewCount} (${summary.approvals} approved, ${summary.changesRequested} changes requested)\n`;
    output += `  Comments: ${pr.comments} | Review Comments: ${pr.review_comments}\n`;
    output += `  Changes: +${pr.additions} -${pr.deletions} (${pr.changed_files} files)\n`;
    output += `  Created: ${formatDate(pr.created_at)}\n`;
    output += `  URL: ${pr.html_url}\n\n`;
  });

  return output;
}

/**
 * Format a single comment (issue comment or review comment)
 */
export function formatComment(comment: any, commentType: 'issue' | 'review' = 'issue'): string {
  let output = `# Comment #${comment.id}\n\n`;

  output += `**Author:** ${comment.user.login}\n`;
  output += `**Type:** ${commentType === 'review' ? 'Review Comment' : 'Issue Comment'}\n`;
  output += `**Created:** ${formatDate(comment.created_at)}\n`;

  if (comment.updated_at !== comment.created_at) {
    output += `**Updated:** ${formatDate(comment.updated_at)}\n`;
  }

  if (commentType === 'review' && comment.path) {
    output += `**File:** ${comment.path}\n`;
    if (comment.line || comment.original_line) {
      output += `**Line:** ${comment.line || comment.original_line}\n`;
    }
  }

  output += `**URL:** ${comment.html_url}\n\n`;
  output += `**Content:**\n${comment.body}\n`;

  return output;
}

/**
 * Format comment reply result
 */
export function formatCommentReply(reply: any, originalComment: any): string {
  let output = `# Reply Posted Successfully\n\n`;

  output += `**Reply ID:** ${reply.id}\n`;
  output += `**Author:** ${reply.user.login}\n`;
  output += `**Posted:** ${formatDate(reply.created_at)}\n`;
  output += `**In Reply To:** Comment #${originalComment.id} by ${originalComment.user.login}\n`;
  output += `**URL:** ${reply.html_url}\n\n`;
  output += `**Reply Content:**\n${reply.body}\n`;

  return output;
}

/**
 * Format comment update result
 */
export function formatCommentUpdate(comment: any): string {
  let output = `# Comment Updated Successfully\n\n`;

  output += `**Comment ID:** ${comment.id}\n`;
  output += `**Author:** ${comment.user.login}\n`;
  output += `**Updated:** ${formatDate(comment.updated_at)}\n`;
  output += `**URL:** ${comment.html_url}\n\n`;
  output += `**Updated Content:**\n${comment.body}\n`;

  return output;
}
