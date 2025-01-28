<< [[{{previousDay}}|Previous day]] | [[{{nextDay}}|Next day]] >>
## Workflow
### What did I do [[{{previousDay}}|the last day]]?

### What I am going to do today?

### What's in my way?

## TO DO

{{rolloverTodos}}

### Current tasks
```dataviewjs
const tasks = dv.pages('#task or #epic')
    .where(p => p.status === "🧐 On progress")
    .sort(p => p.deadline, 'asc');

for (const task of tasks) {
    dv.header(4, task.file.link);

    // Mostrar deadline si existe
    if (task.deadline) {
        dv.paragraph(`**Deadline:** ${task.deadline.toRelative()}`);
    }

    if (task.tags) {
        const tagString = task.tags.join(', ');
        dv.paragraph(`**Tags:** ${tagString} (${task.tags.includes('task') ? 'Task' : 'Epic'})`);
    }

    if (task.purpose) {
        dv.paragraph(`**Purpose:** ${task.purpose}`);
    }

    if (task.file.tasks.length > 0) {
        const incompleteTasks = task.file.tasks.filter(t => !t.completed);
        if (incompleteTasks.length > 0) {
            dv.paragraph("**Unfinished Tasks:**");
            dv.taskList(incompleteTasks, task.file.path);
        }
    }
    dv.paragraph('---');
}
```
### Inbox tasks
```dataview
TABLE deadline, purpose, status
FROM #task | #epic    
WHERE status 
AND status!="✅ resolved" AND status!="🧐 On progress"
SORT deadline ASC
```
### Task resolved the last 30 days
```dataview
TABLE wasResolved,deadline, purpose, status
FROM #task | #epic    
WHERE status 
AND status="✅ resolved"
AND wasResolved
AND wasResolved >= date(today) - dur(30 days)
SORT deadline ASC
```
## Links to this day

```dataview

TABLE tags, file.ctime

WHERE dailyLink=[[{{today}}]]

SORT file.ctime DESC

```

---

<< [[{{previousDay}}|Previous day]] | [[{{nextDay}}|Next day]] >>