import { EventBroker, type IOEvent } from '../src';

type AuthEvents = {
  'auth:login:attempt': { username: string };
  'auth:login:success': { userId: string; username: string; token: string };
  'auth:login:failure': { username: string; reason: string };
  'auth:logout': { userId: string };
  /**
   * A request/response event.
   *
   * The return type is only meaningful to `call`, which is what makes this a
   * question rather than a notification: a listener here produces an answer
   * instead of reacting to a fact.
   */
  'auth:check:password': IOEvent<{ username: string; password: string }, boolean>;
};

class AuthService {
  private events = new EventBroker<AuthEvents>({ name: 'broker' });
  private users = [
    { id: '1', username: 'user1', password: 'pass1' },
    { id: '2', username: 'user2', password: 'pass2' },
  ];

  constructor() {
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.events.on('auth:login:attempt', (data) => {
      console.log(`[${new Date().toISOString()}] Login attempt: ${data.username}`);
    });

    // The answerable event. Every listener registered here is a check.
    this.events.on('auth:check:password', (data) => {
      const user = this.users.find((u) => u.username === data.username);
      return user ? user.password === data.password : false;
    });

    this.events.on('auth:login:success', (data) => {
      console.log(`[${new Date().toISOString()}] Login successful: ${data.username}`);
    });

    this.events.on('auth:login:failure', (data) => {
      console.log(`[${new Date().toISOString()}] Login failed: ${data.username} - ${data.reason}`);
    });

    this.events.on('auth:logout', (data) => {
      console.log(`[${new Date().toISOString()}] User logged out: ${data.userId}`);
    });
  }

  /**
   * Asks the broker whether these credentials are good, and returns the answer.
   *
   * No strategy: `call` returns the *first* listener's result, typed `boolean`
   * from the `IOEvent`. Pass `'all'` to collect every listener's answer.
   */
  public verify(username: string, password: string): boolean {
    const answer = this.events.call('auth:check:password', { username, password });
    console.log(`verify(${username}) →`, answer);
    return answer;
  }

  public async login(
    username: string,
    password: string,
  ): Promise<{
    success: boolean;
    userId?: string;
    token?: string;
    error?: string;
  }> {
    this.events.emit('auth:login:attempt', { username });

    await new Promise((resolve) => setTimeout(resolve, 500));

    // The broker owns the credential check — `login` only orchestrates.
    if (!this.verify(username, password)) {
      const reason = this.users.some((u) => u.username === username) ? 'Invalid password' : 'User not found';

      this.events.emit('auth:login:failure', {
        username,
        reason,
      });

      return { success: false, error: reason };
    }

    const user = this.users.find((u) => u.username === username)!;

    const token = `token_${Math.random().toString(36).substring(2)}`;

    this.events.emit('auth:login:success', {
      userId: user.id,
      username: user.username,
      token,
    });

    return {
      success: true,
      userId: user.id,
      token,
    };
  }

  public logout(userId: string): void {
    this.events.emit('auth:logout', { userId });
  }

  public async waitForAuthentication(timeout: number = 5000): Promise<boolean> {
    console.log(`Waiting for authentication (timeout: ${timeout}ms)...`);

    try {
      const authData = await this.events.watch('auth:login:success', timeout);
      console.log(`Authentication detected for user: ${authData.username}`);
      return true;
    } catch (error) {
      console.log('Authentication wait timed out');
      return false;
    }
  }

  public getEvents(): EventBroker<AuthEvents> {
    return this.events;
  }

  public shutdown(): void {
    this.events.shutdown();
  }
}

async function runDemo() {
  console.log('----- Authentication Service Demo -----');

  const authService = new AuthService();

  authService.getEvents().on('auth:login:success', (data) => {
    console.log(`TOKEN: ${data.token}`);
  });

  const waitPromise = authService.waitForAuthentication(3000);

  console.log('\n0. Asking the broker a question with call():');
  console.log('   correct   →', authService.verify('user1', 'pass1'));
  console.log('   incorrect →', authService.verify('user1', 'nope'));

  console.log('\n1. Attempting login with incorrect password:');
  const failResult = await authService.login('user1', 'wrongpass');
  console.log('Login result:', failResult);

  console.log('\n2. Attempting login with correct credentials:');
  const successResult = await authService.login('user1', 'pass1');
  console.log('Login result:', successResult);

  const waitResult = await waitPromise;
  console.log('Wait result:', waitResult);

  console.log('\n3. Logging out user:');
  authService.logout(successResult?.userId!);

  authService.shutdown();

  console.log('\nDemo completed');
}

runDemo();

/* Expected Output:

----- Authentication Service Demo -----

0. Asking the broker a question with call():
verify(user1) → true
   correct   → true
verify(user1) → false
   incorrect → false

1. Attempting login with incorrect password:
[timestamp] Login attempt: user1
verify(user1) → false
[timestamp] Login failed: user1 - Invalid password
Login result: { success: false, error: 'Invalid password' }

2. Attempting login with correct credentials:
[timestamp] Login attempt: user1
verify(user1) → true
[timestamp] Login successful: user1
TOKEN: token_abc123def456
Login result: { success: true, userId: '1', token: 'token_abc123def456' }
Waiting for authentication (timeout: 3000ms)...
Authentication detected for user: user1
Wait result: true

3. Logging out user:
[timestamp] User logged out: 1

Demo completed
*/
