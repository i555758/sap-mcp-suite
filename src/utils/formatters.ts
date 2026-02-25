/**
 * Utility functions for formatting data
 */

/**
 * Format a date string to a human-readable format
 * @param dateString The date string to format
 * @returns Formatted date string
 */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Check if two strings are equal ignoring case
 * @param str1 First string
 * @param str2 Second string
 * @returns True if the strings are equal ignoring case
 */
export function isEqualIgnoreCase(str1: string, str2: string): boolean {
  return str1.toLowerCase() === str2.toLowerCase();
}

/**
 * Get the automation type object based on the type string
 * This function is kept for backward compatibility but should be replaced with
 * a more dynamic approach using field metadata or template structure
 * @param aType Automation type string
 * @returns Automation type object
 */
export function getAutomationType(aType: string): { value: string; child?: { value: string } } {
  // Parse the automation type if it contains a parent-child relationship
  if (typeof aType === 'string' && aType.includes(' - ')) {
    const [parentValue, childValue] = aType.split(' - ').map(part => part.trim());
    return {
      value: parentValue,
      child: { value: childValue }
    };
  }
  
  // If no parent-child relationship is found, use the value directly
  return { value: aType };
}

/**
 * Dynamically format a field value for Jira API based on the field name and template structure
 * This method analyzes the template value structure to determine how to format the input value
 * @param fieldName Field name
 * @param value Field value
 * @param templateValue Template value
 * @returns Formatted value
 */
export function formatFieldValueForJira(fieldName: string, value: any, templateValue: any): any {
  // If the value is empty string, return undefined so it will be omitted
  if (value === '') {
    return undefined;
  }
  
  // If the value is already an object or array, use it as is
  if (typeof value === 'object' && value !== null) {
    return value;
  }
  
  // Handle special case for values with " - " pattern (like "Mobile - CT-Component" or "SHG - Blue/Android/CT/Org Chart")
  if (typeof value === 'string' && value.includes(' - ')) {
    const parts = value.split(' - ');
    if (parts.length === 2) {
      // If the field name suggests it's a type or automation field
      if (fieldName.toLowerCase().includes('type') || 
          fieldName.toLowerCase().includes('automation')) {
        return {
          value: parts[0].trim(),
          child: { value: parts[1].trim() }
        };
      }
    }
  }
  
  // Analyze field name to determine likely format
  // This is a dynamic approach that doesn't rely on hardcoded field names
  
  // For fields that typically contain arrays of values
  if (fieldName.toLowerCase().includes('label') || 
      fieldName.toLowerCase().includes('tag') ||
      fieldName.toLowerCase().includes('component')) {
    // If the value contains commas, it might be a comma-separated list
    if (typeof value === 'string' && value.includes(',')) {
      const parts = value.split(',').map(part => part.trim());
      // For components, use name property
      if (fieldName.toLowerCase().includes('component')) {
        return parts.map(part => ({ name: part }));
      }
      // For other array fields, use simple array
      return parts;
    }
    
    // For components, use name property
    if (fieldName.toLowerCase().includes('component')) {
      return [{ name: value }];
    }
    
    return [value];
  }
  
  // If we have a template value, use its structure as a guide
  if (templateValue !== undefined && templateValue !== null) {
    // Handle array template values
    if (Array.isArray(templateValue)) {
      // If template has array of objects with name property (like components)
      if (templateValue.length > 0 && typeof templateValue[0] === 'object' && 'name' in templateValue[0]) {
        return [{ name: value }];
      }
      // If template has array of objects with value property
      else if (templateValue.length > 0 && typeof templateValue[0] === 'object' && 'value' in templateValue[0]) {
        return [{ value }];
      }
      // Simple array
      else {
        return [value];
      }
    }
    // Handle object template values
    else if (typeof templateValue === 'object' && templateValue !== null) {
      // If template has name property (like priority)
      if ('name' in templateValue) {
        return { name: value };
      }
      // If template has value property (like customfields)
      else if ('value' in templateValue) {
        // Check if the template has a child property with value
        if ('child' in templateValue && typeof templateValue.child === 'object' && 'value' in templateValue.child) {
          // This is a nested structure like Mobile - CT-Component
          // If the value contains a separator, try to split it
          if (typeof value === 'string' && value.includes(' - ')) {
            const parts = value.split(' - ');
            if (parts.length === 2) {
              return {
                value: parts[0].trim(),
                child: { value: parts[1].trim() }
              };
            }
          }
          return {
            value: value,
            child: { value: '' }  // Default empty child value
          };
        }
        return { value };
      }
      // For other object structures, try to preserve them
      else {
        return templateValue;
      }
    }
  }
  
  // For fields that typically use name property
  if (fieldName.toLowerCase().includes('priority') || 
      fieldName.toLowerCase().includes('status') ||
      fieldName.toLowerCase().includes('category')) {
    return { name: value };
  }
  
  
  // For unknown fields, use the value directly
  return value;
}
