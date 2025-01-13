<< [[{{previousDay}}|Previous day]] | [[{{nextDay}}|Next day]] >>
## Workflow
### What did I do [[{{previousDay}}|the last day]]?

### What I am going to do today?

### What's in my way?

## TO DO

{{rolloverTodos}}

### Current tasks
```dataview
TABLE deadline
FROM #task | #epic
WHERE status="🧐 On progress"
SORT deadline ASC
```
### Inbox backlog tasks
```dataview
TABLE deadline,tags
FROM #task | #epic    
WHERE status="📃 Backlog"
SORT deadline DESC
```
## Links to this day

```dataview

TABLE tags, file.ctime

WHERE dailyLink=[[{{today}}]]

SORT file.ctime DESC

```

---

<< [[{{previousDay}}|Previous day]] | [[{{nextDay}}|Next day]] >>