# Property Hook Examples

Here are some practical examples of property hooks to help you understand how to use them effectively.

## Example 1: Update Modified Date

This hook automatically updates a `modified` property whenever a `status` property changes:

```javascript
// When status changes, update the modified date
const now = new Date().toISOString();
event.response.frontmatter.modified = now;
console.log(`Status changed from ${event.request.oldValue} to ${event.request.newValue}, updated modified date to ${now}`);
```

## Example 2: Calculate Completion Percentage

This hook calculates a completion percentage based on the number of completed items:

```javascript
// When total items or completed items change, calculate percentage
const frontmatter = event.request.frontmatter;
const completed = frontmatter.completed_items || 0;
const total = frontmatter.total_items || 1;
const percentage = Math.round((completed / total) * 100);

event.response.frontmatter.completion_percentage = percentage;

// Also update status based on percentage
if (percentage >= 100) {
    event.response.frontmatter.status = 'Complete';
} else if (percentage > 0) {
    event.response.frontmatter.status = 'In Progress';
} else {
    event.response.frontmatter.status = 'Not Started';
}
```

## Example 3: Task Status Based on Due Date

This hook updates a task's status based on its due date:

```javascript
// When due_date changes
const now = new Date();
const dueDate = new Date(event.request.newValue);

// Calculate days difference
const diffTime = dueDate.getTime() - now.getTime();
const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

// Update status and priority based on due date
if (diffDays < 0) {
    event.response.frontmatter.status = 'Overdue';
    event.response.frontmatter.priority = 'High';
} else if (diffDays === 0) {
    event.response.frontmatter.status = 'Due Today';
    event.response.frontmatter.priority = 'High';
} else if (diffDays <= 3) {
    event.response.frontmatter.status = 'Upcoming';
    event.response.frontmatter.priority = 'Medium';
} else {
    event.response.frontmatter.status = 'Scheduled';
    event.response.frontmatter.priority = 'Low';
}

```

## Example 4: Calculate Reading Time

This hook estimates reading time based on word count:

```javascript
// When word_count changes
const wordCount = parseInt(event.request.newValue) || 0;
// Assume average reading speed of 200 words per minute
const readingMinutes = Math.ceil(wordCount / 200);

event.response.frontmatter.reading_time = readingMinutes;

// Also update a reading time category
if (readingMinutes <= 1) {
    event.response.frontmatter.reading_category = 'Quick Read';
} else if (readingMinutes <= 5) {
    event.response.frontmatter.reading_category = 'Short Read';
} else if (readingMinutes <= 15) {
    event.response.frontmatter.reading_category = 'Medium Read';
} else {
    event.response.frontmatter.reading_category = 'Long Read';
}
```

## Best Practices
1. **Handle Null Values**: Check for undefined or null values
2. **Return the Event**: The hook will return the event by default, so ensure you return the modified event
3. **Use Console.log**: For debugging, add console.log statements
4. **Prevent Infinite Loops**: Be careful not to create circular references
