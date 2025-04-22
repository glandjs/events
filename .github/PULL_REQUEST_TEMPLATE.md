# Pull Request Template

## Description

Please provide a clear and concise description of your changes, including the problem it solves and the motivation behind it.

## Type of Change

<!-- Check all that apply -->

Please check the option(s) that apply to this PR:

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] Feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature causing a change in existing functionality)
- [ ] Refactoring (no functional changes, no API changes)
- [ ] Documentation update
- [ ] Build or CI/CD related changes
- [ ] Performance improvement
- [ ] Event flow change
- [ ] Other (please describe):

## Related Issues

Please link any related issues or provide issue numbers (e.g., `Fixes #123`).

## Checklist

<!-- Check all that apply -->

- [ ] I have read the [CONTRIBUTING](../docs/CONTRIBUTING.md) guidelines.
- [ ] My code follows the event-driven architecture and design principles of Gland.
- [ ] I have written unit tests for my changes and they pass locally.
- [ ] I have verified that new and existing tests pass locally after my changes.
- [ ] I have updated any relevant documentation or added new documentation if necessary.
- [ ] My changes don't introduce new warnings or errors.
- [ ] I have updated the examples if applicable.
- [ ] I have confirmed that my branch is up-to-date with the base branch (`main`).

### Breaking Changes

- [ ] Yes (please describe the impact and migration path).
- [ ] No

### Documentation Impact

- [ ] Requires updates to event flow diagrams.
- [ ] New event handler API documentation needed.
- [ ] No documentation changes required.

---

## Current Behavior

Describe the current behavior before your changes. If applicable, provide links to related issues or describe the problems being solved.

## New Behavior

Describe the new behavior introduced by this PR. What does it improve or fix?

---

## Event Flow Changes

<!-- If your PR affects the event flow, describe how it changes the architecture of the event broker. -->

- [ ] I have considered the impact on event handlers, channels, and listeners.
- [ ] The new event flow has been tested with examples.
- [ ] I have updated event flow diagrams if necessary.

---

## Additional Information

<!-- Provide any other relevant details about this PR, such as implementation considerations, limitations, or future work. -->
