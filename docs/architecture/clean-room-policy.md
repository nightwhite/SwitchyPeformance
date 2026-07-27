# Clean-Room Policy

## Purpose

SwitchyPeformance aims for feature-level compatibility with established proxy-profile workflows while remaining an independent MIT project.

## Allowed reference use

- Observe user-visible behavior in a running extension.
- Record an input, user action, and externally visible result in a behavior contract.
- Read public documentation and browser API documentation.
- Design a new data model, algorithm, interface, and test based on the recorded contract.

## Prohibited material

- Copying or adapting source code, stylesheets, HTML, assets, icons, translations, comments, tests, build output, or generated PAC code from a reference project.
- Importing any reference package, source tree, or dependency into the build.
- Committing reference material, screenshots used as shipped assets, or mechanically derived source.
- Reusing reference string catalogs or code structure as an implementation template.

## Working method

1. Describe a user-visible behavior without quoting reference code.
2. Write an independent contract test that captures the behavior.
3. Implement against the contract using this repository's data model and architecture.
4. Review every change for copied material and for generated artifacts that expose reference implementation details.

## Local reference isolation

If temporary reference material is needed, it lives under `.reference/`, which Git ignores. It is never built, imported, packaged, published, or committed. The product must build and test after the directory is deleted.

## UI compatibility

The product may preserve familiar workflows, screen hierarchy, and actions. Components, layouts, icons, wording, styles, and interaction code are independently designed and authored here.
