---
zettelFlowSettings:
  root: false
  label: Required information
  childrenHeader: ""
  optional: false
  actions:
    - type: selector
      key: priority
      label: choose a priority
      options:
        "1": The most important thing
        "2": Urgent
        "3": Moderate
        "4": Minor
        "5": Trivial
      defaultOption: "3"
      hasUI: true
      description: Priority of the task
    - type: prompt
      key: description
      label: description of the task
      placeholder: |-
        write your objetive 
        here...
      hasUI: true
      description: Description of the task
      zone: body
    - type: backlink
      hasDefault: true
      defaultFile: WorkFlow Test/kanban/Backlinks Kanban.md
      defaultHeading:
        heading: Link 1
        level: 2
        position:
          start:
            line: 6
            col: 0
            offset: 32
          end:
            line: 6
            col: 9
            offset: 41
      hasUI: false
      insertPattern: "- [ ] {{wikilink}}"
      description: Add task to Kanban
    - type: calendar
      description: Deadline of the task
      key: deadline
      label: Deadline
      hasUI: true
  targetFolder: zettelFlow/tasks
---
# Description
{{description}}