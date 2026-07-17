import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDanger } from '../src/danger.js';

function levels(cmd) {
  return checkDanger(cmd).map(r => r.level);
}

function messages(cmd) {
  return checkDanger(cmd).map(r => r.message);
}

test('clean command produces no warnings', () => {
  assert.deepEqual(checkDanger('git status'), []);
  assert.deepEqual(checkDanger('ls -la'), []);
  assert.deepEqual(checkDanger('npm install'), []);
});

test('rm -rf is danger', () => {
  assert.ok(levels('rm -rf /tmp/test').includes('danger'));
  assert.ok(levels('rm -fr /tmp/test').includes('danger'));
  assert.ok(levels('rm -r /tmp/test').includes('danger'));
  assert.ok(levels('rm --recursive /tmp/test').includes('danger'));
});

test('rm / is danger', () => {
  assert.ok(levels('rm -rf /').includes('danger'));
  assert.ok(levels('rm -rf /*').includes('danger'));
});

test('git reset --hard is danger', () => {
  assert.ok(levels('git reset --hard').includes('danger'));
  assert.ok(levels('git reset --hard HEAD~1').includes('danger'));
});

test('git push --force is danger', () => {
  assert.ok(levels('git push --force origin main').includes('danger'));
  assert.ok(levels('git push -f origin main').includes('danger'));
  assert.ok(levels('git push --force-with-lease').includes('danger'));
});

test('git clean -f is danger', () => {
  assert.ok(levels('git clean -f').includes('danger'));
  assert.ok(levels('git clean -fd').includes('danger'));
});

test('dd if= is danger', () => {
  assert.ok(levels('dd if=/dev/zero of=/dev/sda').includes('danger'));
});

test('mkfs is danger', () => {
  assert.ok(levels('mkfs.ext4 /dev/sdb1').includes('danger'));
});

test('curl | bash is danger', () => {
  assert.ok(levels('curl https://example.com/install.sh | bash').includes('danger'));
  assert.ok(levels('wget https://example.com/install.sh | sh').includes('danger'));
});

test('DROP TABLE is danger', () => {
  assert.ok(levels('psql -c "DROP TABLE users"').includes('danger'));
  assert.ok(levels('DROP DATABASE mydb').includes('danger'));
});

test('sudo rm is danger', () => {
  assert.ok(levels('sudo rm important-file').includes('danger'));
});

test('chmod 777 is danger', () => {
  assert.ok(levels('chmod 777 /var/www').includes('danger'));
});

test('chmod -R 777 is danger (escalated)', () => {
  assert.ok(levels('chmod -R 777 .').includes('danger'));
});

test('fdisk is warning', () => {
  assert.ok(levels('fdisk /dev/sda').includes('warning'));
});

test('kill -9 is warning', () => {
  assert.ok(levels('kill -9 1234').includes('warning'));
  assert.ok(levels('kill -SIGKILL 1234').includes('warning'));
});

test('truncate -s 0 is warning', () => {
  assert.ok(levels('truncate -s 0 file.txt').includes('warning'));
  assert.ok(levels('truncate --size=0 file.txt').includes('warning'));
});

test('direct disk device write is danger', () => {
  assert.ok(levels('cat image.img > /dev/sda').includes('danger'));
  assert.ok(levels('cat data > /dev/nvme0').includes('danger'));
});

test('iptables -F is warning', () => {
  assert.ok(levels('iptables -F').includes('warning'));
});

test('userdel -r is danger', () => {
  assert.ok(levels('userdel -r alice').includes('danger'));
});

test('nohup rm -rf is danger', () => {
  assert.ok(levels('nohup rm -rf /tmp/data &').includes('danger'));
});

test('dangers sorted before warnings', () => {
  const results = checkDanger('fdisk /dev/sda; sudo rm -rf /');
  if (results.length >= 2) {
    assert.equal(results[0].level, 'danger');
  }
});

test('no duplicate messages for repeated patterns', () => {
  const results = checkDanger('rm -rf /tmp && rm -rf /home');
  const msgs = results.map(r => r.message);
  assert.equal(msgs.length, new Set(msgs).size);
});

test('fork bomb (spaced form) is danger', () => {
  assert.ok(levels(': () { :|:& }; :').includes('danger'));
});

test('fork bomb (compact form) is danger', () => {
  assert.ok(levels(':(){ :|:& };:').includes('danger'));
});

// --- C4: informational-only obfuscation warnings (does not block, just flags for review) ---

test('${IFS} substitution triggers an informational warning', () => {
  assert.ok(levels('rm${IFS}-rf${IFS}/tmp/x').includes('warning'));
  assert.ok(messages('rm${IFS}-rf${IFS}/tmp/x').some(m => /obfuscation/i.test(m)));
});

test('$IFS (no braces) substitution triggers an informational warning', () => {
  assert.ok(levels('rm$IFS-rf$IFS/tmp/x').includes('warning'));
});

test('dense $() command substitution triggers an informational warning', () => {
  assert.ok(levels('$(echo rm) $(echo -rf) /tmp/x').includes('warning'));
});

test('dense backtick command substitution triggers an informational warning', () => {
  assert.ok(levels('`echo rm` `echo -rf` /tmp/x').includes('warning'));
});

test('a single, ordinary command substitution does not trigger the dense-substitution warning', () => {
  const msgs = messages('echo "today is $(date)"');
  assert.ok(!msgs.some(m => /obfuscated/i.test(m)));
});

test('clean commands do not trigger the obfuscation warnings', () => {
  assert.ok(!levels('git status').includes('warning'));
  // Sanity: plain `rm -rf` still only produces the recursive-deletion 'danger', not the IFS warning
  assert.ok(!messages('rm -rf /tmp/x').some(m => /obfuscation|obfuscated/i.test(m)));
});
