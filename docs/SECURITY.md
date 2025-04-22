# Security Policy

## Supported Versions

| Version     | Supported |
| ----------- | --------- |
| 1.0.0-alpha | ✅ Yes    |

## Security Considerations for @glandjs/events

`@glandjs/events` is a lightweight, dependency-free event system designed to enable modular and scalable communication across application layers. While the package itself does not manage I/O or perform network operations, there are still key security practices to consider:

### General Guidelines

- **Trust Boundaries**: Only emit and listen to events within trusted modules. Avoid exposing event emitters or listeners across untrusted boundaries without proper validation.

- **Input Handling**: Sanitize and validate any data passed through events, especially if they originate from user input or external services.

- **Error Propagation**: Use centralized error handling for event-driven flows. Improper propagation of errors can lead to unintended application states or data leaks.

- **Isolation**: Keep internal system events separate from external-facing ones. This helps reduce the attack surface and avoid leaking internal behavior.

### Security Best Practices

1. **Keep Dependencies Minimal**
   `@glandjs/events` has zero runtime dependencies to minimize vulnerability exposure.

2. **Audit Event Flows**
   Periodically review event names, listeners, and payloads to ensure consistency, proper encapsulation, and lack of sensitive data exposure.

3. **Logging with Caution**
   Avoid logging full event payloads in production environments, especially if they may include sensitive information.

4. **Immutable Payloads**
   When possible, treat event payloads as immutable to prevent unintended side effects in other listeners.

## Reporting a Vulnerability

We take security seriously. If you discover a vulnerability in `@glandjs/events`, please:

1. **Do not disclose publicly**.
2. Email [bitsgenix@gmail.com](mailto:bitsgenix@gmail.com) with the subject `[SECURITY]`.
3. Include:
   - Description of the issue
   - Steps to reproduce
   - Potential impact
   - Recommended fix (optional)

We aim to respond within 48 hours and will coordinate a fix and disclosure timeline responsibly.
