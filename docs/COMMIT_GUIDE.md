# Commit Message Guidelines

This project follows the [Conventional Commits](https://www.conventionalcommits.org/) specification for commit messages. This leads to **more readable messages** that are easy to follow when looking through the project history and enables automatic generation of changelogs.

## Commit Message Format

Each commit message consists of a **header**, a **body**, and a **footer**. The header has a special format that includes a **type**, an optional **scope**, and a **subject**:

```
<type>(<scope>): <subject>
<BLANK LINE>
<body>
<BLANK LINE>
<footer>
```

### Type

Must be one of the following:

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **perf**: A code change that improves performance
- **test**: Adding missing tests or correcting existing tests
- **build**: Changes that affect the build system or external dependencies
- **ci**: Changes to our CI configuration files and scripts
- **chore**: Other changes that don't modify src or test files
- **revert**: Reverts a previous commit

### Scope

The scope should be the name of the module affected (as perceived by the person reading the changelog generated from commit messages).

### Subject

The subject contains a succinct description of the change:

- Use the imperative, present tense: "change" not "changed" nor "changes"
- Don't capitalize the first letter
- No dot (.) at the end

### Body

The body should include the motivation for the change and contrast this with previous behavior.

### Footer

The footer should contain any information about **Breaking Changes** and is also the place to reference GitHub issues that this commit **Closes**.

## Examples

```
feat(broker): add support for wildcard event patterns

Implement wildcard pattern matching for event names to allow subscribers to listen to
multiple events with a single subscription. The pattern uses * for single segment wildcards
and ** for multi-segment wildcards.

BREAKING CHANGE: Previously, exact matches were the only supported pattern
```

```
fix(emitter): prevent memory leak in event listeners

Fixed an issue where event listeners were not being properly removed when unsubscribing,
leading to a memory leak during long-running processes.

Closes #123
```

```
docs(api): update README with new event pattern syntax

Added documentation and examples for the new wildcard pattern matching feature.
```

## Signing Commits

All commits to this repository must be signed with GPG. This adds an extra layer of verification to ensure the authenticity of commits.

To set up GPG signing:

1. [Generate a GPG key](https://docs.github.com/en/authentication/managing-commit-signature-verification/generating-a-new-gpg-key)
2. [Add the GPG key to your GitHub account](https://docs.github.com/en/authentication/managing-commit-signature-verification/adding-a-gpg-key-to-your-github-account)
3. [Tell Git about your signing key](https://docs.github.com/en/authentication/managing-commit-signature-verification/telling-git-about-your-signing-key)
4. Configure Git to sign commits globally:
   ```bash
   git config --global commit.gpgsign true
   ```

Our Husky setup will automatically ensure your commits are signed.
