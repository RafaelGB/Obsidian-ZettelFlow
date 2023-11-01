---
zettelFlowSettings:
  root: false
  label: Select a priority level
  childrenHeader: ""
  actions:
    - type: selector
      options:
        P1: Max level of priority
        P2: Urgently
        P3: Moderate
        P4: Minor
        P5: Trivial
      key: priority
      label: Priority of the task
      zone: frontmatter
      defaultOption: P3
      isAction: true
      hasUI: true
---
