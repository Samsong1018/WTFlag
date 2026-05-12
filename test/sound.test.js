import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playSound } from '../src/sound.js';

test('playSound does not throw for stop event', () => {
  assert.doesNotThrow(() => playSound('stop'));
});

test('playSound does not throw for notification event', () => {
  assert.doesNotThrow(() => playSound('notification'));
});

test('playSound does not throw for unknown event', () => {
  assert.doesNotThrow(() => playSound('unknown-event'));
});

test('playSound does not throw with no arguments', () => {
  assert.doesNotThrow(() => playSound());
});
