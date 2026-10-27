import assert from 'node:assert/strict';
import {
  getOnboardingTestIdentity,
  isOnboardingTestIdentity,
  normalizeTestMobile,
} from '../src/utils/onboardingTestIdentity.js';

assert.equal(normalizeTestMobile('99446 21246'), '9944621246');
assert.equal(normalizeTestMobile('919944621246'), '9944621246');

const id = getOnboardingTestIdentity();
assert.equal(id.mobile, '9944621246');
assert.equal(id.email, 'dinesh.kumar@awign.com');

assert.equal(isOnboardingTestIdentity('9944621246', 'dinesh.kumar@awign.com'), true);
assert.equal(isOnboardingTestIdentity('99446 21246', 'Dinesh.Kumar@awign.com'), true);
assert.equal(isOnboardingTestIdentity('9944621246', 'other@awign.com'), false);
assert.equal(isOnboardingTestIdentity('9999999999', 'dinesh.kumar@awign.com'), false);

console.log('smoke-onboarding-test-identity: ok');
