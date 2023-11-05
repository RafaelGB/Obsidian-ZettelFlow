---
zettelFlowSettings:
  label: Add section h1 (body)
  element:
    type: prompt
    placeholder: write the name of your h1 section
    key: section
    label: Section H1
    zone: body
  root: false
  childrenHeader: ""
  actions:
    - type: prompt
      placeholder: write the name of your h1 section
      key: section
      label: Section H1
      zone: body
      description: Add an H1 section
---
# {{section}}