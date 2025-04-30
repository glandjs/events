import { EventBroker } from '../src';

interface AppEvents {
  'user:login': { id: string; username: string };
  'notification:new': { id: string; message: string };
  'data:loaded': { source: string; items: any[] };
}

// =====================================================
// Example 1: Basic event subscription and emission
// =====================================================
console.log('===== Example 1: Basic event handling =====');

const events = new EventBroker<AppEvents>({ name: 'Broker' });

events.on('user:login', (data) => {
  console.log(`User logged in: ${data.username} (${data.id})`);
});
events.emit('user:login', { id: 'user123', username: 'john_doe' });

/* Expected output:
===== Example 1: Basic event handling =====
User logged in: john_doe (user123)
*/

// =====================================================
// Example 2: Multiple subscribers for the same event
// =====================================================
console.log('\n===== Example 2: Multiple subscribers =====');

events.on('notification:new', (data) => {
  console.log(`Notification ${data.id}: ${data.message}`);
});

events.on('notification:new', (data) => {
  console.log(`ALERT: ${data.message}`);
});

events.emit('notification:new', { id: 'notif1', message: 'New friend request' });

/* Expected output:
===== Example 2: Multiple subscribers =====
Notification notif1: New friend request
ALERT: New friend request
*/

// =====================================================
// Example 3: Unsubscribing from events
// =====================================================
console.log('\n===== Example 3: Unsubscribing =====');

const dataHandler = (data) => {
  console.log(`Data loaded from ${data.source}: ${data.items.length} items`);
};

events.on('data:loaded', dataHandler);

events.emit('data:loaded', { source: 'api', items: [1, 2, 3] });
events.off('data:loaded', dataHandler);
events.emit('data:loaded', { source: 'cache', items: [4, 5, 6, 7] });

/* Expected output:
===== Example 3: Unsubscribing =====
Data loaded from api: 3 items
*/

// =====================================================
// Example 4: Using the watch method to wait for events
// =====================================================
console.log('\n===== Example 4: Watching for events =====');

async function waitForLogin() {
  console.log('Waiting for user login...');
  try {
    const userData = await events.watch('user:login', 2000);
    console.log(`User ${userData.username} logged in after watching!`);
  } catch (error: any) {
    console.error('Login watch timed out:', error.message);
  }
}
waitForLogin();
setTimeout(() => {
  events.emit('user:login', { id: 'user456', username: 'jane_smith' });
}, 1000);

/* Expected output:
===== Example 4: Watching for events =====
Waiting for user login...
User jane_smith logged in after watching!
*/

// =====================================================
// Example 5: Using watch option with on method
// =====================================================
console.log('\n===== Example 5: On with watch option =====');

async function loginWithWatch() {
  console.log('Setting up login watcher with on()...');

  try {
    const userData = await events.on('user:login', null, { watch: true, timeout: 2000 });
    console.log(`On+watch detected login for: ${userData.username}`);
  } catch (error: any) {
    console.error('Login on+watch timed out:', error.message);
  }
}

loginWithWatch();

setTimeout(() => {
  events.emit('user:login', { id: 'user789', username: 'bob_jackson' });
}, 1000);

/* Expected output:
===== Example 5: On with watch option =====
Setting up login watcher with on()...
On+watch detected login for: bob_jackson
*/

// =====================================================
// Example 6: Using defaultValue with watch timeout
// =====================================================
console.log('\n===== Example 6: Default values on timeout =====');

async function watchWithDefault() {
  console.log('Watching for notification with default value...');

  const notification = await events.on('notification:new', null, {
    watch: true,
    timeout: 1000,
    defaultValue: { id: 'default', message: 'No notifications' },
  });
  console.log(`Got notification: ${notification.message}`);
}

watchWithDefault();

/* Expected output:
===== Example 6: Default values on timeout =====
Watching for notification with default value...
Got notification: No notifications
*/
