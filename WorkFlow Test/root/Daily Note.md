---
zettelFlowSettings:
  root: false
  actions:
    - type: script
      hasUI: false
      description: Set title of today
      code: |-
        const today = moment().format("YYYY-MM-DD");
        note.setTitle(today);
  label: Daily
  childrenHeader: ""
  targetFolder: Daily
---
