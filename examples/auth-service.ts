import { EventBroker, type IOEvent } from '../src';

type AuthEvents = {
  'auth:login:attempt': { username: string };
  'auth:login:success': { userId: string; username: string; token: string };
  'auth:login:failure': { username: string; reason: string };
  'auth:logout': { userId: string };
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
      return { f: 'hello world' };
    });
    const hello = this.events.call('auth:login:attempt', { username: 'hello world' }, 'first');
    console.log('hello', hello);

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

    const user = this.users.find((u) => u.username === username);

    if (!user) {
      this.events.emit('auth:login:failure', {
        username,
        reason: 'User not found',
      });

      return { success: false, error: 'User not found' };
    }

    if (user.password !== password) {
      this.events.emit('auth:login:failure', {
        username,
        reason: 'Invalid password',
      });

      return { success: false, error: 'Invalid password' };
    }

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

1. Attempting login with incorrect password:
[2025-04-27T12:34:56.789Z] Login attempt: user1
[2025-04-27T12:34:57.289Z] Login failed: user1 - Invalid password
Login result: { success: false, error: 'Invalid password' }

2. Attempting login with correct credentials:
[2025-04-27T12:34:57.290Z] Login attempt: user1
[2025-04-27T12:34:57.790Z] Login successful: user1
TOKEN: token_abc123def456
Login result: { success: true, userId: '1', token: 'token_abc123def456' }
Waiting for authentication (timeout: 3000ms)...
Authentication detected for user: user1
Wait result: true

3. Logging out user:
[2025-04-27T12:34:57.792Z] User logged out: 1

Demo completed
*/
